import { Rng, clamp, approach } from './rng';
import type { FishDefinition } from './data';

/** GDD Phụ lục B */
export type FightPhase = 'hooked' | 'run' | 'struggle' | 'tired' | 'final_burst' | 'surge' | 'landing' | 'landed' | 'escaped';
export type EscapeReason = 'line_break' | 'slack' | 'snag' | 'line_out' | 'landing_timeout';

export interface FightInput {
  reel: number; // 0..1
  release: number; // 0..1
  steer: number; // -1..1  rod angle left/right
}

export interface FightGear {
  rodPower: number;
  reelSpeed: number;
  drag: number; // 0..1
  capacity: number; // m
  lineStrength: number;
}

export interface FightState {
  phase: FightPhase;
  tension: number; // 0..100
  fishStamina: number; // 0..100
  lineIntegrity: number; // 0..100
  dist: number; // m from angler
  lateral: number; // m
  fishDirection: number; // -1..1 heading sideways
  rodAngle: number;
  reelInput: number;
  dragSlipping: boolean;
  burst: boolean;
  leverage: number; // 0..1, how well the rod opposes the fish
  jumpNow: boolean; // one-frame flag for the view
  escapeReason?: EscapeReason;
  message?: string; // one-frame hint for HUD
  elapsed: number;
  redTime: number; // seconds spent in red zone (quality)
}

export const ESCAPE_TEXT: Record<EscapeReason, string> = {
  line_break: 'Đứt dây! Lực căng ở vùng đỏ quá lâu — hãy nhả dây khi cá bùng lực.',
  slack: 'Cá tuột lưỡi vì dây chùng quá lâu — giữ dây hơi căng.',
  snag: 'Cá lao vào bụi cỏ/chướng ngại — nghiêng cần ngược hướng cá sớm hơn.',
  line_out: 'Hết dây trên máy — đừng nhả dây quá lâu khi cá chạy.',
  landing_timeout: 'Cá vùng lên khi ở sát bờ — vớt nhanh hơn khi có tín hiệu.',
};

export class FightSim {
  s: FightState;
  private power: number;
  private speed: number;
  private staminaSec: number;
  private phaseT = 0;
  private phaseDur = 0;
  private dirT = 0;
  private slackT = 0;
  private landingT = 0;
  private finalDone = false;
  private landingMisses = 0;
  private surgeMarks: number[];
  private maxLateral = 9;

  constructor(
    public fish: FishDefinition,
    public weight: number,
    public gear: FightGear,
    startDist: number,
    startLateral: number,
    private rng: Rng,
    private coverRisk: number, // zone obstacles 0..1
  ) {
    const wf = weight / fish.maxWeight;
    this.power = fish.fightingPower * (0.55 + 0.55 * wf);
    this.speed = fish.speed * (0.7 + 0.4 * wf);
    this.staminaSec = fish.stamina * (0.7 + 0.6 * wf);
    this.surgeMarks = fish.fightStyle === 'legendary' ? [66, 33] : [];
    this.s = {
      phase: 'hooked', tension: 55, fishStamina: 100, lineIntegrity: 100, dist: startDist, lateral: startLateral,
      fishDirection: rng.chance(0.5) ? 1 : -1, rodAngle: 0, reelInput: 0, dragSlipping: false, burst: true,
      leverage: 0.5, jumpNow: false, elapsed: 0, redTime: 0,
    };
    this.phaseDur = 0.7;
    this.dirT = this.newDirTime();
  }

  private newDirTime() {
    const fast = this.fish.fightStyle === 'fast' || this.fish.fightStyle === 'eel';
    return fast ? this.rng.range(0.9, 2.2) : this.rng.range(2.5, 5.5);
  }

  private setPhase(p: FightPhase, dur = 0) {
    this.s.phase = p;
    this.phaseT = 0;
    this.phaseDur = dur;
  }

  /** Multiplier of fish pull for the current phase */
  private phaseMult(): number {
    switch (this.s.phase) {
      case 'hooked': return 1.5;
      case 'run': return 1.15;
      case 'struggle': return this.s.burst ? 1.55 : 0.7;
      case 'tired': return 0.32;
      case 'final_burst': return 1.7;
      case 'surge': return 1.45;
      case 'landing': return 0.2;
      default: return 0;
    }
  }

  update(dt: number, inp: FightInput): FightState {
    const s = this.s;
    const r = this.rng;
    s.jumpNow = false;
    s.message = undefined;
    if (s.phase === 'landed' || s.phase === 'escaped') return s;
    s.elapsed += dt;
    this.phaseT += dt;
    s.rodAngle = approach(s.rodAngle, inp.steer, 8, dt);
    s.reelInput = inp.reel;

    // ---- phase machine
    switch (s.phase) {
      case 'hooked':
        if (this.phaseT > this.phaseDur) this.setPhase('run', r.range(1.8, 3.6) * (0.7 + this.power * 0.4));
        break;
      case 'run':
        if (this.phaseT > this.phaseDur) this.setPhase('struggle');
        break;
      case 'struggle':
        if (s.burst && this.phaseT > this.phaseDur) {
          s.burst = false;
          this.phaseT = 0;
          this.phaseDur = r.range(1.5, 3.5);
        } else if (!s.burst && this.phaseT > this.phaseDur && r.chance((this.fish.burstFrequency / 10) * dt * 2.5)) {
          s.burst = true;
          this.phaseT = 0;
          this.phaseDur = r.range(0.6, 1.3);
          s.fishDirection = r.chance(0.6) ? -s.fishDirection : s.fishDirection;
          if (this.fish.jumps && r.chance(0.35)) s.jumpNow = true;
        }
        if (s.fishStamina < 25) this.setPhase('tired');
        break;
      case 'tired':
        if (!this.finalDone && s.dist < 7 && s.dist > 3) {
          this.finalDone = true;
          if (r.chance(0.75)) {
            this.setPhase('final_burst', r.range(1.0, 1.6));
            s.fishDirection = -s.fishDirection;
            s.message = 'Cá bùng lực lần cuối!';
            if (this.fish.jumps) s.jumpNow = true;
          }
        }
        if (s.fishStamina > 45) this.setPhase('struggle');
        break;
      case 'final_burst':
      case 'surge':
        if (this.phaseT > this.phaseDur) this.setPhase(s.fishStamina < 25 ? 'tired' : 'struggle');
        break;
      case 'landing':
        this.landingT += dt;
        if (this.landingT > 4.5) {
          this.landingT = 0;
          if (++this.landingMisses >= 3) return this.escape('landing_timeout');
          s.fishStamina = Math.min(100, s.fishStamina + 22);
          s.dist += 2.5;
          s.burst = true;
          this.setPhase('struggle', 1.0);
          s.message = 'Cá vùng lên — vớt nhanh hơn!';
        }
        break;
    }
    for (let i = 0; i < this.surgeMarks.length; i++) {
      if (s.fishStamina < this.surgeMarks[i]) {
        this.surgeMarks.splice(i, 1);
        this.setPhase('surge', 2.4);
        s.fishStamina += 8;
        s.jumpNow = true;
        s.message = 'Cá huyền thoại vùng lên dữ dội!';
        break;
      }
    }
    if (s.phase !== 'landing' && s.dist <= 2.6 && s.fishStamina < 38 && s.phase !== 'final_burst' && s.phase !== 'surge') {
      this.setPhase('landing');
      this.landingT = 0;
    }

    // ---- direction changes
    this.dirT -= dt;
    if (this.dirT <= 0) {
      this.dirT = this.newDirTime();
      s.fishDirection = r.chance(0.65) ? -s.fishDirection : s.fishDirection;
      s.fishDirection *= r.range(0.6, 1);
    }
    const lim = Math.min(this.maxLateral, 2 + s.dist * 0.45);
    if (Math.abs(s.lateral) > lim * 0.9) s.fishDirection = -Math.sign(s.lateral) * Math.abs(s.fishDirection || 1);

    // ---- forces
    const stamF = 0.35 + 0.65 * (s.fishStamina / 100);
    const F = this.power * this.phaseMult() * stamF; // ~0..2.2
    // good technique: rod tilted to the side opposite the fish's run
    s.leverage = clamp(1 - Math.abs(s.rodAngle + s.fishDirection) / 2, 0, 1);
    const rodAbsorb = 1 / Math.sqrt(this.gear.rodPower);
    let target = (F * 52 * (1.15 - 0.45 * s.leverage) + inp.reel * (F * 34 + 14) - inp.release * 42) * rodAbsorb / this.gear.lineStrength;
    target = Math.max(0, target);
    // reel drag slips when the load is too high
    const dragCap = 80 + 16 * this.gear.drag;
    let slip = 0;
    s.dragSlipping = false;
    if (target > dragCap) {
      slip = (target - dragCap) * 0.06;
      target = dragCap + (target - dragCap) * 0.4;
      s.dragSlipping = true;
    }
    s.tension = clamp(approach(s.tension, target, 6, dt), 0, 100);

    // ---- distance / position
    const awaySpeed = this.speed * F * 0.55;
    const reelIn = inp.reel * this.gear.reelSpeed * 2.1 * clamp(1.05 - F * 0.45, 0.15, 1);
    const out = inp.release * 1.3 + slip;
    s.dist = Math.max(0.5, s.dist + (awaySpeed - reelIn + out) * dt);
    s.lateral += s.fishDirection * this.speed * 0.45 * F * dt;
    s.lateral -= s.lateral * 0.25 * s.leverage * inp.reel * dt;
    s.lateral = clamp(s.lateral, -lim, lim);

    // ---- stamina
    const drain = (100 / this.staminaSec) * (0.25 + 0.75 * (s.tension / 100)) * (0.5 + 0.9 * s.leverage) * Math.sqrt(this.gear.rodPower);
    s.fishStamina -= drain * dt * 0.55;
    if (s.tension < 12) s.fishStamina += 3.5 * dt; // fish rests when line is slack
    s.fishStamina = clamp(s.fishStamina, 0, 100);

    // ---- failure modes
    if (s.tension > 85) {
      s.redTime += dt;
      s.lineIntegrity -= ((s.tension - 85) * 2.2 + 6) * dt / this.gear.lineStrength;
    }
    if (s.lineIntegrity <= 0) return this.escape('line_break');
    if (s.tension < 6 && s.phase !== 'landing') {
      this.slackT += dt;
      if (this.slackT > 2.6) return this.escape('slack');
    } else this.slackT = Math.max(0, this.slackT - dt * 2);
    if ((s.phase === 'run' || (s.phase === 'struggle' && s.burst) || s.phase === 'final_burst') && s.leverage < 0.45) {
      const p = this.fish.obstacleSeeking * this.coverRisk * 0.22 * (1 - s.leverage);
      if (r.chance(p * dt)) return this.escape('snag');
    }
    if (s.dist > this.gear.capacity) return this.escape('line_out');
    return s;
  }

  private escape(reason: EscapeReason): FightState {
    this.s.phase = 'escaped';
    this.s.escapeReason = reason;
    return this.s;
  }

  /** Player presses "Vớt cá" */
  tryLand(): { ok: boolean; reason: string } {
    if (this.s.phase === 'landing') {
      this.s.phase = 'landed';
      return { ok: true, reason: '' };
    }
    if (this.s.dist < 4.5) return { ok: false, reason: this.s.fishStamina >= 38 ? 'Cá còn khỏe, chưa vớt được.' : 'Kéo cá lại gần hơn.' };
    return { ok: false, reason: 'Cá còn xa bờ.' };
  }

  /** 0..100 rating used in result card */
  quality(): number {
    const t = this.s.elapsed;
    const red = this.s.redTime / Math.max(1, t);
    return Math.round(clamp(100 - red * 160 - (100 - this.s.lineIntegrity) * 0.4, 5, 100));
  }
}

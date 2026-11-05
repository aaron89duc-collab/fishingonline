import { Rng, clamp, approach } from './rng';
import type { FishDefinition } from './data';
import { solveLine, type LineState } from './linePhysics';

/**
 * Fish Fight System — đấu sức với cá.
 * 5 core values: Hook Strength, Angler Balance, Line Tension, Fish Stamina, Landing Window.
 * Big fish are not "more HP": they pull harder on the angler's balance, behave differently
 * (state machine per archetype) and need suitable gear and technique.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Archetype = 'light' | 'heavy' | 'strategic' | 'bottom' | 'explosive';
export type Behavior = 'HOOKED' | 'RUNNING' | 'BURST' | 'TURNING' | 'DIVING' | 'SULKING' | 'JUMPING' | 'SHAKING' | 'RESTING' | 'FAKE_REST' | 'EXHAUSTED';
export type FightPhase = 'fighting' | 'landing' | 'landed' | 'escaped';
export type LandingWindow = 'none' | 'lunge' | 'turn' | 'tired';
export type EscapeReason = 'line_break' | 'hook_pull' | 'balance' | 'line_out' | 'snag' | 'net_fail';

export interface DifficultyProfile {
  label: string;
  balanceZone: number; // |balance offset| that still counts as stable
  fishTurn: number; // multiplier of direction changes / surprises
  react: number; // multiplier for reaction windows (hook timeline, tells, landing windows)
  guides: boolean; // visual helpers (ideal rod band, tells, net target)
  force: number; // fish pull multiplier
}
export const DIFFICULTY: Record<Difficulty, DifficultyProfile> = {
  easy: { label: 'Dễ — người mới câu', balanceZone: 45, fishTurn: 0.6, react: 1.5, guides: true, force: 0.82 },
  normal: { label: 'Thường — có kinh nghiệm', balanceZone: 33, fishTurn: 1, react: 1, guides: true, force: 1 },
  hard: { label: 'Khó / Pro — chuyên nghiệp', balanceZone: 24, fishTurn: 1.35, react: 0.75, guides: false, force: 1.12 },
};

export interface FightGear {
  rodPower: number; // absorbs pulls (balance + tension)
  reelSpeed: number; // retrieve ratio
  maxDrag: number; // 0..1 how strong the reel brake can get
  capacity: number; // m of line
  lineStrength: number; // break factor
  netSize: number; // m radius of the landing net
}

export interface FightControls {
  reel: number; // 0 = not reeling, 1..3 = reel speed gear while the button is held
  balance: number; // -1..1 (A = lean left / counter to the left, D = lean right)
  rodCmd: number; // -1 lower (S), 0, +1 raise (W)
  dragCmd: number; // -1 loosen (Q), 0, +1 tighten (E)
  netOut: boolean; // F
  netX: number; // lateral metres the net is aimed at (from mouse)
  scoop: boolean; // one-shot: player tries to lift the net
  netDepth?: number; // metres below surface, controlled by pointer Y
  netDistance?: number; // distance of net mouth from bank (pointer Y)
}

export interface FishFightState {
  phase: FightPhase;
  behavior: Behavior;
  next: Behavior | null; // telegraphed next behavior
  tell: string; // readable sign before the next behavior
  fishForce: number; // 0..~2.5 relative pull
  fishDir: number; // -1..1 lateral pull direction (+ = right)
  balance: number; // -100..100 angler lean offset (+ = pulled to the right)
  lineTension: number; // 0..100 (100 = breaking point)
  fishStamina: number; // 0..100
  hookStrength: number; // 0..100
  rodAngle: number; // 0..1 low..high
  idealAngle: [number, number]; // band that suits the current behavior
  drag: number; // 0..1
  reelGear: number; // 1..3
  reeling: boolean;
  dist: number; // m
  lateral: number; // m
  depth: number; // m below surface (sulking / diving fish are deep)
  slipping: boolean; // drag is giving line
  lineOut: number; // actual line off spool, distinct from fish distance
  slack: number; // metres of loose line
  rodLoad: number;
  slipRate: number;
  retrieveRate: number;
  controlLoss: number; // 0..1 from bad balance
  landing: { window: LandingWindow; fishX: number; netX: number; netOut: boolean; ready: number; reason: string; heading: number; netDepth: number; netDistance: number; inside: boolean };
  jumpNow: boolean;
  escapeReason?: EscapeReason;
  message?: string;
  elapsed: number;
  redTime: number;
}

export const ESCAPE_TEXT: Record<EscapeReason, string> = {
  line_break: 'Đứt dây! Lực căng vượt giới hạn — nới lực hãm (Q) khi cá bứt tốc, đừng thu dây lúc cá chạy.',
  hook_pull: 'Cá tuột lưỡi! Dây chùng quá lâu hoặc ghì quá mạnh lúc cá lắc đầu / nhảy.',
  balance: 'Bạn bị cá kéo mất thăng bằng và tuột cần! Dùng A / D chống lại hướng cá kéo.',
  line_out: 'Hết dây trên máy — lực hãm quá lỏng, cá lấy hết dây.',
  snag: 'Cá lao vào chướng ngại / rúc gốc dưới đáy — giữ cân bằng và nâng cần sớm hơn.',
  net_fail: 'Cá giãy tung khỏi vợt và thoát! Chỉ vớt khi cá quay đầu hoặc nằm mệt, đưa vợt từ dưới lên.',
};

export const BEHAVIOR_LABEL: Record<Behavior, string> = {
  HOOKED: 'Vừa dính lưỡi', RUNNING: 'Đang chạy', BURST: 'Bứt tốc!', TURNING: 'Đổi hướng', DIVING: 'Lặn sâu',
  SULKING: 'Nằm lì dưới đáy', JUMPING: 'Nhảy khỏi mặt nước!', SHAKING: 'Lắc đầu', RESTING: 'Đang nghỉ', FAKE_REST: 'Đang nghỉ',
  EXHAUSTED: 'Kiệt sức',
};

interface BehaviorSpec { force: number; away: number; lateral: number; ideal: [number, number] }
const SPEC: Record<Behavior, BehaviorSpec> = {
  HOOKED: { force: 1.3, away: 0.8, lateral: 0.5, ideal: [0.45, 0.75] },
  RUNNING: { force: 1.0, away: 1.0, lateral: 0.6, ideal: [0.4, 0.7] },
  BURST: { force: 1.65, away: 1.5, lateral: 0.7, ideal: [0.35, 0.65] },
  TURNING: { force: 0.8, away: 0.25, lateral: 1.0, ideal: [0.45, 0.75] },
  DIVING: { force: 0.95, away: 0.4, lateral: 0.2, ideal: [0.68, 0.95] },
  SULKING: { force: 0.7, away: 0.0, lateral: 0.05, ideal: [0.72, 0.98] },
  JUMPING: { force: 0.35, away: 0.2, lateral: 0.3, ideal: [0.05, 0.38] },
  SHAKING: { force: 0.75, away: 0.1, lateral: 0.35, ideal: [0.4, 0.65] },
  RESTING: { force: 0.22, away: -0.05, lateral: 0.1, ideal: [0.45, 0.8] },
  FAKE_REST: { force: 0.2, away: 0.0, lateral: 0.1, ideal: [0.45, 0.8] },
  EXHAUSTED: { force: 0.12, away: 0.0, lateral: 0.25, ideal: [0.5, 0.85] },
};

const TELL: Partial<Record<Behavior, string>> = {
  BURST: 'Dây rung mạnh — cá sắp bứt tốc! Nới lực hãm, ngừng thu.',
  RUNNING: 'Cá quẫy đuôi — chuẩn bị cá chạy.',
  TURNING: 'Dây chùng nhẹ — cá sắp đổi hướng.',
  DIVING: 'Bọt khí nổi lên — cá sắp lặn sâu, nâng cần!',
  SULKING: 'Cá ghì xuống đáy — nâng cần cao, giữ dây căng.',
  JUMPING: 'Cá trồi sát mặt nước — sắp nhảy, hạ cần!',
  SHAKING: 'Đầu dây giật liên hồi — cá sắp lắc đầu.',
  RESTING: 'Lực kéo giảm dần — cá sắp nghỉ, tranh thủ thu dây.',
  FAKE_REST: 'Lực kéo giảm dần — cá sắp nghỉ, tranh thủ thu dây.', // same sign on purpose: a carp's fake rest
};

interface Profile {
  name: string;
  weights: Partial<Record<Behavior, number>>;
  dur: Partial<Record<Behavior, [number, number]>>;
  balanceMult: number; // how strongly the lateral pull drags the angler
  coverSeek: number; // runs toward obstacles
  tellLead: number; // seconds of warning
}
export const PROFILES: Record<Archetype, Profile> = {
  light: {
    name: 'Cá nhỏ — dễ câu', balanceMult: 0.55, coverSeek: 0.1, tellLead: 0.9,
    weights: { RUNNING: 3, TURNING: 2, RESTING: 3, SHAKING: 0.8 },
    dur: { RUNNING: [1, 2.2], TURNING: [0.6, 1.2], RESTING: [1.5, 3], SHAKING: [0.5, 0.9] },
  },
  heavy: {
    name: 'Heavy Puller — kéo nặng, dài', balanceMult: 1.35, coverSeek: 0.2, tellLead: 0.8,
    weights: { RUNNING: 4, BURST: 1, TURNING: 0.8, RESTING: 1.5, DIVING: 0.6 },
    dur: { RUNNING: [3, 6], BURST: [1, 1.8], TURNING: [0.8, 1.4], RESTING: [1.2, 2.2], DIVING: [1.5, 2.5] },
  },
  strategic: {
    name: 'Strategic Fighter — đổi hướng, giả vờ nghỉ', balanceMult: 1.0, coverSeek: 0.55, tellLead: 0.65,
    weights: { RUNNING: 2, TURNING: 3, BURST: 0.8, RESTING: 1, FAKE_REST: 1.6, DIVING: 0.6 },
    dur: { RUNNING: [1.5, 3], TURNING: [0.5, 1], BURST: [0.8, 1.4], RESTING: [1.2, 2.2], FAKE_REST: [1.2, 2.2], DIVING: [1.2, 2] },
  },
  bottom: {
    name: 'Bottom Fighter — chạy sát đáy, nằm lì', balanceMult: 0.95, coverSeek: 0.4, tellLead: 0.85,
    weights: { RUNNING: 2, DIVING: 2.5, SULKING: 2, TURNING: 0.8, RESTING: 1 },
    dur: { RUNNING: [1.5, 3], DIVING: [1.5, 2.6], SULKING: [2.5, 5], TURNING: [0.6, 1.1], RESTING: [1.2, 2] },
  },
  explosive: {
    name: 'Explosive Fighter — bứt tốc, nhảy, lắc đầu', balanceMult: 1.0, coverSeek: 0.4, tellLead: 0.65,
    weights: { BURST: 3, JUMPING: 1.6, SHAKING: 2, TURNING: 2.2, RUNNING: 1, RESTING: 1 },
    dur: { BURST: [0.7, 1.3], JUMPING: [0.9, 1.3], SHAKING: [0.6, 1.1], TURNING: [0.4, 0.8], RUNNING: [0.8, 1.6], RESTING: [1, 1.8] },
  },
};

export const ARCHETYPE_OF: Record<string, Archetype> = {
  ro_phi: 'light', ca_diec: 'light', ca_tre: 'bottom', ca_loc: 'explosive', ca_chep: 'strategic', tram_co: 'heavy',
  me_trang: 'heavy', ca_chinh: 'bottom', koi: 'strategic', ca_huyen_thoai: 'heavy',
};

export class FishFight {
  s: FishFightState;
  readonly prof: Profile;
  readonly diff: DifficultyProfile;
  private size: number; // 0..1 weight relative to species max
  private power: number;
  private speed: number;
  private staminaSec: number;
  private bT = 0; // time left in current behavior
  private redT = 0;
  private slackT = 0;
  private finalBurstDone = false;
  private burstMul = 1;
  private lastNetX = 0;
  private netSpeed = 0;
  private line: LineState;
  private snagTime = 0;
  private obstacles: Array<{ d: number; lateral: number; rd: number; rx: number }> = [];

  setObstacles(obstacles: Array<{ d: number; lateral: number; rd: number; rx: number }>) {
    this.obstacles = obstacles;
  }

  constructor(
    public fish: FishDefinition,
    public weight: number,
    public gear: FightGear,
    startDist: number,
    startLateral: number,
    private rng: Rng,
    public difficulty: Difficulty,
    hookStrength: number, // from Hook Setting
    _cover: number, // retained constructor compatibility; actual obstacles supplied separately
  ) {
    this.line = { lineOut: Math.hypot(startDist, startLateral, 0.6) + 0.55 - 0.35, slack: 0, stretch: 0.35, tension: 45, rodLoad: 0.45, slipRate: 0, retrieveRate: 0 };
    this.prof = PROFILES[ARCHETYPE_OF[fish.id] ?? 'light'];
    this.diff = DIFFICULTY[difficulty];
    this.size = clamp(weight / fish.maxWeight, 0.05, 1);
    // big fish: stronger, longer-lasting, and they pull the angler off balance more
    this.power = fish.fightingPower * (0.45 + 0.95 * this.size) * this.diff.force;
    this.speed = fish.speed * (0.7 + 0.5 * this.size);
    this.staminaSec = fish.stamina * (0.7 + 1.1 * this.size);
    this.s = {
      phase: 'fighting', behavior: 'HOOKED', next: null, tell: '', fishForce: 0, fishDir: rng.chance(0.5) ? 1 : -1,
      balance: 0, lineTension: 45, fishStamina: 100, hookStrength: clamp(hookStrength, 5, 100), rodAngle: 0.55,
      idealAngle: SPEC.HOOKED.ideal, drag: 0.5, reelGear: 2, reeling: false, dist: startDist, lateral: startLateral, depth: 0.6,
      slipping: false, controlLoss: 0, lineOut: this.line.lineOut, slack: 0, rodLoad: 0.45, slipRate: 0, retrieveRate: 0,
      landing: { window: 'none', fishX: startLateral, netX: 0, netOut: false, ready: 0, reason: '', heading: -1, netDepth: 0.35, netDistance: startDist, inside: false },
      jumpNow: false, elapsed: 0, redTime: 0,
    };
    this.bT = rng.range(0.6, 1.0);
  }

  /** choose the next behavior (weighted, size and stamina aware, never fully random: it is telegraphed) */
  private pickNext(): Behavior {
    const s = this.s;
    const r = this.rng;
    if (s.fishStamina < 15) return 'EXHAUSTED';
    const w: Partial<Record<Behavior, number>> = { ...this.prof.weights };
    const tired = 1 - s.fishStamina / 100;
    for (const k of Object.keys(w) as Behavior[]) {
      let v = w[k] ?? 0;
      if (k === 'RESTING' || k === 'FAKE_REST') v *= 0.6 + tired * 1.6;
      if (k === 'BURST' || k === 'JUMPING') v *= (0.6 + this.size) * (1 - tired * 0.6) * this.diff.fishTurn;
      if (k === 'TURNING') v *= this.diff.fishTurn;
      if (k === 'TURNING') v *= 1 + s.lineTension / 100;
      if (k === 'DIVING' && s.dist < 5) v *= 1.5;
      if (k === 'BURST') v *= s.lineTension > 75 && s.fishStamina > 35 ? 1.6 : 0.8;
      if (k === 'FAKE_REST' || k === 'SULKING') v *= 0.4 + this.size; // big fish know more tricks
      if (k === s.behavior) v *= 0.35; // rarely repeat
      w[k] = v;
    }
    if (s.behavior === 'FAKE_REST') return 'BURST'; // the trick ends with a burst
    const keys = Object.keys(w) as Behavior[];
    return r.weighted(keys, (k) => w[k] ?? 0) ?? 'RUNNING';
  }

  private enter(b: Behavior) {
    const s = this.s;
    const r = this.rng;
    const range = this.prof.dur[b] ?? [1, 2];
    s.behavior = b;
    this.bT = r.range(range[0], range[1]) * (0.85 + this.size * 0.5);
    s.next = null;
    s.tell = '';
    this.burstMul = 1;
    if (b === 'TURNING' || b === 'BURST') s.fishDir = (r.chance(0.7) ? -Math.sign(s.fishDir || 1) : Math.sign(s.fishDir || 1)) * r.range(0.6, 1);
    if (b === 'RUNNING') s.fishDir = Math.sign(s.fishDir || 1) * r.range(0.3, 0.9);
    if (b === 'JUMPING') s.jumpNow = true;
    if (b === 'BURST') this.burstMul = 1 + this.size * 0.4;
    if (b === 'EXHAUSTED') this.bT = 999;
  }

  update(dt: number, c: FightControls): FishFightState {
    // Integrate at <= 60 Hz even when QA speed or a slow frame supplies a large dt.
    if (!Number.isFinite(dt) || dt <= 0) return this.s;
    if (dt > 1 / 60 + 1e-8) {
      const steps = Math.ceil(dt * 60);
      let jumped = false;
      for (let i = 0; i < steps; i++) {
        this.update(dt / steps, { ...c, scoop: c.scoop && i === steps - 1 });
        jumped ||= this.s.jumpNow;
        if (this.s.phase === 'landed' || this.s.phase === 'escaped') break;
      }
      this.s.jumpNow = jumped;
      return this.s;
    }
    const s = this.s;
    s.jumpNow = false;
    s.message = undefined;
    if (s.phase === 'landed' || s.phase === 'escaped') return s;
    s.elapsed += dt;

    // ---------------- angler controls
    s.rodAngle = clamp(s.rodAngle + c.rodCmd * 0.9 * dt, 0, 1);
    s.drag = clamp(s.drag + c.dragCmd * 0.25 * dt, 0.05, 1);
    if (c.reel > 0) s.reelGear = c.reel;
    s.reeling = c.reel > 0;

    // ---------------- fish state machine with telegraph
    this.bT -= dt;
    if (s.behavior !== 'EXHAUSTED') {
      if (!s.next && this.bT <= this.prof.tellLead * this.diff.react) {
        s.next = this.pickNext();
        s.tell = TELL[s.next] ?? '';
      }
      if (this.bT <= 0) this.enter(s.next ?? this.pickNext());
    } else if (s.fishStamina > 30) this.enter('RESTING');
    if (s.fishStamina < 15 && s.behavior !== 'EXHAUSTED' && !s.next && s.phase === 'fighting') {
      s.next = 'EXHAUSTED';
      s.tell = 'Cá yếu dần…';
      this.bT = Math.min(this.bT, 0.6);
    }

    const spec = SPEC[s.behavior];
    s.idealAngle = spec.ideal;
    const stamF = 0.3 + 0.7 * (s.fishStamina / 100);
    let F = this.power * spec.force * stamF * this.burstMul;
    if (s.behavior === 'SHAKING') F *= 1 + Math.sin(s.elapsed * 24) * 0.5;
    if (s.behavior === 'JUMPING') F *= this.bT > 0.6 ? 2.4 : 0.4; // violent leap then slack
    s.fishForce = F;

    // ---------------- Side pressure: A/D steers the rod, never a falling minigame.
    const lateralPull = F * s.fishDir * spec.lateral * this.prof.balanceMult / this.gear.rodPower;
    const counter = c.balance; // + = lean right
    // a lateral pull of +1 pushes the angler right; leaning the opposite way cancels it; leaning with no pull overbalances
    s.balance = approach(s.balance, counter * 65, 4, dt);
    const zone = this.diff.balanceZone;
    const sidePressure = clamp(-counter * s.fishDir, -1, 1);
    s.controlLoss = clamp(Math.abs(lateralPull) * (1 - Math.max(0, sidePressure)) * 0.35, 0, 0.8);
    void zone;

    // ---------------- Rod angle
    const [lo, hi] = spec.ideal;
    const tooLow = Math.max(0, lo - s.rodAngle);
    const tooHigh = Math.max(0, s.rodAngle - hi);

    // Fish attempts to swim against tension. A raised rod takes up geometry;
    // lowering it releases that length, which can be recovered with the reel.
    const away = spec.away * (1 + s.controlLoss * 0.4 + tooLow * 0.6);
    const swim = this.speed * F * 0.42 * away;
    const pull = s.lineTension * 0.028 / (0.6 + this.power);
    const anchored = s.behavior === 'SULKING' && s.rodAngle < 0.68;
    s.dist = Math.max(0.65, s.dist + (swim - (anchored ? pull * 0.12 : pull)) * dt);
    s.lateral += (s.fishDir * this.speed * spec.lateral * 0.28 * F
      + counter * s.lineTension * 0.009 - s.lateral / Math.max(1, s.dist) * pull) * dt;
    s.lateral = clamp(s.lateral, -(2 + s.dist * 0.45), 2 + s.dist * 0.45);
    const targetDepth = s.behavior === 'DIVING' || s.behavior === 'SULKING' ? 2.2
      : s.behavior === 'JUMPING' ? 0 : s.fishStamina < 35 && s.dist < 5 ? 0.12 : 0.8;
    s.depth = Math.max(0, approach(s.depth, targetDepth - (s.rodAngle - 0.5) * 0.6, 1.2, dt));
    const path = Math.hypot(s.dist, s.lateral, s.depth) + s.rodAngle;
    const reel = s.reeling ? s.reelGear * 0.8 * this.gear.reelSpeed : 0;
    solveLine(this.line, dt, path, reel, s.drag, this.gear.maxDrag,
      this.gear.lineStrength, this.gear.rodPower);
    s.lineTension = this.line.tension;
    s.lineOut = this.line.lineOut;
    s.slack = this.line.slack;
    s.rodLoad = this.line.rodLoad;
    s.slipRate = this.line.slipRate;
    s.retrieveRate = this.line.retrieveRate;
    s.slipping = s.slipRate > 0.02;

    // ---------------- Fish stamina (good control drains it; slack / bad balance lets it rest)
    const pressure = s.lineTension >= 25 && s.lineTension <= 85 ? 1 : s.lineTension > 85 ? 0.7 : s.lineTension / 25;
    const angleOk = tooLow + tooHigh < 0.05 ? 1 : 0.45;
    const balOk = (1 - s.controlLoss * 0.5) * (1 + Math.max(0, sidePressure) * 0.3);
    const restBonus = s.behavior === 'RESTING' && s.reeling ? 1.4 : 1;
    s.fishStamina -= (100 / this.staminaSec) * pressure * angleOk * balOk * restBonus * Math.sqrt(this.gear.rodPower) * 0.55 * dt;
    if (s.lineTension < 12) s.fishStamina += 3 * dt;
    s.fishStamina = clamp(s.fishStamina, 0, 100);

    // ---------------- Hook strength
    if (s.slack > 0.2 && s.behavior !== 'EXHAUSTED') this.slackT += dt;
    else this.slackT = Math.max(0, this.slackT - dt);
    if (this.slackT > 0.6) s.hookStrength -= 9 * dt;
    if (s.behavior === 'SHAKING' && s.lineTension > 65) s.hookStrength -= (s.lineTension - 55) * 0.5 * dt;
    if (s.behavior === 'JUMPING' && s.rodAngle > 0.45) s.hookStrength -= (s.rodAngle - 0.45) * 55 * dt; // rod high while the fish leaps = thrown hook
    if (s.hookStrength <= 0) return this.escape('hook_pull');

    // ---------------- Line break & line out
    if (s.lineTension > 90) {
      this.redT += dt;
      s.redTime += dt;
    } else this.redT = Math.max(0, this.redT - dt * 0.5);
    if (s.lineTension >= 100 || this.redT > 1.4) return this.escape('line_break');
    if (s.lineOut > this.gear.capacity) return this.escape('line_out');

    // Actual cover intersections, including the line segment from bank to fish.
    // A brief brush is recoverable; holding the line in cover causes abrasion.
    const touching = this.obstacles.some(o => {
      const dx = s.dist / o.rd, dy = s.lateral / o.rx;
      const t = clamp((o.d / o.rd * dx + o.lateral / o.rx * dy) /
        Math.max(0.01, dx * dx + dy * dy), 0, 1);
      const lineHit = ((s.dist * t - o.d) / o.rd) ** 2 +
        ((s.lateral * t - o.lateral) / o.rx) ** 2 < 1;
      return lineHit;
    });
    this.snagTime = touching ? this.snagTime + dt : Math.max(0, this.snagTime - dt * 2);
    if (touching) s.message = 'Dây chạm vùng sen — ép cần ra vùng nước trống!';
    if (this.snagTime > 2.5 && s.lineTension > 25) return this.escape('snag');

    // ---------------- Landing (stage 4)
    this.updateLanding(dt, c);
    return s;
  }

  /** Guide the head over a submerged net mouth; no random landing roll. */
  private updateLanding(dt: number, c: FightControls) {
    const s = this.s, L = s.landing;
    L.netOut = c.netOut && s.dist < 4.2;
    L.netX = approach(L.netX, c.netX, 9, dt);
    L.netDepth = clamp(c.netDepth ?? 0.35, 0.02, 0.8);
    L.netDistance = clamp(c.netDistance ?? s.dist, 0.5, 4.5);
    if (!c.netOut || s.dist > 5) {
      s.phase = 'fighting'; L.window = 'none'; L.ready = 0; L.inside = false;
      return;
    }
    if (s.phase === 'fighting') {
      if (!L.netOut || s.fishStamina > 40) return;
      s.phase = 'landing';
      this.lastNetX = L.netX;
      // A strong fish can react to a close net, not a mandatory final burst.
      if (!this.finalBurstDone && s.fishStamina > 25 && s.lineTension > 65) {
        this.finalBurstDone = true;
        this.enter('BURST');
        s.message = 'Cá còn sức, hoảng khi thấy vợt — giữ cần ổn định.';
        s.phase = 'fighting';
        return;
      }
    }
    const velocity = Math.abs(L.netX - this.lastNetX) / dt;
    this.lastNetX = L.netX;
    this.netSpeed = approach(this.netSpeed, velocity, 8, dt);
    L.fishX = s.lateral;
    // -1 = head towards bank; +1 = head away. Loaded, tired fish can be led in.
    const away = s.behavior === 'BURST' || s.behavior === 'RUNNING';
    const heading = away && s.fishStamina > 18 ? 1 : -1;
    L.heading = approach(L.heading, heading, 3, dt);
    L.window = L.heading > 0 || this.netSpeed > 5 ? 'lunge'
      : s.fishStamina < 20 ? 'tired' : 'turn';
    const fishLen = this.fish.maxLength / 100 * Math.cbrt(this.size);
    const fits = fishLen <= this.gear.netSize * 2.5;
    const lateralOk = Math.abs(L.netX - L.fishX) < this.gear.netSize * 0.8;
    const distanceOk = Math.abs(L.netDistance - s.dist) < this.gear.netSize;
    const submerged = L.netDepth >= s.depth + 0.06 && L.netDepth < s.depth + 0.6;
    L.inside = fits && lateralOk && distanceOk && submerged && L.heading < -0.4 && this.netSpeed < 5;
    L.ready = clamp(L.ready + (L.inside ? dt * 1.6 : -dt * 2), 0, 1);
    L.reason = !fits ? 'Cá quá dài so với miệng vợt — cần vợt lớn hơn.'
      : !submerged ? 'Hạ miệng vợt xuống dưới thân cá (rê chuột lên/xuống).'
      : !lateralOk || !distanceOk ? 'Đặt miệng vợt phía trước đầu cá, dẫn cá vào.'
      : L.heading > -0.4 ? 'Cá đang quay ra — giữ áp lực, chờ đầu cá hướng vào bờ.'
      : this.netSpeed >= 5 ? 'Đừng đuổi cá bằng vợt — giữ vợt ổn định.'
      : L.ready < 0.6 ? 'Đầu cá vào trước — chờ thân cá vào lòng vợt…'
      : 'Cá đã trong lòng vợt — click / Space để nhấc.';
    if (c.scoop) {
      if (L.inside && L.ready >= 0.6) {
        s.phase = 'landed';
      } else {
        // Only actual contact startles the fish. Missing open water has no penalty.
        const contact = Math.abs(L.netX - L.fishX) < this.gear.netSize + 0.15 && distanceOk;
        L.ready = 0;
        if (contact && s.fishStamina > 15) {
          this.enter('TURNING');
          s.message = 'Vành vợt chạm cá — cá đổi hướng.';
        }
      }
    }
  }

  private escape(reason: EscapeReason): FishFightState {
    this.s.phase = 'escaped';
    this.s.escapeReason = reason;
    return this.s;
  }

  /** 0..100 rating for the result card */
  quality(): number {
    const t = Math.max(1, this.s.elapsed);
    return Math.round(clamp(100 - (this.s.redTime / t) * 200 - (100 - this.s.hookStrength) * 0.25, 5, 100));
  }
}

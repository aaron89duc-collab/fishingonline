import { Rng, clamp } from './rng';
import type { BaitId, FishDefinition, ZoneDef } from './data';
import { FISH_BY_ID } from './data';

/** Bite state machine from GDD 14.6 */
export type BiteState = 'WAITING' | 'APPROACH' | 'NIBBLE' | 'TAKING_BAIT' | 'HOOK_WINDOW' | 'HOOKED' | 'MISSED' | 'LEFT';

export interface FloatPose {
  sink: number; // 0 = resting, 1 = antenna just under, >1 fully gone
  tilt: number; // radians
  dx: number; // lateral drag in px (screen)
  tremor: number; // small jitter amplitude 0..1
}

export type BiteEvent =
  | { type: 'approach'; species: string; bubbles: boolean }
  | { type: 'nibble'; strength: number }
  | { type: 'take' }
  | { type: 'window' }
  | { type: 'spit'; baitLost: boolean }
  | { type: 'leave'; baitLost: boolean };

export interface BiteContext {
  zone: ZoneDef;
  bait: BaitId;
  baitDepth: number;
  waterDepth: number;
  onBottom: boolean;
  hour: number;
  lineStealth: number;
  rodSensitivity: number;
  assist: boolean;
  newbie: boolean; // no fish caught yet → guaranteed easy fish soon
  rng: Rng;
  spookedFor: number; // seconds of quiet after a noisy cast
  agentDriven?: boolean;
}

export interface HookResult {
  ok: boolean;
  state: BiteState;
  quality: number; // 0..1 timing quality
  reason: string;
}

interface Pulse { t: number; dur: number; sink: number; tilt: number; dx: number }

/** Score how well a species fits current conditions (0..~2). */
export function speciesAffinity(f: FishDefinition, c: Pick<BiteContext, 'bait' | 'baitDepth' | 'onBottom' | 'hour'>): number {
  const bait = f.preferredBaits[c.bait] ?? 0.04;
  const [a, b] = f.depth;
  const dd = c.baitDepth < a ? a - c.baitDepth : c.baitDepth > b ? c.baitDepth - b : 0;
  const depth = Math.exp(-dd / 0.55);
  const bottom = c.onBottom ? (f.nibbleStyle === 'bottom' ? 1.35 : 0.75) : 1;
  const hour = f.activeHours[Math.floor(c.hour) % 24] ?? 1;
  return bait * depth * bottom * hour;
}

export class BiteSession {
  state: BiteState = 'WAITING';
  species: FishDefinition | null = null;
  stateT = 0; // time in state
  dur = 0;
  waited = 0;
  private nibblesLeft = 0;
  private gap = 0;
  private pulses: Pulse[] = [];
  private takeDx = 0;
  private windowLen = 0;
  private c: BiteContext;

  constructor(ctx: BiteContext) {
    this.c = ctx;
  }

  /** A visible fish agent reached the bait: skip random spawning and start inspecting. */
  forceApproach(f: FishDefinition) {
    if (this.state !== 'WAITING') return false;
    this.species = f;
    this.enter('APPROACH', this.c.rng.range(0.6, 1.4));
    return true;
  }

  setContext(patch: Partial<BiteContext>) {
    Object.assign(this.c, patch);
  }

  /** Candidates and their weights for the current conditions (also used by debug panel). */
  candidates(): Array<{ f: FishDefinition; w: number }> {
    const out: Array<{ f: FishDefinition; w: number }> = [];
    for (const [id, zw] of Object.entries(this.c.zone.fish)) {
      const f = FISH_BY_ID[id];
      if (!f || !zw) continue;
      let w = zw * speciesAffinity(f, this.c);
      if (this.c.newbie) w = id === 'ro_phi' || id === 'ca_diec' ? w + 4 : w * 0.15;
      if (w > 0.001) out.push({ f, w });
    }
    return out;
  }

  update(dt: number): BiteEvent[] {
    const ev: BiteEvent[] = [];
    const r = this.c.rng;
    this.stateT += dt;
    this.pulses = this.pulses.filter((p) => (p.t += dt) < p.dur);
    switch (this.state) {
      case 'WAITING': {
        this.waited += dt;
        if (this.c.agentDriven) break; // fish agents decide who comes to the bait
        if (this.c.spookedFor > 0) {
          this.c.spookedFor -= dt;
          break;
        }
        const cands = this.candidates();
        const total = cands.reduce((s, x) => s + x.w, 0);
        // approach chance per second: zone base × how attractive the setup is (saturating)
        let p = this.c.zone.baseBite * (1 - Math.exp(-total / 2.2)) * 1.6 * this.c.lineStealth;
        if (this.c.newbie) p = Math.max(p, 0.28);
        // pity timer: waiting long increases chance (GDD: người mới không chờ quá lâu)
        p *= 1 + Math.max(0, this.waited - 25) / 30;
        if (r.chance(p * dt)) {
          const pick = r.weighted(cands, (x) => x.w);
          if (pick) {
            this.species = pick.f;
            this.enter('APPROACH', r.range(1.4, 3.8));
            const bubbles = r.chance(this.c.onBottom ? 0.7 : 0.45);
            ev.push({ type: 'approach', species: pick.f.id, bubbles });
          }
        }
        break;
      }
      case 'APPROACH': {
        if (this.stateT >= this.dur) {
          const f = this.species!;
          const pref = f.preferredBaits[this.c.bait] ?? 0.05;
          const leave = f.caution * (1 - pref) * 0.8 + (1 - Math.min(1, this.c.lineStealth)) * 0.4;
          if (!this.c.newbie && r.chance(leave)) {
            ev.push({ type: 'leave', baitLost: false });
            this.reset();
          } else {
            this.nibblesLeft = r.int(f.nibbles[0], f.nibbles[1]);
            this.gap = r.range(0.3, 1.0);
            this.enter('NIBBLE', 99);
          }
        }
        break;
      }
      case 'NIBBLE': {
        const f = this.species!;
        this.gap -= dt;
        if (this.gap <= 0) {
          if (this.nibblesLeft <= 0) {
            this.enter('TAKING_BAIT', f.nibbleStyle === 'predator' ? r.range(0.15, 0.35) : r.range(0.6, 1.4));
            this.takeDx = (r.chance(0.5) ? -1 : 1) * r.range(10, f.nibbleStyle === 'predator' ? 70 : 34);
            ev.push({ type: 'take' });
            break;
          }
          this.nibblesLeft--;
          const filter = f.nibbleStyle === 'filter';
          const strength = filter ? r.range(0.15, 0.3) : r.range(0.25, 0.55);
          this.pulses.push({ t: 0, dur: filter ? 0.18 : r.range(0.22, 0.45), sink: strength, tilt: r.range(-0.25, 0.25), dx: r.range(-4, 4) });
          if (filter && r.chance(0.6)) this.pulses.push({ t: -0.25, dur: 0.16, sink: strength * 0.8, tilt: r.range(-0.2, 0.2), dx: 0 });
          // "chìm giả": the fish snatches the bait and lets go — float dips fully for an instant and pops back
          if (!this.c.newbie && r.chance(f.nibbleStyle === 'predator' ? 0.5 : f.nibbleStyle === 'small' ? 0.35 : 0.25)) {
            this.pulses.push({ t: -r.range(0.3, 0.6), dur: r.range(0.16, 0.26), sink: r.range(1.05, 1.3), tilt: r.range(-0.3, 0.3), dx: r.range(-6, 6) });
          }
          ev.push({ type: 'nibble', strength });
          this.gap = filter ? r.range(0.35, 0.9) : r.range(0.7, 2.0);
          if (!this.c.newbie && r.chance(f.caution * 0.12)) {
            const lost = r.chance(0.35);
            ev.push({ type: 'leave', baitLost: lost });
            this.reset();
          }
        }
        break;
      }
      case 'TAKING_BAIT': {
        if (this.stateT >= this.dur) {
          const f = this.species!;
          // real bites are short: ~0.4–1.1 s without assist (fast predators the shortest)
          this.windowLen = f.bitePatience * 0.72 * (this.c.assist ? 1.45 : 1) * (this.c.newbie ? 1.5 : 1) * this.c.rodSensitivity * r.range(0.85, 1.15);
          this.enter('HOOK_WINDOW', this.windowLen);
          ev.push({ type: 'window' });
        }
        break;
      }
      case 'HOOK_WINDOW': {
        if (this.stateT >= this.dur) {
          const lost = r.chance(0.55);
          ev.push({ type: 'spit', baitLost: lost });
          this.state = 'MISSED';
          this.stateT = 0;
        }
        break;
      }
      case 'MISSED':
      case 'LEFT':
        if (this.stateT > 1.2) this.reset();
        break;
      case 'HOOKED':
        break;
    }
    return ev;
  }

  private enter(s: BiteState, dur: number) {
    this.state = s;
    this.stateT = 0;
    this.dur = dur;
  }

  reset() {
    this.state = 'WAITING';
    this.species = null;
    this.stateT = 0;
    this.pulses = [];
    this.waited = Math.min(this.waited, 20);
  }

  /** time remaining in hook window, 0..1 (for assist / debug) */
  windowProgress(): number {
    return this.state === 'HOOK_WINDOW' ? clamp(this.stateT / this.dur, 0, 1) : 0;
  }

  hook(): HookResult {
    const s = this.state;
    if (s === 'HOOK_WINDOW') {
      // best moment: early in the window (fish has just turned with the bait). Late = hook only lips.
      const u = this.stateT / this.dur;
      const q = clamp(1 - Math.abs(u - 0.22) * 1.6, 0, 1);
      const ok = this.c.rng.chance(this.c.newbie ? 0.95 : 0.55 + 0.45 * q);
      if (ok) {
        this.state = 'HOOKED';
        return { ok, state: s, quality: clamp(q, 0, 1), reason: 'Đóng cá thành công!' };
      }
      this.state = 'MISSED';
      this.stateT = 0;
      return { ok, state: s, quality: q, reason: 'Lưỡi không ăn — cá tuột!' };
    }
    if (s === 'TAKING_BAIT') {
      if (this.c.rng.chance(0.15)) {
        this.state = 'HOOKED';
        return { ok: true, state: s, quality: 0.4, reason: 'Đóng hơi sớm nhưng vẫn dính!' };
      }
      this.state = 'MISSED';
      this.stateT = 0;
      return { ok: false, state: s, quality: 0, reason: 'Đóng sớm: cá mới ngậm mồi, chưa nuốt.' };
    }
    if (s === 'NIBBLE' || s === 'APPROACH') {
      this.state = 'MISSED';
      this.stateT = 0;
      return { ok: false, state: s, quality: 0, reason: s === 'NIBBLE' ? 'Đóng quá sớm: cá chỉ đang rỉa mồi.' : 'Giật cần làm cá hoảng bỏ đi.' };
    }
    return { ok: false, state: s, quality: 0, reason: 'Chưa có cá cắn câu.' };
  }

  /** Float motion caused by the fish only (waves/wind are added by the view). */
  pose(): FloatPose {
    let sink = 0, tilt = 0, dx = 0, tremor = 0;
    for (const p of this.pulses) {
      if (p.t < 0) continue;
      const k = Math.sin((p.t / p.dur) * Math.PI);
      sink = Math.max(sink, p.sink * k);
      tilt += p.tilt * k;
      dx += p.dx * k;
    }
    const t = this.stateT;
    switch (this.state) {
      case 'APPROACH':
        tremor = 0.25 + 0.2 * Math.sin(t * 9);
        break;
      case 'TAKING_BAIT': {
        const u = clamp(t / this.dur, 0, 1);
        sink = Math.max(sink, 0.35 + 0.3 * u);
        dx += this.takeDx * u;
        tilt += 0.25 * u * Math.sign(this.takeDx);
        tremor = 0.3;
        break;
      }
      case 'HOOK_WINDOW': {
        const u = clamp(t / 0.25, 0, 1);
        const predator = this.species?.nibbleStyle === 'predator';
        sink = Math.max(sink, 0.65 + 0.85 * u);
        dx += this.takeDx * (1 + (predator ? 1.4 : 0.6) * clamp(t / this.dur, 0, 1));
        tilt += 0.35 * Math.sign(this.takeDx);
        tremor = 0.5;
        break;
      }
      case 'MISSED':
        sink = Math.max(0, 0.5 - t);
        break;
    }
    return { sink, tilt, dx, tremor };
  }
}

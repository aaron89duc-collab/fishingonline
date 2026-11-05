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
  react?: number; // difficulty multiplier for the hook timeline
  lineSlack?: number; // metres of loose line between tip and float
}

export type StrikeDir = 'up' | 'left' | 'right';
/** Hook Setting timeline per species, ms after the real bite: [touch ends, ideal ends, last chance ends] */
export const HOOK_TIMELINE: Record<string, [number, number, number]> = {
  ro_phi: [250, 800, 1200], ca_tre: [350, 1100, 1700], ca_loc: [150, 550, 900], ca_chep: [400, 1100, 1600], tram_co: [300, 900, 1400],
};
/** mouth: soft = a hard strike tears out; hard = needs a strong strike; any = both work */
export const MOUTH: Record<string, 'soft' | 'hard' | 'any'> = { ro_phi: 'soft', ca_tre: 'hard', ca_loc: 'hard', ca_chep: 'any', tram_co: 'hard' };
export const MOUTH_TEXT = { soft: 'miệng mỏng — giật nhẹ', hard: 'miệng cứng — giật mạnh', any: 'giật nhẹ hay mạnh đều được' };

export interface HookResult {
  ok: boolean;
  state: BiteState;
  quality: number; // 0..1 → Hook Strength
  reason: string;
  timing?: 'early' | 'ideal' | 'late';
  transmitted?: number;
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
  timeline: [number, number, number] = [250, 800, 1200];
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
          // Hook Setting timeline: touch → ideal → last chance → spit (per species, scaled by difficulty)
          this.timeline = this.scaledTimeline(f.id);
          this.windowLen = this.timeline[2] / 1000;
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

  private scaledTimeline(id: string): [number, number, number] {
    const base = HOOK_TIMELINE[id] ?? [250, 800, 1200];
    const k = (this.c.react ?? 1) * (this.c.assist ? 1.25 : 1) * (this.c.newbie ? 1.4 : 1) * this.c.rodSensitivity;
    return [base[0] * k, base[1] * k, base[2] * k];
  }

  /** where the bite is pulling the float: the best strike is the opposite way (or up if it sinks straight) */
  bestStrike(): StrikeDir {
    if (Math.abs(this.takeDx) < 18) return 'up';
    return this.takeDx > 0 ? 'left' : 'right';
  }

  /** current zone of the hook timeline (for HUD guides / debug) */
  hookZone(): 'none' | 'early' | 'ideal' | 'late' {
    if (this.state === 'TAKING_BAIT') return 'early';
    if (this.state !== 'HOOK_WINDOW') return 'none';
    const ms = this.stateT * 1000;
    return ms < this.timeline[0] ? 'early' : ms < this.timeline[1] ? 'ideal' : 'late';
  }

  /** time remaining in hook window, 0..1 (for assist / debug) */
  windowProgress(): number {
    return this.state === 'HOOK_WINDOW' ? clamp(this.stateT / this.dur, 0, 1) : 0;
  }

  /**
   * Hook Setting: timing × direction × strength.
   * dir: which way the rod is jerked; strong: tap (soft) or held strike (strong).
   */
  hook(dir: StrikeDir = 'up', strong: boolean | number = false): HookResult {
    const stroke = typeof strong === 'number' ? clamp(strong, 0, 1) : strong ? 0.85 : 0.48;
    const hardStrike = stroke > 0.65;
    const s = this.state;
    const f = this.species;
    if ((s === 'HOOK_WINDOW' || s === 'TAKING_BAIT') && f) {
      const zone = this.hookZone();
      const ms = this.stateT * 1000;
      const [t0, t1] = this.timeline;
      let q: number, tTxt: string;
      if (zone === 'ideal') {
        const mid = (t0 + t1) / 2;
        q = 1 - (Math.abs(ms - mid) / ((t1 - t0) / 2)) * 0.15;
        tTxt = 'đúng lúc';
      } else if (zone === 'early') {
        q = 0.35;
        tTxt = 'hơi sớm';
      } else {
        q = 0.45;
        tTxt = 'hơi muộn';
      }
      const best = this.bestStrike();
      let d = 1, dTxt = 'đúng hướng';
      if (dir !== best) {
        if (dir === 'up') { d = 0.7; dTxt = 'nên giật ngược hướng phao chạy'; }
        else if (best === 'up') { d = 0.75; dTxt = 'phao chìm thẳng — nên giật lên'; }
        else { d = 0.35; dTxt = 'giật cùng hướng cá chạy'; }
      }
      const mouth = MOUTH[f.id] ?? 'any';
      // A finite rod stroke first takes up loose line; the remainder loads the hook.
      const travel = 0.18 + stroke * 1.1;
      const transmitted = clamp((travel - (this.c.lineSlack ?? 0.05)) / travel, 0, 1);
      const impulse = stroke * transmitted * Math.sqrt(this.c.rodSensitivity);
      let st = 0.95, sTxt = hardStrike ? 'giật mạnh' : 'giật nhẹ';
      if (mouth === 'soft') { st = hardStrike ? 0.6 : 1; if (hardStrike) sTxt = 'lực giật lớn, lưỡi bám kém'; }
      if (mouth === 'hard') { st = hardStrike ? 1 : 0.55; if (!hardStrike) sTxt = 'lực truyền tới lưỡi còn nhẹ'; }
      const strength = clamp(q * d * st * transmitted, 0, 1);
      const enoughForce = impulse >= (mouth === 'hard' ? 0.24 : 0.12);
      // Outcome follows engagement and delivered force, not a hidden random miss.
      if (enoughForce && strength >= (this.c.newbie ? 0.12 : 0.22) && !(s === 'TAKING_BAIT' && this.stateT < this.dur * 0.55)) {
        this.state = 'HOOKED';
        return { ok: true, state: s, quality: strength, transmitted, timing: zone === 'none' ? undefined : zone, reason: `Dính cá! ${tTxt} · ${dTxt} · ${sTxt}` };
      }
      this.state = 'MISSED';
      this.stateT = 0;
      return { ok: false, state: s, quality: 0, transmitted, timing: zone === 'none' ? undefined : zone, reason: transmitted < 0.3 ? 'Dây còn chùng — cú giật chưa truyền tới lưỡi. Giữ chuột phải để thu dây chùng trước khi giật.' : `Hụt! ${tTxt} · ${dTxt} · ${sTxt}` };
    }
    if (s === 'NIBBLE' || s === 'APPROACH') {
      this.state = 'MISSED';
      this.stateT = 0;
      return { ok: false, state: s, quality: 0, reason: s === 'NIBBLE' ? 'Đóng quá sớm: cá chỉ đang rỉa mồi (chìm giả).' : 'Giật cần làm cá hoảng bỏ đi.' };
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
        // A bottom rig can unload the float when a fish lifts the bait/sinker.
        sink = this.c.onBottom && this.takeDx < 0 ? -0.3 * u : Math.max(sink, 0.35 + 0.3 * u);
        dx += this.takeDx * u;
        tilt += 0.25 * u * Math.sign(this.takeDx);
        tremor = 0.3;
        break;
      }
      case 'HOOK_WINDOW': {
        const u = clamp((t * 1000) / Math.max(120, this.timeline[0]), 0, 1); // touch: dips, then fully under
        const predator = this.species?.nibbleStyle === 'predator';
        sink = this.c.onBottom && this.takeDx < 0 ? -0.3 - 0.25 * u : Math.max(sink, 0.65 + 0.85 * u);
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

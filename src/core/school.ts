import { Rng, clamp } from './rng';
import { FISH_BY_ID, type FishDefinition, type ZoneDef, type BaitId } from './data';
import { speciesAffinity } from './bite';

/** P1-030..036: fish that live in the lake, wander, detect the bait, approach, and flee. */
export type AgentState = 'wander' | 'approach' | 'at_bait' | 'flee' | 'hooked';

export interface FishAgent {
  id: number;
  def: FishDefinition;
  weight: number; // rolled by the authority at spawn, revealed only when landed
  d: number; // distance from angler (m)
  lat: number; // lateral (m)
  heading: number; // radians in lake plane (0 = away from angler)
  speed: number;
  state: AgentState;
  stateT: number;
  cooldown: number; // after fleeing, ignores bait
  depth: number; // swimming depth (m) — deeper fish are fainter
}

export interface Bait { d: number; lat: number; bait: BaitId; depth: number; onBottom: boolean; hour: number }

const DETECT: Record<string, number> = { ro_phi: 4.5, ca_tre: 6.0, ca_loc: 7.0 }; // m (smell / sight)

export class School {
  agents: FishAgent[] = [];
  private nextId = 1;
  private spawnT = 0;
  constructor(private zone: ZoneDef, private rng: Rng, private maxCast: number, private rollWeight: (f: FishDefinition) => number) {
    for (let i = 0; i < 5; i++) this.spawn();
  }

  private latLimit(d: number) {
    return 2 + d * 0.55;
  }

  spawn(near?: { d: number; lat: number }, force?: string): FishAgent {
    const r = this.rng;
    const ids = Object.keys(this.zone.fish);
    const id = force ?? r.weighted(ids, (k) => this.zone.fish[k] ?? 0)!;
    const def = FISH_BY_ID[id];
    const ang = r.range(0, Math.PI * 2);
    const rad = r.range(3, 5);
    const d = near ? clamp(near.d + Math.cos(ang) * rad, 3, this.maxCast + 4) : r.range(5, this.maxCast + 4);
    const lat = near ? near.lat + Math.sin(ang) * rad : r.range(-this.latLimit(d), this.latLimit(d));
    const a: FishAgent = {
      id: this.nextId++, def, weight: this.rollWeight(def), d, lat, heading: r.range(0, Math.PI * 2),
      speed: def.speed * r.range(0.15, 0.3), state: 'wander', stateT: 0, cooldown: 0,
      depth: r.range(def.depth[0], def.depth[1] + 0.6),
    };
    this.agents.push(a);
    return a;
  }

  /** returns the agent that reached the bait this frame (if any) */
  update(dt: number, bait: Bait | null): FishAgent | null {
    const r = this.rng;
    let arrived: FishAgent | null = null;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 6;
      if (this.agents.filter((a) => a.state !== 'flee').length < 5) this.spawn();
    }
    for (const a of this.agents) {
      a.stateT += dt;
      a.cooldown = Math.max(0, a.cooldown - dt);
      switch (a.state) {
        case 'wander': {
          a.heading += r.range(-1, 1) * dt * 0.9;
          a.speed = clamp(a.speed + r.range(-0.2, 0.2) * dt, 0.15, a.def.speed * 0.35);
          if (bait && a.cooldown <= 0) {
            const dist = Math.hypot(a.d - bait.d, a.lat - bait.lat);
            const aff = speciesAffinity(a.def, { bait: bait.bait, baitDepth: bait.depth, onBottom: bait.onBottom, hour: bait.hour });
            const range = (DETECT[a.def.id] ?? 5) * (0.6 + 0.4 * Math.min(1, aff));
            if (dist < range && r.chance(clamp(aff, 0.05, 1.5) * 0.35 * dt)) {
              a.state = 'approach';
              a.stateT = 0;
            }
          }
          break;
        }
        case 'approach': {
          if (!bait) { a.state = 'wander'; break; }
          const dx = bait.d - a.d, dy = bait.lat - a.lat;
          const dist = Math.hypot(dx, dy);
          a.heading = Math.atan2(dy, dx);
          a.speed = Math.min(a.def.speed * 0.45, 0.5 + dist * 0.3);
          if (dist < 0.5) {
            a.state = 'at_bait';
            a.stateT = 0;
            arrived = a;
          }
          break;
        }
        case 'at_bait':
          a.speed = 0.05;
          a.heading += Math.sin(a.stateT * 3) * dt;
          if (!bait) this.flee(a);
          break;
        case 'flee':
          a.speed = a.def.speed * 0.9;
          if (a.stateT > 2.5) { a.state = 'wander'; a.stateT = 0; a.speed = 0.3; }
          break;
        case 'hooked':
          break;
      }
      if (a.state !== 'hooked' && a.state !== 'at_bait') {
        a.d += Math.cos(a.heading) * a.speed * dt;
        a.lat += Math.sin(a.heading) * a.speed * dt;
        // keep inside lake: turn back near the bank / far shore / sides
        if (a.d < 3) a.heading = r.range(-0.6, 0.6);
        if (a.d > this.maxCast + 6) a.heading = Math.PI + r.range(-0.6, 0.6);
        const lim = this.latLimit(a.d);
        if (Math.abs(a.lat) > lim) a.heading = Math.atan2(-Math.sign(a.lat), r.range(-0.5, 0.5));
      }
    }
    return arrived;
  }

  flee(a: FishAgent) {
    a.state = 'flee';
    a.stateT = 0;
    a.cooldown = 18;
    a.heading = a.heading + Math.PI + this.rng.range(-0.7, 0.7);
  }

  remove(a: FishAgent) {
    this.agents = this.agents.filter((x) => x !== a);
  }

  /** wake everyone up near a noisy splash: nearby fish scatter (GDD: tiếng động làm cá cảnh giác) */
  splash(d: number, lat: number, power: number) {
    for (const a of this.agents) {
      if (a.state === 'hooked') continue;
      if (Math.hypot(a.d - d, a.lat - lat) < 1.2 + power * 1.5) this.flee(a);
    }
  }

  /** pity / tutorial: send a fish toward the bait */
  lure(bait: Bait, species?: string) {
    const free = this.agents
      .filter((a) => a.state === 'wander' && a.cooldown <= 0 && (!species || a.def.id === species) && Math.hypot(a.d - bait.d, a.lat - bait.lat) < 8)
      .sort((p, q) => Math.hypot(p.d - bait.d, p.lat - bait.lat) - Math.hypot(q.d - bait.d, q.lat - bait.lat))[0];
    const a = free ?? this.spawn(bait, species);
    a.state = 'approach';
    a.stateT = 0;
    a.cooldown = 0;
    return a;
  }
}

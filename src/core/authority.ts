import { Rng, clamp, uid } from './rng';
import { BAIT_BY_ID, FISH_BY_ID, GEAR_BY_ID, ZONE_BY_ID, type BaitId, type FishDefinition, type GearDef, type ZoneDef, type ZoneId } from './data';
import { BiteSession, type BiteEvent, type HookResult } from './bite';
import { FishFight, DIFFICULTY, type FightControls, type FishFightState, type Difficulty } from './fishFight';
import type { StrikeDir } from './bite';
import { Perspective, inEllipse, pointInPolygon, waterDepth } from './perspective';
import { SaveStore, type CatchRecord, type Profile } from './profile';
import { School, type FishAgent, type Bait } from './school';

/**
 * The authority decides every outcome (landing point, which fish bites, weight, length).
 * The view only sends intents (cast direction/power, hook, reel/release/steer, land) and renders state.
 * It runs locally in Phase 1; the same API can sit behind a game server later (GDD §13).
 */
export interface CastIntent { targetX: number; targetY: number; power: number; overcharge: number }
export interface CastResult {
  x: number; y: number; d: number; lateral: number;
  outcome: 'water' | 'bank' | 'snag';
  waterDepth: number; onBottom: boolean; reason?: string;
}
export interface Loadout { rod: GearDef; reel: GearDef; line: GearDef; float: GearDef; net: GearDef }
export type AuthorityEvent = BiteEvent | { type: 'agent_arrived'; species: string } | { type: 'agent_fled'; species: string };

export class LocalAuthority {
  profile: Profile;
  zone!: ZoneDef;
  persp!: Perspective;
  rng = new Rng();
  school!: School;
  bite: BiteSession | null = null;
  fight: FishFight | null = null;
  cast: CastResult | null = null;
  private biter: FishAgent | null = null;
  hour = 6.5;
  lineSlack = 0;
  private waitT = 0;

  constructor() {
    this.profile = SaveStore.load();
  }

  save() {
    SaveStore.save(this.profile);
  }

  loadout(): Loadout {
    const e = this.profile.equip;
    const g = (id: string, fb: string) => GEAR_BY_ID[id] ?? GEAR_BY_ID[fb];
    return { rod: g(e.rod, 'can_trung'), reel: g(e.reel, 'may_nho'), line: g(e.line, 'day_vua'), float: g(e.float, 'phao_dai'), net: g(e.net ?? 'vot_nho', 'vot_nho') };
  }

  difficulty(): Difficulty {
    return this.profile.settings.difficulty ?? 'normal';
  }

  enterZone(id: ZoneId, vanishX: number) {
    this.zone = ZONE_BY_ID[id];
    this.persp = new Perspective(this.zone, vanishX);
    this.school = new School(this.zone, this.rng, this.maxCast(), (f) => this.rollWeight(f));
  }

  maxCast(): number {
    return this.loadout().rod.maxCast ?? 28;
  }

  /** distance reached by a given cast power (0..1) */
  powerToDist(power: number) {
    return 3 + clamp(power, 0, 1) * (this.maxCast() - 3);
  }
  distToPower(d: number) {
    return clamp((d - 3) / (this.maxCast() - 3), 0, 1);
  }

  requestCast(intent: CastIntent): CastResult {
    const p = this.persp;
    const aim = p.fromWorld(intent.targetX, intent.targetY);
    const dist = this.powerToDist(intent.power);
    // direction comes from the aim point, distance from the power; error grows when held at max (overcharge)
    const errM = 0.25 + clamp(intent.overcharge, 0, 2) * 1.8;
    const d = clamp(dist + this.rng.gauss() * errM * 0.7, 2.5, this.maxCast() + 1.5);
    const latAtAim = aim.lateral * (d / Math.max(1, aim.d)); // same direction, new distance
    const lateral = latAtAim + this.rng.gauss() * errM * 0.5;
    const w = p.toWorld(d, lateral);
    const wd = waterDepth(this.zone, d);
    const onBottom = this.profile.depth >= wd - 0.05;
    const res: CastResult = { x: w.x, y: w.y, d, lateral, outcome: 'water', waterDepth: wd, onBottom };
    this.profile.stats.casts++;
    if (!pointInPolygon(w.x, w.y, this.zone.water)) {
      res.outcome = 'bank';
      res.reason = 'Phao rơi ra ngoài vùng nước — thu dây (R) và ném lại.';
    } else if (this.zone.snags.some((e) => inEllipse(w.x, w.y, e)) && this.rng.chance(this.zone.snagChance || 0.9)) {
      res.outcome = 'snag';
      res.reason = 'Phao mắc vào đám sen! Thu dây (R) và ném vào chỗ nước trống.';
    }
    this.cast = res;
    this.lineSlack = 0.12 + d * 0.014;
    this.waitT = 0;
    if (res.outcome === 'water') {
      this.bite = new BiteSession({
        zone: this.zone, bait: this.profile.bait, baitDepth: Math.min(this.profile.depth, wd), waterDepth: wd, onBottom,
        hour: this.hour, lineStealth: this.loadout().line.stealth ?? 1, rodSensitivity: this.loadout().rod.sensitivity ?? 1,
        assist: this.profile.settings.assist, newbie: this.profile.stats.catches === 0, rng: this.rng, spookedFor: 0, agentDriven: true,
        lineSlack: this.lineSlack,
        react: DIFFICULTY[this.difficulty()].react,
      });
      this.school.splash(d, lateral, intent.power);
      if (this.profile.stats.catches === 0) this.school.lure(this.baitInfo()!, 'ro_phi'); // first fish arrives quickly
    } else this.bite = null;
    this.save();
    return res;
  }

  baitInfo(): Bait | null {
    if (!this.cast || this.cast.outcome !== 'water') return null;
    return { d: this.cast.d, lat: this.cast.lateral, bait: this.profile.bait, depth: Math.min(this.profile.depth, this.cast.waterDepth), onBottom: this.cast.onBottom, hour: this.hour };
  }

  /** world tick: fish swim, detect bait, approach; bite state machine runs once a fish is at the bait */
  tick(dt: number, hour: number): AuthorityEvent[] {
    this.hour = hour;
    const ev: AuthorityEvent[] = [];
    const bait = this.fight ? null : this.baitInfo();
    const arrived = this.school.update(dt, bait);
    if (bait) this.waitT += dt;
    if (bait && this.bite && this.bite.state === 'WAITING' && !this.biter) {
      if (arrived && this.bite.forceApproach(arrived.def)) {
        this.biter = arrived;
        ev.push({ type: 'agent_arrived', species: arrived.def.id });
      } else if (this.waitT > 28 && !this.school.agents.some((a) => a.state === 'approach')) {
        this.school.lure(bait); // GDD: người chơi không bị bỏ mặc chờ vô vọng
        this.waitT = 10;
      }
    }
    if (this.bite) {
      this.bite.setContext({ hour, lineSlack: this.lineSlack });
      for (const e of this.bite.update(dt)) {
        ev.push(e);
        if (e.type === 'leave' || e.type === 'spit') {
          if (this.biter) {
            this.school.flee(this.biter);
            ev.push({ type: 'agent_fled', species: this.biter.def.id });
          }
          this.biter = null;
          if (e.baitLost) this.profile.stats.baitLost = (this.profile.stats.baitLost ?? 0) + 1;
        }
      }
      if (this.bite.state === 'WAITING' && this.biter) this.biter = null;
    }
    return ev;
  }

  baitLostOnHook() {
    return this.cast?.outcome === 'water' && (this.profile.stats.baitLost ?? 0) > 0;
  }

  mendLine(dt: number, reeling: boolean, wind: number) {
    if (!this.bite || this.fight) return;
    this.lineSlack = clamp(this.lineSlack + (reeling ? -0.65 : Math.abs(wind) * 0.003) * dt, 0.03, 1.5);
    this.bite.setContext({ lineSlack: this.lineSlack });
  }

  hook(dir: StrikeDir = 'up', strong: boolean | number = false): HookResult {
    if (!this.bite || !this.cast) return { ok: false, state: 'WAITING', quality: 0, reason: 'Chưa có phao dưới nước.' };
    const res = this.bite.hook(dir, strong);
    const sp = this.bite.species;
    if (res.ok && sp && this.biter) {
      this.biter.state = 'hooked';
      const lo = this.loadout();
      const cover = this.zone.snags.length ? 0.6 : 0.35;
      this.fight = new FishFight(sp, this.biter.weight, {
        rodPower: lo.rod.power ?? 1, reelSpeed: lo.reel.reelSpeed ?? 1, maxDrag: lo.reel.drag ?? 0.8,
        capacity: lo.reel.capacity ?? 70, lineStrength: lo.line.strength ?? 1, netSize: lo.net.netSize ?? 0.35,
      }, this.cast.d, this.cast.lateral, this.rng, this.difficulty(), res.quality * 100, cover);
      this.fight.setObstacles(this.zone.snags.map(e => {
        const center = this.persp.fromWorld(e.x, e.y);
        return { d: center.d, lateral: center.lateral, rx: e.rx / this.persp.ppm(center.d),
          rd: Math.max(0.2, Math.abs(this.persp.dOf(e.y + e.ry) - this.persp.dOf(e.y - e.ry)) / 2) };
      }));
    } else if (!res.ok && this.biter) {
      this.school.flee(this.biter);
      this.biter = null;
    }
    return res;
  }

  private rollWeight(def: FishDefinition) {
    let u = Math.pow(this.rng.next(), 2.1);
    if (this.rng.chance(0.04)) u = this.rng.range(0.86, 1);
    return Math.round((def.minWeight + (def.maxWeight - def.minWeight) * u) * 100) / 100;
  }

  fightTick(dt: number, input: FightControls): FishFightState | null {
    if (!this.fight) return null;
    const s = this.fight.update(dt, input);
    if (this.biter) {
      this.biter.d = s.dist;
      this.biter.lat = s.lateral;
    }
    if (s.phase === 'escaped') {
      this.profile.stats.escapes++;
      if (this.biter) {
        this.biter.state = 'wander';
        this.school.flee(this.biter);
      }
      this.biter = null;
      this.save();
    }
    return s;
  }

  /** called once the fight reports phase 'landed' (net scoop succeeded) */
  takeCatch(): { ok: boolean; reason: string; record?: CatchRecord } {
    if (!this.fight || !this.biter || this.fight.s.phase !== 'landed') return { ok: false, reason: '' };
    const a = this.biter;
    const def = a.def;
    const length = Math.round(def.maxLength * Math.cbrt(a.weight / def.maxWeight) * this.rng.range(0.96, 1.04));
    const rec: CatchRecord = {
      id: uid(), species: def.id, weight: a.weight, length, bait: this.profile.bait, zone: this.zone.id,
      hour: Math.floor(this.hour), at: Date.now(), quality: this.fight.quality(), trophy: a.weight >= def.maxWeight * 0.85,
    };
    this.school.remove(a);
    this.biter = null;
    this.profile.catches.unshift(rec);
    if (this.profile.catches.length > 80) this.profile.catches.length = 80;
    this.save();
    return { ok: true, reason: '', record: rec };
  }

  endCastCycle() {
    if (this.biter) this.school.flee(this.biter);
    this.biter = null;
    this.bite = null;
    this.fight = null;
    this.cast = null;
  }

  /** Idempotent: one catch id is recorded once even if the call repeats. */
  decide(id: string, decision: 'keep' | 'release'): { newSpecies: boolean; record: boolean } | null {
    const p = this.profile;
    if (p.processed.includes(id)) return null;
    const rec = p.catches.find((c) => c.id === id);
    if (!rec) return null;
    p.processed.push(id);
    if (p.processed.length > 200) p.processed.splice(0, p.processed.length - 200);
    rec.decision = decision;
    const j = (p.journal[rec.species] ??= { caught: 0, released: 0, maxWeight: 0, maxLength: 0, firstAt: Date.now(), baits: {}, zones: {}, hours: [0, 0, 0, 0, 0, 0], variants: [] });
    const newSpecies = j.caught === 0;
    const record = j.caught > 0 && rec.weight > j.maxWeight;
    j.caught++;
    j.maxWeight = Math.max(j.maxWeight, rec.weight);
    j.maxLength = Math.max(j.maxLength, rec.length);
    j.baits[rec.bait] = (j.baits[rec.bait] ?? 0) + 1;
    if (decision === 'release') { j.released++; p.stats.released++; }
    p.stats.catches++;
    p.stats.totalWeight += rec.weight;
    this.save();
    return { newSpecies, record };
  }

  setBait(b: BaitId) {
    this.profile.bait = b;
    this.save();
  }
  setDepth(m: number) {
    this.profile.depth = Math.round(clamp(m, 0.25, 4) * 4) / 4;
    this.save();
  }
  baitName() {
    return BAIT_BY_ID[this.profile.bait].name;
  }
  fishDef(id: string) {
    return FISH_BY_ID[id];
  }
}

export { DIFFICULTY };

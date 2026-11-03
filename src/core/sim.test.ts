import { describe, it, expect } from 'vitest';
import { FightSim, type FightInput, type FightState } from './fight';
import { BiteSession } from './bite';
import { FISH_BY_ID, ZONE_BY_ID } from './data';
import { Rng } from './rng';

const gearLight = { rodPower: 0.8, reelSpeed: 1, drag: 0.55, capacity: 70, lineStrength: 0.85 };
const gearHeavy = { rodPower: 1.35, reelSpeed: 1.35, drag: 0.8, capacity: 130, lineStrength: 1.4 };

type Bot = (s: FightState) => FightInput;
const skilled: Bot = (s) => ({
  steer: -Math.sign(s.fishDirection || 1),
  reel: s.tension < 68 ? 1 : 0,
  release: s.tension > 86 ? 1 : 0,
});
const holdReel: Bot = () => ({ steer: 0, reel: 1, release: 0 });
const idle: Bot = () => ({ steer: 0, reel: 0, release: 0 });

function run(fishId: string, weightU: number, gear: typeof gearLight, bot: Bot, seed: number) {
  const f = FISH_BY_ID[fishId];
  const w = f.minWeight + (f.maxWeight - f.minWeight) * weightU;
  const sim = new FightSim(f, w, gear, 14, 0, new Rng(seed), 0.6);
  const dt = 1 / 30;
  for (let t = 0; t < 240; t += dt) {
    const s = sim.update(dt, bot(sim.s));
    if (s.phase === 'landing') sim.tryLand();
    if (sim.s.phase === 'landed') return { ok: true, t, reason: '' };
    if (s.phase === 'escaped') return { ok: false, t, reason: s.escapeReason };
  }
  return { ok: false, t: 240, reason: 'timeout' };
}

function rate(fishId: string, u: number, gear: typeof gearLight, bot: Bot, n = 60) {
  let ok = 0, time = 0;
  const reasons: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const r = run(fishId, u, gear, bot, 1000 + i);
    if (r.ok) { ok++; time += r.t; } else reasons[r.reason!] = (reasons[r.reason!] ?? 0) + 1;
  }
  return { rate: ok / n, avgT: ok ? time / ok : 0, reasons };
}

describe('fight balance', () => {
  it('skilled play lands small fish quickly', () => {
    const r = rate('ro_phi', 0.4, gearLight, skilled);
    console.log('ro_phi skilled', r);
    expect(r.rate).toBeGreaterThan(0.85);
    expect(r.avgT).toBeLessThan(40);
  });
  it('strong / fast fish are winnable but harder', () => {
    for (const id of ['ca_chep', 'ca_loc', 'tram_co', 'ca_tre']) {
      const r = rate(id, 0.5, gearLight, skilled);
      const h = rate(id, 0.5, gearHeavy, skilled);
      console.log(id, 'light', r, 'heavy', h);
      expect(h.rate).toBeGreaterThan(0.5);
    }
  });
  it('legendary needs heavy gear', () => {
    const h = rate('ca_huyen_thoai', 0.5, gearHeavy, skilled, 30);
    console.log('legendary heavy', h);
    expect(h.rate).toBeGreaterThan(0.2);
  });
  it('holding reel only is punished, idling is punished', () => {
    const a = rate('ca_chep', 0.5, gearLight, holdReel);
    const b = rate('ro_phi', 0.4, gearLight, idle);
    console.log('holdReel chep', a, 'idle ro_phi', b);
    expect(a.rate).toBeLessThan(0.35);
    expect(b.rate).toBeLessThan(0.2);
  });
});

describe('bite pacing', () => {
  it('newbie gets a bite quickly, regular play waits a reasonable time', () => {
    for (const newbie of [true, false]) {
      let total = 0;
      const n = 40;
      for (let i = 0; i < n; i++) {
        const b = new BiteSession({ zone: ZONE_BY_ID.bo_co, bait: 'giun', baitDepth: 1, waterDepth: 1.6, onBottom: false, hour: 8, lineStealth: 1.15, rodSensitivity: 1.25, assist: true, newbie, rng: new Rng(77 + i), spookedFor: 0 });
        let t = 0;
        for (; t < 300; t += 0.1) {
          const ev = b.update(0.1);
          if (ev.some((e) => e.type === 'window')) break;
        }
        total += t;
      }
      console.log('newbie', newbie, 'avg time to hook window', (total / n).toFixed(1));
      expect(total / n).toBeLessThan(newbie ? 25 : 70);
    }
  });
});

describe('human-like play', () => {
  it('reports win rates with reaction lag and imperfect steering', () => {
    for (const [id, gear, label] of [['ro_phi', gearLight, 'L'], ['ca_chep', gearLight, 'L'], ['ca_loc', gearLight, 'L'], ['tram_co', gearLight, 'L'], ['ca_huyen_thoai', gearLight, 'L'], ['ca_huyen_thoai', gearHeavy, 'H']] as const) {
      let ok = 0; const reasons: Record<string, number> = {};
      for (let i = 0; i < 50; i++) {
        const f = FISH_BY_ID[id];
        const rng = new Rng(500 + i);
        const sim = new FightSim(f, f.minWeight + (f.maxWeight - f.minWeight) * 0.5, gear, 14, 0, rng, 0.6);
        const hist: FightState[] = [];
        let steerGuess = 0, res = 'timeout';
        for (let t = 0; t < 240; t += 1 / 30) {
          hist.push({ ...sim.s });
          const seen = hist[Math.max(0, hist.length - 11)]; // ~0.35 s reaction
          if (rng.chance(0.03)) steerGuess = rng.chance(0.7) ? -Math.sign(seen.fishDirection || 1) : Math.sign(seen.fishDirection || 1);
          const inp = { steer: steerGuess, reel: seen.tension < 62 ? 1 : 0, release: seen.tension > 84 ? 1 : 0 };
          const s = sim.update(1 / 30, inp);
          if (s.phase === 'landing' && rng.chance(0.08)) sim.tryLand();
          if (sim.s.phase === 'landed') { ok++; res = ''; break; }
          if (s.phase === 'escaped') { res = s.escapeReason!; break; }
        }
        if (res) reasons[res] = (reasons[res] ?? 0) + 1;
      }
      console.log('human', id, label, ok / 50, reasons);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { FishFight, type FightControls, type FishFightState, type Difficulty, type FightGear } from './fishFight';
import { FISH_BY_ID } from './data';
import { Rng, clamp } from './rng';

const GEAR = {
  light: { rodPower: 0.8, reelSpeed: 1, maxDrag: 0.85, capacity: 70, lineStrength: 0.85, netSize: 0.35 },
  mid: { rodPower: 1.0, reelSpeed: 1, maxDrag: 1, capacity: 90, lineStrength: 1.05, netSize: 0.35 },
  heavy: { rodPower: 1.35, reelSpeed: 1.35, maxDrag: 1, capacity: 130, lineStrength: 1.4, netSize: 0.5 },
} satisfies Record<string, FightGear>;

type Bot = (s: FishFightState, f: FishFight, rng: Rng) => FightControls;

/** plays with every system: balance, rod band, drag, reel gear, landing */
const skilled = (lag = 0, noise = 0): Bot => {
  return (s, _f, rng) => {
    const n = () => (noise ? rng.range(-noise, noise) : 0);
    const mid = (s.idealAngle[0] + s.idealAngle[1]) / 2;
    const danger = s.behavior === 'BURST' || s.next === 'BURST' || s.lineTension > 82;
    const targetDrag = danger ? 0.25 : s.behavior === 'SULKING' ? 0.6 : 0.45;
    const reelOk = !danger && s.lineTension + n() * 100 < 62 && s.behavior !== 'SHAKING' && s.behavior !== 'JUMPING';
    const gear = s.behavior === 'RESTING' || s.behavior === 'FAKE_REST' || s.behavior === 'EXHAUSTED' ? 3 : s.behavior === 'SULKING' ? 1 : 2;
    const landing = s.dist < 4.2 && s.fishStamina < 40;
    void lag;
    return {
      balance: clamp(-s.fishDir * 0.7 + n(), -1, 1),
      rodCmd: Math.abs(mid - s.rodAngle) > 0.05 ? Math.sign(mid - s.rodAngle) : 0,
      dragCmd: Math.abs(targetDrag - s.drag) > 0.05 ? Math.sign(targetDrag - s.drag) : 0,
      reel: reelOk ? gear : 0,
      netOut: landing,
      netX: s.landing.fishX + n() * 0.3,
      scoop: s.phase === 'landing' && s.landing.window !== 'lunge' && s.landing.ready > 0.6 && rng.chance(0.15),
    };
  };
};

function fight(fishId: string, u: number, gear: FightGear, diff: Difficulty, bot: Bot, seed: number, hook = 85, laggy = 0) {
  const f = FISH_BY_ID[fishId];
  const w = f.minWeight + (f.maxWeight - f.minWeight) * u;
  const rng = new Rng(seed);
  const sim = new FishFight(f, w, gear, 14, 0, rng, diff, hook, 0.6);
  const hist: FishFightState[] = [];
  let inp: FightControls = { balance: 0, rodCmd: 0, dragCmd: 0, reel: 0, netOut: false, netX: 0, scoop: false };
  const dt = 1 / 30;
  for (let t = 0, i = 0; t < 400; t += dt, i++) {
    hist.push({ ...sim.s, landing: { ...sim.s.landing } });
    const prevNet = inp.netX;
    if (!laggy || i % 7 === 0) inp = bot(hist[Math.max(0, hist.length - 1 - laggy)], sim, rng);
    else inp = { ...inp, scoop: false };
    if (laggy) inp = { ...inp, netX: prevNet + clamp(inp.netX - prevNet, -0.12, 0.12) }; // the mouse moves smoothly
    const s = sim.update(dt, inp);
    if (s.phase === 'landed') return { ok: true, t, why: '' };
    if (s.phase === 'escaped') return { ok: false, t, why: s.escapeReason! };
  }
  return { ok: false, t: 400, why: 'timeout' };
}
function rate(id: string, u: number, gear: FightGear, diff: Difficulty, bot: Bot, n = 40, laggy = 0) {
  let ok = 0, T = 0;
  const why: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const r = fight(id, u, gear, diff, bot, 900 + i, 85, laggy);
    if (r.ok) { ok++; T += r.t; } else why[r.why] = (why[r.why] ?? 0) + 1;
  }
  return { rate: +(ok / n).toFixed(2), avgT: ok ? +(T / ok).toFixed(1) : 0, why };
}

const idle: Bot = () => ({ balance: 0, rodCmd: 0, dragCmd: 0, reel: 0, netOut: false, netX: 0, scoop: false });
const tightDrag: Bot = (s, f, r) => ({ ...skilled()(s, f, r), dragCmd: 1, reel: 2 });
const looseDrag: Bot = (s, f, r) => ({ ...skilled()(s, f, r), dragCmd: -1 });

describe('Fish Fight System', () => {
  it('skilled play wins across species (normal, mid gear)', () => {
    for (const id of ['ro_phi', 'ca_tre', 'ca_loc', 'ca_chep', 'tram_co']) {
      const r = rate(id, 0.5, { ...GEAR.mid, netSize: 0.55 }, 'normal', skilled());
      console.log('skilled', id, r);
      expect(r.rate).toBeGreaterThan(0.55);
    }
  });
  it('human-like play (lag, noise) by difficulty', { timeout: 60000 }, () => {
    for (const diff of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const line = ['ro_phi', 'ca_tre', 'ca_loc', 'ca_chep', 'tram_co'].map((id) => { const r = rate(id, 0.5, { ...GEAR.mid, netSize: 0.55 }, diff, skilled(0, 0.25), 30, 12); return `${id}:${r.rate} ${JSON.stringify(r.why)}`; });
      console.log('human', diff, line.join(' '));
    }
  });
  it('big fish need suitable gear', () => {
    const light = rate('tram_co', 0.95, GEAR.light, 'normal', skilled());
    const heavy = rate('tram_co', 0.95, GEAR.heavy, 'normal', skilled());
    console.log('trắm 19kg light', light, 'heavy', heavy);
    expect(heavy.rate).toBeGreaterThan(light.rate);
  });
  it('each failure mode can lose the fish', () => {
    // Neutral rod steering is legitimate; line mismanagement is the failure.
    const cases: Array<[string, Bot, string]> = [['idle', idle, 'ca_chep'],
      ['tightDrag', tightDrag, 'ca_loc'], ['looseDrag', looseDrag, 'tram_co']];
    for (const [name, bot, id] of cases) {
      const r = rate(id, 0.7, GEAR.mid, 'normal', bot, 30);
      console.log('fail-mode', name, id, r);
      expect(r.rate).toBeLessThan(0.5);
    }
  });
});

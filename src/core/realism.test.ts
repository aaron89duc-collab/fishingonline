import { describe, expect, it } from 'vitest';
import { solveLine, type LineState } from './linePhysics';
import { Weather } from './weather';
import { BiteSession } from './bite';
import { FishFight, type FightControls } from './fishFight';
import { FISH_BY_ID, ZONE_BY_ID } from './data';
import { Rng } from './rng';

const controls: FightControls = { reel: 0, balance: 0, rodCmd: 0, dragCmd: 0, netOut: false, netX: 0, scoop: false };
const gear = { rodPower: 1, reelSpeed: 1, maxDrag: 1, capacity: 90, lineStrength: 1.05, netSize: 0.55 };
const line = (): LineState => ({ lineOut: 10, slack: 0, stretch: 0, tension: 0, rodLoad: 0, slipRate: 0, retrieveRate: 0 });

describe('rod, line and drag', () => {
  it('retrieving slack does not load the hook until the line becomes taut', () => {
    const s = line();
    solveLine(s, 0.1, 9, 1, 0.4, 1, 1, 1);
    expect(s.slack).toBeCloseTo(0.9);
    expect(s.tension).toBe(0);
    for (let i = 0; i < 180; i++) solveLine(s, 1/120, 9, 1, 0.4, 1, 1, 1);
    expect(s.tension).toBeGreaterThan(0);
    expect(s.lineOut).toBeLessThan(9);
  });
  it('a loose drag pays out line and reduces force compared with a locked drag', () => {
    const loose = line(), tight = line();
    for (let i = 0; i < 120; i++) {
      solveLine(loose, 1/120, 11, 0, 0.2, 1, 1, 1);
      solveLine(tight, 1/120, 11, 0, 1, 1, 1, 1);
    }
    expect(loose.lineOut).toBeGreaterThan(tight.lineOut);
    expect(loose.tension).toBeLessThan(tight.tension);
  });
  it('pumping the rod loads the line and lowering it releases that length', () => {
    const s = line();
    solveLine(s, 1/120, 10.4, 0, 0.8, 1, 1, 1);
    const raised = s.tension;
    solveLine(s, 1/120, 9.8, 0, 0.8, 1, 1, 1);
    expect(s.tension).toBeLessThan(raised);
    expect(s.slack).toBeGreaterThan(0);
  });
});

function bite(slack: number) {
  const b = new BiteSession({ zone: ZONE_BY_ID.bo_co, bait: 'giun', baitDepth: 1,
    waterDepth: 2, onBottom: false, hour: 8, lineStealth: 1, rodSensitivity: 1,
    assist: false, newbie: false, rng: new Rng(19), spookedFor: 0, lineSlack: slack });
  b.species = FISH_BY_ID.ro_phi;
  b.state = 'HOOK_WINDOW'; b.stateT = 0.5; b.dur = 1.2;
  return b;
}
describe('physical hook setting', () => {
  it('the same timely strike succeeds on taut line but cannot cross excessive slack', () => {
    const taut = bite(0.03), loose = bite(1.5);
    expect(taut.hook('up', 0.48).ok).toBe(true);
    const miss = loose.hook('up', 0.48);
    expect(miss.ok).toBe(false);
    expect(miss.transmitted).toBe(0);
  });
});

function landing(seed = 1, netSize = 0.55) {
  const f = new FishFight(FISH_BY_ID.ro_phi, 0.8, { ...gear, netSize }, 2, 0, new Rng(seed), 'normal', 90, 0);
  f.s.fishStamina = 0; f.s.behavior = 'EXHAUSTED'; f.s.depth = 0.05;
  return f;
}
describe('geometric landing', () => {
  it('a submerged aligned net lands a tired fish across seeds without a random failure', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const f = landing(seed);
      for (let i = 0; i < 120; i++) {
        f.update(1/60, { ...controls, netOut: true, netX: f.s.lateral,
          netDistance: f.s.dist, netDepth: 0.35, scoop: i > 60 });
        if (f.s.phase === 'landed') break;
      }
      expect(f.s.phase).toBe('landed');
    }
  });
  it('scooping open water never applies arbitrary hook damage', () => {
    const f = landing();
    const before = f.s.hookStrength;
    f.update(1/60, { ...controls, netOut: true, netX: 4, scoop: true });
    expect(f.s.phase).not.toBe('landed');
    expect(f.s.hookStrength).toBe(before);
  });
  it('a net above the fish or too small cannot register a catch', () => {
    for (const small of [false, true]) {
      const f = landing(1, small ? 0.05 : 0.55);
      for (let i = 0; i < 100; i++) f.update(1/60, { ...controls, netOut: true,
        netX: f.s.lateral, netDistance: f.s.dist, netDepth: small ? 0.35 : 0.02, scoop: true });
      expect(f.s.phase).not.toBe('landed');
      expect(f.s.landing.ready).toBe(0);
    }
  });
  it('actual cover intersects the line; empty water never rolls a snag', () => {
    const f = new FishFight(FISH_BY_ID.ca_chep, 4, gear, 14, 0, new Rng(9), 'normal', 90, 1);
    f.setObstacles([{ d: 6, lateral: 0, rd: 4, rx: 10 }]);
    for (let i = 0; i < 1200; i++) {
      f.update(1/60, { ...controls, reel: 1 });
      if (f.s.phase === 'escaped') break;
    }
    expect(f.s.escapeReason).toBe('snag');
  });
  it('integration is equivalent at 30 and 60 FPS', () => {
    const a = landing(), b = landing();
    for (let i = 0; i < 120; i++) a.update(1/60, controls);
    for (let i = 0; i < 60; i++) b.update(1/30, controls);
    expect(a.s.dist).toBeCloseTo(b.s.dist, 7);
    expect(a.s.lineTension).toBeCloseTo(b.s.lineTension, 7);
  });
});

describe('weather transitions', () => {
  it('forecasts clouds before transitioning and does not jump into rain', () => {
    const w = new Weather(new Rng(1));
    w.update(w.remaining - 10);
    expect(w.forecast).not.toBe('');
    expect(w.cloud).toBe(0);
    w.update(20);
    expect(w.transitioning).toBe(true);
    expect(w.cloud).toBeGreaterThan(0);
    expect(w.cloud).toBeLessThan(0.65);
    expect(w.rain).toBe(0);
    w.update(10);
    expect(w.kind).toBe('cloudy');
    expect(w.cloud).toBeCloseTo(0.65);
  });
  it('handles large timesteps like small ones and reaches rain then clears', () => {
    const a = new Weather(new Rng(3)), b = new Weather(new Rng(3));
    a.update(700);
    for (let i = 0; i < 7000; i++) b.update(0.1);
    expect(a.kind).toBe(b.kind);
    expect(a.rain).toBeCloseTo(b.rain, 6);
    expect(a.cloud).toBeCloseTo(b.cloud, 6);
    expect(a.remaining).toBeCloseTo(b.remaining, 6);
  });
});

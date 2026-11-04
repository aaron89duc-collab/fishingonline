import { describe, it, expect } from 'vitest';
import { BiteSession, type StrikeDir } from './bite';
import { ZONE_BY_ID } from './data';
import { Rng } from './rng';

function strike(seed: number, pick: (b: BiteSession) => { dir: StrikeDir; strong: boolean }, waitIdeal = true) {
  const b = new BiteSession({ zone: ZONE_BY_ID.bo_co, bait: 'giun', baitDepth: 1, waterDepth: 1.6, onBottom: false, hour: 8, lineStealth: 1, rodSensitivity: 1, assist: false, newbie: false, rng: new Rng(seed), spookedFor: 0 });
  for (let t = 0; t < 400; t += 0.02) {
    b.update(0.02);
    if (b.state === 'HOOK_WINDOW' && (!waitIdeal || b.hookZone() === 'ideal')) {
      const { dir, strong } = pick(b);
      return b.hook(dir, strong);
    }
  }
  return null;
}

describe('hook setting', () => {
  it('right timing + right direction + right strength beats wrong direction', () => {
    let good = 0, bad = 0, n = 0;
    for (let i = 0; i < 40; i++) {
      const g = strike(100 + i, (b) => ({ dir: b.bestStrike(), strong: b.species?.id !== 'ro_phi' }));
      const w = strike(100 + i, (b) => { const d = b.bestStrike(); return { dir: d === 'up' ? 'left' : d === 'left' ? 'right' : 'left', strong: b.species?.id === 'ro_phi' }; });
      if (!g || !w) continue;
      n++;
      good += g.ok ? g.quality : 0;
      bad += w.ok ? w.quality : 0;
    }
    expect(n).toBeGreaterThan(20);
    console.log('avg hook quality good', (good / n).toFixed(2), 'bad', (bad / n).toFixed(2));
    expect(good / n).toBeGreaterThan(0.7);
    expect(bad / n).toBeLessThan(good / n * 0.6);
  });
});

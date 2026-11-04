import { describe, it, expect } from 'vitest';
import { BiteSession } from './bite';
import { ZONE_BY_ID } from './data';
import { Rng } from './rng';

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


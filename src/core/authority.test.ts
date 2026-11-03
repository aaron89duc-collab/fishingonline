import { describe, it, expect } from 'vitest';
import { LocalAuthority } from './authority';

function castAndWait(a: LocalAuthority, newbie: boolean, maxT = 180) {
  if (!newbie) a.profile.stats.catches = 5;
  const p = a.persp.toWorld(10, 0);
  const r = a.requestCast({ targetX: p.x, targetY: p.y, power: a.distToPower(10), overcharge: 0 });
  expect(r.outcome).toBe('water');
  const seen: string[] = [];
  for (let t = 0; t < maxT; t += 0.05) {
    for (const e of a.tick(0.05, 8)) seen.push(e.type);
    if (a.bite?.state === 'HOOK_WINDOW') return { t, seen };
  }
  return { t: -1, seen };
}

describe('authority + school', () => {
  it('a fish reaches the bait and a hook window opens', () => {
    const times: number[] = [];
    let leaves = 0;
    for (let i = 0; i < 20; i++) {
      const a = new LocalAuthority();
      a.enterZone('bo_co', 1440);
      const r = castAndWait(a, i < 5);
      times.push(r.t);
      leaves += r.seen.filter((x) => x === 'leave' || x === 'agent_fled').length;
    }
    console.log('time to window', times.map((t) => t.toFixed(1)).join(' '), 'leaves', leaves);
    expect(times.filter((t) => t > 0).length).toBeGreaterThan(16);
  });
  it('hooking in the window starts a fight that can be landed; decide is idempotent', () => {
    const a = new LocalAuthority();
    a.enterZone('bo_co', 1440);
    const r = castAndWait(a, true);
    expect(r.t).toBeGreaterThan(0);
    const h = a.hook();
    expect(a.fight).not.toBeNull();
    void h;
    let landed = false;
    for (let t = 0; t < 200 && a.fight; t += 1 / 30) {
      const s = a.fightTick(1 / 30, { steer: -Math.sign(a.fight.s.fishDirection || 1), reel: a.fight.s.tension < 65 ? 1 : 0, release: a.fight.s.tension > 85 ? 1 : 0 })!;
      if (s.phase === 'landing') { const res = a.tryLand(); if (res.ok) { landed = true; const id = res.record!.id; expect(a.decide(id, 'release')).not.toBeNull(); expect(a.decide(id, 'release')).toBeNull(); break; } }
      if (s.phase === 'escaped') break;
    }
    expect(landed).toBe(true);
  });
  it('hooking during nibble misses', () => {
    const a = new LocalAuthority();
    a.enterZone('bo_co', 1440);
    const p = a.persp.toWorld(10, 0);
    a.requestCast({ targetX: p.x, targetY: p.y, power: a.distToPower(10), overcharge: 0 });
    for (let t = 0; t < 120 && a.bite?.state !== 'NIBBLE'; t += 0.05) a.tick(0.05, 8);
    expect(a.bite?.state).toBe('NIBBLE');
    const h = a.hook();
    expect(h.ok).toBe(false);
    expect(a.fight).toBeNull();
  });
  it('cast lands where aimed when power matches the aim distance', () => {
    const a = new LocalAuthority();
    a.enterZone('bo_co', 1440);
    let err = 0;
    for (let i = 0; i < 50; i++) {
      const d = 6 + (i % 8) * 2, lat = (i % 5) - 2;
      const p = a.persp.toWorld(d, lat);
      const r = a.requestCast({ targetX: p.x, targetY: p.y, power: a.distToPower(d), overcharge: 0 });
      err += Math.hypot(r.d - d, r.lateral - lat);
    }
    console.log('mean cast error (m)', (err / 50).toFixed(2));
    expect(err / 50).toBeLessThan(0.8);
  });
});

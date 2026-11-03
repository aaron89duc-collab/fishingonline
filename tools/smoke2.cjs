// Edge paths: cast onto lotus (snag) → retrieve; bad fight (hold reel) → line break → new round without reload; mobile portrait
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173/?speed=8');
  await page.waitForFunction(() => window.__fwo && window.__fwo.scene.isActive('menu'), null, { timeout: 60000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => { const s = window.__fwo.scene.getScene('fishing'); return s && s.hud; }, null, { timeout: 20000 });
  const r = await page.evaluate(async () => {
    const s = window.__fwo.scene.getScene('fishing');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const res = {};
    // 1) snag: aim at the lotus cluster centre with matching power
    const e = s.auth.zone.snags[0];
    const d = s.auth.persp.dOf(e.y);
    s.auth.rng.chance = () => true; // force the snag roll for the test
    s.aim.x = e.x; s.aim.y = e.y; s.mode = 'charging'; s.power = s.auth.distToPower(d); s.over = 0;
    s.release();
    while (s.mode === 'flight') await sleep(50);
    res.snag = s.mode + ':' + s.auth.cast.outcome;
    delete s.auth.rng.chance;
    s.retrieve();
    while (s.mode === 'retrieve') await sleep(50);
    res.afterRetrieve = s.mode;
    // 2) water cast, hook in window, then bad play: hold reel → expect line break
    const p = s.auth.persp.toWorld(9, 0);
    s.aim.x = p.x; s.aim.y = p.y; s.mode = 'charging'; s.power = s.auth.distToPower(9); s.release();
    while (s.mode === 'flight') await sleep(50);
    let t0 = performance.now();
    while (s.auth.bite && s.auth.bite.state !== 'HOOK_WINDOW' && performance.now() - t0 < 120000) await sleep(30);
    s.onPrimaryDown(false);
    res.hooked = s.mode;
    t0 = performance.now();
    while (s.mode === 'fight' && performance.now() - t0 < 120000) { await sleep(30); } // no input at all → slack
    res.escape = s.mode + ':' + (s.fightState && s.fightState.escapeReason); res.fs = s.fightState && { ...s.fightState }; res.inp = { ...s.input2 }; res.fps = window.__fwo.loop.actualFps;
    while (s.mode === 'escaped') await sleep(50);
    res.after = s.mode;
    res.stats = s.auth.profile.stats;
    return res;
  });
  console.log(JSON.stringify(r));
  await page.screenshot({ path: out + '/11_after_escape.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/12_portrait.png' });
  console.log('errors', errs);
  await b.close();
})();

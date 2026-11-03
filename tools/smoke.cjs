//  Headless smoke test: menu → fishing → cast → wait for bite → hook → fight → land / escape
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '/home/claude/shots';
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:4173/?speed=' + (process.argv[3] || 1), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__fwo && window.__fwo.scene.isActive('menu'), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + '/01_menu.png' });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => { const s = window.__fwo.scene.getScene('fishing'); return s && s.hud; }, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/02_idle.png' });
  // canvas coords: game is 1920x1080 scaled into 1600x900
  const k = 960 / 1920;
  const P = (x, y) => [x * k, y * k];
  await page.mouse.move(...P(900, 640));
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.screenshot({ path: out + '/03_charging.png' });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/04_flight.png' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/05_wait.png' });
  const info = await page.evaluate(() => { const s = window.__fwo.scene.getScene('fishing'); return { mode: s.mode, cast: s.auth.cast }; });
  console.log('after cast', JSON.stringify(info));
  // in-page bot (no round-trips): wait for hook window, hook, then fight with a simple skilled strategy
  const key = (type, code) => `window.dispatchEvent(new KeyboardEvent('${type}', { code: '${code}', key: '${code === 'Space' ? ' ' : code.slice(-1).toLowerCase()}', keyCode: ${ {Space:32,KeyA:65,KeyD:68,KeyW:87,KeyS:83}[code] }, bubbles: true }))`;
  const botSrc = `(async () => {
    const s = window.__fwo.scene.getScene('fishing');
    const kd = (c) => eval(c);
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const log = [];
    let t0 = performance.now();
    while (performance.now() - t0 < 120000) {
      const st = s.auth.bite ? s.auth.bite.state : 'none';
      if (log[log.length-1] !== st) log.push(st);
      if (st === 'NIBBLE') window.__nib = true;
      if (st === 'HOOK_WINDOW') break;
      await sleep(30);
    }
    window.__phase = 'window';
    await sleep(250);
    ${key('keydown','Space')}; ${key('keyup','Space')};
    await sleep(200);
    window.__phase = 'fight:' + s.mode;
    t0 = performance.now();
    let held = {};
    const down = (c) => { if (!held[c]) { held[c] = 1; eval(\`window.dispatchEvent(new KeyboardEvent('keydown', { code: '\${c}', keyCode: \${({KeyA:65,KeyD:68,KeyW:87,KeyS:83,Space:32})[c]}, bubbles: true }))\`); } };
    const up = (c) => { if (held[c]) { held[c] = 0; eval(\`window.dispatchEvent(new KeyboardEvent('keyup', { code: '\${c}', keyCode: \${({KeyA:65,KeyD:68,KeyW:87,KeyS:83,Space:32})[c]}, bubbles: true }))\`); } };
    while (s.mode === 'fight' && performance.now() - t0 < 150000) {
      const f = s.fightState;
      if (f.fishDirection > 0) { up('KeyD'); down('KeyA'); } else { up('KeyA'); down('KeyD'); }
      if (f.tension < 65) { up('KeyS'); down('KeyW'); } else up('KeyW');
      if (f.tension > 85) down('KeyS'); else if (f.tension < 70) up('KeyS');
      if (f.phase === 'landing') { up('Space'); held.Space = 0; down('Space'); up('Space'); }
      await sleep(30);
    }
    ['KeyA','KeyD','KeyW','KeyS'].forEach(up);
    window.__phase = 'done:' + s.mode;
    return log.join('>');
  })()`;
  const pBot = page.evaluate(botSrc);
  let shots = 0;
  for (let i = 0; i < 300; i++) {
    const ph = await page.evaluate(() => window.__phase || '');
    if (ph.startsWith('fight') && shots < 2) { await page.waitForTimeout(shots ? 4000 : 1200); await page.screenshot({ path: out + `/08_fight_${++shots}.png` }); }
    if (!ph && (await page.evaluate(() => window.__nib)) && !global.n) { global.n = 1; await page.screenshot({ path: out + '/06_nibble.png' }); }
    if (ph === 'window' && !global.w) { global.w = 1; await page.screenshot({ path: out + '/07_window.png' }); }
    if (ph.startsWith('done')) break;
    await page.waitForTimeout(500);
  }
  console.log('bite log', await pBot, 'phase', await page.evaluate(() => window.__phase), 'fps', await page.evaluate(() => window.__fwo.loop.actualFps));
  for (const key of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) await page.keyboard.up(key);
  await page.waitForFunction(() => window.__fwo.scene.getScene('fishing').mode !== 'landing', null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + '/09_result.png' });
  console.log('final mode', await page.evaluate(() => window.__fwo.scene.getScene('fishing').mode));
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/10_after.png' });
  console.log('stats', JSON.stringify(await page.evaluate(() => window.__fwo.scene.getScene('fishing').auth.profile.stats)));
  console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 30).join('\n'));
  await browser.close();
})();

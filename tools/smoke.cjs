// Headless smoke test: menu → fishing → cast → wait for bite → hook → fight → land / escape
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '/home/claude/shots';
  const browser = await chromium.launch({ args: ['--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
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
    const codes = {KeyA:65,KeyD:68,KeyW:87,KeyS:83,KeyQ:81,KeyE:69,KeyF:70,Space:32};
    const ev = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, keyCode: codes[c], bubbles: true }));
    let held = {};
    const down = (c) => { if (!held[c]) { held[c] = 1; ev('keydown', c); } };
    const up = (c) => { if (held[c]) { held[c] = 0; ev('keyup', c); } };
    const tap = (c) => { ev('keydown', c); ev('keyup', c); };
    // Hook Setting: strike in the best direction, held ~220 ms for hard mouths
    await sleep(200);
    const b = s.auth.bite; const dir = b.bestStrike();
    const strong = ['ca_tre','ca_loc','tram_co'].includes(b.species && b.species.id);
    if (dir === 'left') down('KeyA'); if (dir === 'right') down('KeyD');
    ev('keydown', 'Space'); await sleep(strong ? 230 : 60); ev('keyup', 'Space');
    up('KeyA'); up('KeyD');
    await sleep(200);
    window.__phase = 'fight:' + s.mode;
    t0 = performance.now();
    while (s.mode === 'fight' && performance.now() - t0 < 150000) {
      const f = s.fightState;
      const want = -f.balance / 22 - f.fishDir * 0.3;
      if (want > 0.25) { up('KeyA'); down('KeyD'); } else if (want < -0.25) { up('KeyD'); down('KeyA'); } else { up('KeyA'); up('KeyD'); }
      const mid = (f.idealAngle[0] + f.idealAngle[1]) / 2;
      if (mid - f.rodAngle > 0.05) { up('KeyS'); down('KeyW'); } else if (f.rodAngle - mid > 0.05) { up('KeyW'); down('KeyS'); } else { up('KeyW'); up('KeyS'); }
      const danger = f.behavior === 'BURST' || f.next === 'BURST' || f.lineTension > 82;
      const td = danger ? 0.3 : f.behavior === 'SULKING' ? 0.75 : 0.6;
      if (td - f.drag > 0.05) { up('KeyQ'); down('KeyE'); } else if (f.drag - td > 0.05) { up('KeyE'); down('KeyQ'); } else { up('KeyQ'); up('KeyE'); }
      const reelOk = !danger && f.lineTension < 62 && f.behavior !== 'SHAKING' && f.behavior !== 'JUMPING';
      s.reelGear = f.behavior === 'RESTING' || f.behavior === 'EXHAUSTED' ? 3 : 2;
      s.input2.left = reelOk && !s.netOut;
      if (f.dist < 4.2 && f.fishStamina < 40 && !s.netOut) { tap('KeyF'); window.__net = 1; }
      if (s.netOut) {
        const p = s.auth.persp; const w = p.toWorld(f.dist, f.landing.fishX);
        s.aim.sx = s.aim.sx + Math.max(-25, Math.min(25, (w.x - s.cameras.main.scrollX) - s.aim.sx));
        if (f.phase === 'landing' && f.landing.window !== 'lunge' && f.landing.ready > 0.6 && Math.random() < 0.15) tap('Space');
      }
      await sleep(30);
    }
    s.input2.left = false;
    ['KeyA','KeyD','KeyW','KeyS','KeyQ','KeyE'].forEach(up);
    window.__phase = 'done:' + s.mode;
    return log.join('>');
  })()`;
  const pBot = page.evaluate(botSrc);
  let shots = 0;
  for (let i = 0; i < 300; i++) {
    const ph = await page.evaluate(() => window.__phase || '');
    if (ph.startsWith('fight') && shots < 2) { await page.waitForTimeout(shots ? 4000 : 1200); await page.screenshot({ path: out + `/08_fight_${++shots}.png` }); }
    if (ph.startsWith('fight') && (await page.evaluate(() => window.__net)) && !global.nt) { global.nt = 1; await page.waitForTimeout(700); await page.screenshot({ path: out + '/08_net.png' }); }
    if (!ph && (await page.evaluate(() => window.__nib)) && !global.n) { global.n = 1; await page.screenshot({ path: out + '/06_nibble.png' }); }
    if (ph === 'window' && !global.w) { global.w = 1; await page.screenshot({ path: out + '/07_window.png' }); }
    if (ph.startsWith('done')) break;
    await page.waitForTimeout(500);
  }
  console.log('bite log', await pBot, 'phase', await page.evaluate(() => window.__phase), 'fps', await page.evaluate(() => window.__fwo.loop.actualFps));
  for (const key of ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'KeyE']) await page.keyboard.up(key);
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

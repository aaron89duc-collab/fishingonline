const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--disable-gpu', '--disable-webgl', '--disable-3d-apis'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:4173/');
  await p.waitForFunction(() => window.__fwo && window.__fwo.scene.isActive('menu'), null, { timeout: 60000 });
  await p.waitForTimeout(2500);
  console.log('webgl available:', await p.evaluate(() => !!document.createElement('canvas').getContext('webgl')));
  console.log('menu fps', await p.evaluate(() => window.__fwo.loop.actualFps), 'renderer', await p.evaluate(() => window.__fwo.renderer.type));
  await p.screenshot({ path: '/home/claude/shots/canvas_menu.png' });
  await p.keyboard.press('Enter'); await p.waitForTimeout(4000);
  console.log('fishing fps', await p.evaluate(() => window.__fwo.loop.actualFps), errs);
  await p.screenshot({ path: '/home/claude/shots/canvas_idle.png' });
  await b.close();
})();

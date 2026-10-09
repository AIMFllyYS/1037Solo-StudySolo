const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const times = process.argv[2].split(',').map(Number);
  const out = process.argv[3] || 'prev';
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('console', m => { if (['error','warning'].includes(m.type())) console.log('console:', m.text().slice(0, 300)); });
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  await p.evaluate(() => window.ready);
  for (const t of times) {
    const t0 = Date.now();
    await p.evaluate(async (t) => { await window.renderAt(t, Math.round(t * 60)); }, t);
    await p.screenshot({ path: `${out}/t${t.toFixed(2)}.png` });
    console.log('t', t, Date.now() - t0, 'ms');
  }
  await b.close();
})();

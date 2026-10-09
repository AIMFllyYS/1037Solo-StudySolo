const { chromium } = require('playwright');
const fs = require('fs');
const [a, b, out] = [+process.argv[2], +process.argv[3], process.argv[4] || 'frames'];
const only = process.argv[5] ? new Set(process.argv[5].split(',').map(Number)) : null;
fs.mkdirSync(out, { recursive: true });
(async () => {
  const br = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-vsync'] });
  const p = await br.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => window.ready);
  if (a === 0 && !only) fs.writeFileSync('events.json', JSON.stringify(await p.evaluate(() => window.getEvents()), null, 0));
  const cdp = await p.context().newCDPSession(p);
  const t0 = Date.now();
  for (let f = a; f < b; f++) {
    if (only && !only.has(f)) continue;
    const file = `${out}/${String(f).padStart(5, '0')}.jpg`;
    if (!only && fs.existsSync(file)) continue;
    await p.evaluate(async (f) => { await window.renderAt(f / 60, f); }, f);
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    if (f % 60 === 0) console.log(`frame ${f} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await br.close();
  console.log('done', a, b);
})();

const { chromium } = require('playwright');
const fs = require('fs');
const script = require('./chatscript.js');
const HIDE = `nextjs-portal{display:none!important} *{caret-color:transparent}`;
const mode = process.argv[2]; // 'agent' | 'studio'
const out = `seq/${mode}`; fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(require('./lightinit.js')(process.env.THEME || 'light', process.env.MODE || 'default'));
  await ctx.addInitScript(require('./inject.js'));
  const p = await ctx.newPage();
  const man = []; let f = 0;
  const fixT = () => p.evaluate(() => { const els=[...document.querySelectorAll('span,div,p,button')].filter(e=>/^\s*已处理\s*[\d分 ]+秒\s*$/.test(e.textContent)); els.forEach(e=>{ if(![...e.children].some(c=>/已处理/.test(c.textContent))) e.textContent='已处理 6 秒'; }); });
  const snap = async (label) => { if (label==='done'||label==='finish') await fixT(); const name = `${out}/${String(f).padStart(4,'0')}.jpg`; await p.screenshot({ path: name, type:'jpeg', quality: 92 }); man.push({ f, label }); f++; };
  if (mode === 'agent') {
    await p.goto('http://localhost:35349/agent', { waitUntil:'networkidle', timeout:240000 }); await p.addStyleTag({content:HIDE}); await p.waitForTimeout(2500);
    await snap('idle');
    await p.locator('textarea, [contenteditable=true]').last().click(); await p.waitForTimeout(300); await snap('focus');
    for (const ch of '为什么糖尿病人的呼吸，会有烂苹果味？') { await p.keyboard.type(ch); await p.waitForTimeout(40); await snap('type'); }
    await p.keyboard.press('Enter');
  } else {
    await p.goto('http://localhost:35349/biochemistry/textbook/ch08-3', { waitUntil:'networkidle', timeout:240000 }); await p.addStyleTag({content:HIDE}); await p.waitForTimeout(2500);
    const target = '产生特殊的“烂苹果气味”';
    await p.evaluate((target) => { const w = document.createTreeWalker(document.querySelector('main')||document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.textContent.includes(target)) break; } const el = n.parentElement; let sc = el; while (sc && !(sc.scrollHeight > sc.clientHeight + 10 && getComputedStyle(sc).overflowY.match(/auto|scroll/))) sc = sc.parentElement; const r = el.getBoundingClientRect(); const sr = sc.getBoundingClientRect(); sc.scrollTop += r.top - sr.top - sr.height*0.4; }, target);
    await p.waitForTimeout(1000); await snap('read');
    const rect = await p.evaluate((target) => { const w = document.createTreeWalker(document.querySelector('main')||document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const i = n.textContent.indexOf(target); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + target.length); const rs=[...r.getClientRects()]; const a=rs[0], z=rs[rs.length-1]; return {x:a.left, y:a.top+a.height/2, x2:z.right, y2:z.top+z.height/2}; } } }, target);
    await p.mouse.move(rect.x+1, rect.y); await p.mouse.down();
    for (let k=1;k<=12;k++){ await p.mouse.move(rect.x + (rect.x2-rect.x)*k/12, rect.y); await p.waitForTimeout(20); await snap('select'); }
    await p.mouse.up(); await p.waitForTimeout(700); await snap('popover'); await snap('popover');
    await p.getByRole('button', { name: '解释' }).first().click();
  }
  await p.waitForFunction(() => window.__chatOpen, null, { timeout: 20000 });
  for (let k=0;k<6;k++){ await p.waitForTimeout(80); await snap('pending'); }
  for (let i=0;i<script.length;i++) {
    const c = script[i];
    await p.evaluate((s) => window.__push(s), [c]);
    if (c === 'DONE' ) { await p.evaluate(() => window.__end()); break; }
    const t = typeof c === 'object' ? c.type : c;
    if (/delta|tool-output|tool-input-available|finish$/.test(t)) { await p.waitForTimeout(t.includes('tool') ? 250 : 50); await snap(t); }
  }
  for (let k=0;k<20;k++){ await p.waitForTimeout(150); await snap('done'); }
  fs.writeFileSync(`${out}/manifest.json`, JSON.stringify(man));
  console.log('frames', f);
  await b.close();
})();

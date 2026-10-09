const { chromium } = require('playwright');
const HIDE = `nextjs-portal{display:none!important}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(require('./lightinit.js')(process.env.THEME || 'light', process.env.MODE || 'default'));
  await ctx.addInitScript(require('./inject.js'));
  const p = await ctx.newPage();
  await p.goto('http://localhost:35349/biochemistry/textbook/ch08-3', { waitUntil:'networkidle', timeout:240000 }); await p.addStyleTag({content:HIDE}); await p.waitForTimeout(2500);
  const target = '产生特殊的“烂苹果气味”';
  await p.evaluate((target) => {
    const w = document.createTreeWalker(document.querySelector('main')||document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { if (n.textContent.includes(target)) break; }
    const el = n.parentElement; let sc = el; while (sc && !(sc.scrollHeight > sc.clientHeight + 10 && getComputedStyle(sc).overflowY.match(/auto|scroll/))) sc = sc.parentElement;
    const r = el.getBoundingClientRect(); const sr = sc.getBoundingClientRect(); sc.scrollTop += r.top - sr.top - sr.height*0.4;
  }, target);
  await p.waitForTimeout(1000);
  const rect = await p.evaluate((target) => {
    const w = document.createTreeWalker(document.querySelector('main')||document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { const i = n.textContent.indexOf(target); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + target.length); const rs=[...r.getClientRects()]; const a=rs[0], z=rs[rs.length-1]; return {x:a.left, y:a.top+a.height/2, x2:z.right, y2:z.top+z.height/2}; } }
  }, target);
  console.log(rect);
  await p.screenshot({ path:'shots/sel-00.png' });
  await p.mouse.move(rect.x+1, rect.y); await p.mouse.down();
  for (let k=1;k<=10;k++){ await p.mouse.move(rect.x + (rect.x2-rect.x)*k/10, rect.y + (rect.y2-rect.y)*k/10); await p.waitForTimeout(30); await p.screenshot({ path:`shots/sel-${String(k).padStart(2,'0')}.png` }); }
  await p.mouse.up(); await p.waitForTimeout(900);
  await p.screenshot({ path:'shots/sel-pop.png' });
  const html = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b=>b.offsetParent && b.getBoundingClientRect().top>0).map(b=>(b.getAttribute('aria-label')||b.textContent).trim()).filter(Boolean).slice(-40));
  console.log(html.join(' | '));
  await b.close();
})();

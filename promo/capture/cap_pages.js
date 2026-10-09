const { chromium } = require('playwright');
const HIDE = `nextjs-portal{display:none!important}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(require('./lightinit.js')(process.env.THEME || 'light', process.env.MODE || 'default'));
  await ctx.addInitScript(require('./inject.js'));
  const p = await ctx.newPage();
  const go = async (u, w=2500) => { await p.goto('http://localhost:35349'+u, { waitUntil:'networkidle', timeout:240000 }); await p.addStyleTag({content:HIDE}); await p.waitForTimeout(w); };
  // scroll the note so that the text is near a vertical position
  const scrollTo = async (text, frac=0.35) => {
    await p.evaluate(([text, frac]) => {
      const w = document.createTreeWalker(document.querySelector('main')||document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { if (n.textContent.includes(text)) break; }
      if (!n) return 'nf';
      const el = n.parentElement; let sc = el; while (sc && !(sc.scrollHeight > sc.clientHeight + 10 && getComputedStyle(sc).overflowY.match(/auto|scroll/))) sc = sc.parentElement;
      const r = el.getBoundingClientRect(); const sr = sc.getBoundingClientRect();
      sc.scrollTop += r.top - sr.top - sr.height*frac;
    }, [text, frac]);
    await p.waitForTimeout(900);
  };
  const shotsFor = [
    ['/biochemistry/textbook/ch08-3', '烂苹果气味', 'src-bio-ketone', 0.3],
    ['/histology/textbook/ch15-4', '插入框：胰岛素与糖尿病', 'src-histo-islet', 0.15],
    ['/biochemistry/textbook/ch07-6', '饥饿时糖异生的主要原料', 'src-bio-gng', 0.3],
    ['/anatomy/textbook/ch02-2', '先问这是不是管壁外的大消化腺', 'src-anat-pancreas', 0.2],
    ['/biochemistry/textbook/ch08-3', '糖不足时乙酰 CoA 为什么堆成酮体', 'src-bio-cause', 0.25],
  ];
  for (const [u, t, name, f] of shotsFor) { await go(u); await scrollTo(t, f); await p.screenshot({ path:`shots/${name}.png` }); console.log(name); }
  // selection popover on ketone definition
  await go('/biochemistry/textbook/ch08-3'); await scrollTo('烂苹果气味', 0.45);
  const rect = await p.evaluate(() => {
    const target = '严重糖尿病可高出正常人数十倍';
    const w = document.createTreeWalker(document.querySelector('main')||document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { const i = n.textContent.indexOf(target); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + target.length); const b = r.getBoundingClientRect(); return {x:b.left, y:b.top+b.height/2, x2:b.right}; } }
    return null;
  });
  console.log('rect', rect);
  if (rect) {
    await p.mouse.move(rect.x+1, rect.y); await p.mouse.down();
    for (let k=1;k<=12;k++){ await p.mouse.move(rect.x + (rect.x2-rect.x)*k/12, rect.y); await p.waitForTimeout(40); await p.screenshot({ path:`shots/sel-${String(k).padStart(2,'0')}.png` }); }
    await p.mouse.up(); await p.waitForTimeout(900);
    await p.screenshot({ path:'shots/sel-pop.png' });
  }
  await b.close();
})();

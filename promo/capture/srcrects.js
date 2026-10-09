const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(require('./lightinit.js')(process.env.THEME || 'light', process.env.MODE || 'default'));
  const p = await ctx.newPage();
  const scrollTo = async (text, frac) => { await p.evaluate(([text, frac]) => {
      const w = document.createTreeWalker(document.querySelector('main')||document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { if (n.textContent.includes(text)) break; }
      const el = n.parentElement; let sc = el; while (sc && !(sc.scrollHeight > sc.clientHeight + 10 && getComputedStyle(sc).overflowY.match(/auto|scroll/))) sc = sc.parentElement;
      const r = el.getBoundingClientRect(); const sr = sc.getBoundingClientRect(); sc.scrollTop += r.top - sr.top - sr.height*frac; }, [text, frac]); await p.waitForTimeout(900); };
  const find = (targets) => p.evaluate((targets) => { const out = {}; for (const target of targets) {
      const w = document.createTreeWalker(document.querySelector('main')||document.body, NodeFilter.SHOW_TEXT); let n; const hits=[];
      while ((n = w.nextNode())) { const i = n.textContent.indexOf(target); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + target.length); const rs=[...r.getClientRects()].map(q=>[q.x,q.y,q.width,q.height].map(Math.round)); hits.push(rs); } }
      out[target] = hits; } return out; }, targets);
  const jobs = [
    ['src-bio-ketone', '/biochemistry/textbook/ch08-3', '烂苹果气味', 0.3, ['严重糖尿病可高出正常人数十倍', '丙酮经呼吸道，有“烂苹果气味”', '产生特殊的“烂苹果气味”', '酮症酸中毒']],
    ['src-histo-islet', '/histology/textbook/ch15-4', '插入框：胰岛素与糖尿病', 0.15, ['胰岛 B 细胞被破坏而导致胰岛素绝对缺乏', '胰岛素绝对缺乏', '插入框：胰岛素与糖尿病']],
    ['src-bio-gng', '/biochemistry/textbook/ch07-6', '饥饿时糖异生的主要原料', 0.3, ['脂肪组织中脂肪分解增强', '饥饿时糖异生的主要原料是生糖氨基酸和甘油', '依赖酮体供能']],
    ['src-anat-pancreas', '/anatomy/textbook/ch02-2', '先问这是不是管壁外的大消化腺', 0.2, ['胰怎样横在腹后壁', '肝和胰', '大消化腺']],
    ['src-bio-cause', '/biochemistry/textbook/ch08-3', '糖不足时乙酰 CoA 为什么堆成酮体', 0.25, ['草酰乙酸减少', '大量堆积', '脂肪动员加强', '糖不足时乙酰 CoA 为什么堆成酮体', '竞争性抑制']],
  ];
  const all = {};
  for (const [name, u, t, f, targets] of jobs) {
    await p.goto('http://localhost:35349' + u, { waitUntil: 'networkidle', timeout: 240000 }); await p.waitForTimeout(2500);
    await scrollTo(t, f); all[name] = await find(targets); console.log(name, JSON.stringify(all[name]));
  }
  fs.writeFileSync('srcrects.json', JSON.stringify(all, null, 1));
  await b.close();
})();

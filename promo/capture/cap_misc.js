const { chromium } = require('playwright');
const HIDE = `nextjs-portal{display:none!important}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(require('./lightinit.js')(process.env.THEME || 'light', process.env.MODE || 'default'));
  await ctx.addInitScript(require('./inject.js'));
  const p = await ctx.newPage();
  const go = async (u, w=2500) => { await p.goto('http://localhost:35349'+u, { waitUntil:'networkidle', timeout:240000 }); await p.addStyleTag({content:HIDE}); await p.waitForTimeout(w); };
  // 1. Global search
  await go('/biochemistry/textbook/ch08-3');
  await p.screenshot({ path:'shots/ketone-page-top.png' });
  await p.keyboard.press('Control+Shift+F'); await p.waitForTimeout(800);
  await p.screenshot({ path:'shots/gs-open.png' });
  const q='酮体';
  await p.keyboard.type(q, {delay:120});
  for (let k=0;k<6;k++){ await p.waitForTimeout(600); await p.screenshot({ path:`shots/gs-${k}.png` }); }
  await p.keyboard.press('Escape');
  await b.close();
})();

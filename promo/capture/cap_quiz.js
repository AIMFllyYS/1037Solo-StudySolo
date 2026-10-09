const { chromium } = require('playwright');
const HIDE = `nextjs-portal{display:none!important}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(require('./lightinit.js')(process.env.THEME || 'light', process.env.MODE || 'default'));
  const p = await ctx.newPage();
  await p.goto('http://localhost:35349/biochemistry/textbook/ch08-3', { waitUntil:'networkidle', timeout:240000 }); await p.addStyleTag({content:HIDE}); await p.waitForTimeout(2500);
  await p.getByText('题目测试', { exact: true }).first().click(); await p.waitForTimeout(3000);
  await p.screenshot({ path:'shots/quiz-a.png' });
  const opts = await p.locator('main button').allTextContents(); console.log(opts.map(s=>s.trim()).filter(Boolean).slice(0,30).join(' | '));
  await p.getByText('例题', { exact: true }).first().click(); await p.waitForTimeout(3000);
  await p.screenshot({ path:'shots/examples-a.png' });
  await b.close();
})();

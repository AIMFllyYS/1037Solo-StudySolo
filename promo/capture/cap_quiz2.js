const { chromium } = require('playwright');
const HIDE = `nextjs-portal{display:none!important}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(require('./lightinit.js')(process.env.THEME || 'light', process.env.MODE || 'default'));
  const p = await ctx.newPage();
  await p.goto('http://localhost:35349/biochemistry/textbook/ch08-3', { waitUntil:'networkidle', timeout:240000 }); await p.addStyleTag({content:HIDE}); await p.waitForTimeout(2500);
  await p.getByText('题目测试', { exact: true }).first().click(); await p.waitForTimeout(3000);
  await p.getByText('脂质是脂肪和类脂的总称', { exact: false }).first().click(); await p.waitForTimeout(1200);
  await p.screenshot({ path:'shots/quiz-b.png' });
  await b.close();
})();

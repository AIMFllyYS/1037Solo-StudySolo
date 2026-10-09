const { chromium } = require('playwright');
const fs=require('fs');
const HIDE = `nextjs-portal{display:none!important}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(require('./lightinit.js')(process.env.THEME || 'light', process.env.MODE || 'default'));
  const p = await ctx.newPage();
  await p.goto('http://localhost:35349/probability/detail/4.2', { waitUntil:'networkidle', timeout:240000 }); await p.addStyleTag({content:HIDE}); await p.waitForTimeout(3000);
  await p.getByText('可交互', { exact: true }).first().click(); await p.waitForTimeout(4000);
  await p.screenshot({ path:'shots/inter-0.png' });
  const n = await p.locator('input[type=range]').count(); console.log('ranges', n);
  fs.mkdirSync('seq/inter',{recursive:true});
  const rs = p.locator('input[type=range]');
  const set = async (i, frac) => rs.nth(i).evaluate((el,frac)=>{ const v = +el.min + (+el.max - +el.min)*frac; const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,String(v)); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }, frac);
  for (let k=0;k<=40;k++){ const t=k/40; if(n>=2){ await set(n>=4?1:0, 0.5+0.4*Math.sin(t*Math.PI*2)); await set(n-1, 0.35+0.3*Math.sin(t*Math.PI*2+1.3)); } await p.waitForTimeout(50); await p.screenshot({ path:`seq/inter/${String(k).padStart(4,'0')}.jpg`, type:'jpeg', quality:92 }); }
  await b.close();
})();

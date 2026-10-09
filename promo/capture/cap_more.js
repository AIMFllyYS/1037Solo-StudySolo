const { chromium } = require('playwright');
const fs=require('fs');
const HIDE = `nextjs-portal{display:none!important}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(require('./lightinit.js')(process.env.THEME || 'light', process.env.MODE || 'default'));
  await ctx.addInitScript(require('./inject.js'));
  const p = await ctx.newPage();
  const go = async (u, w=2500) => { await p.goto('http://localhost:35349'+u, { waitUntil:'networkidle', timeout:240000 }); await p.addStyleTag({content:HIDE}); await p.waitForTimeout(w); };
  // interactive
  await go('/probability/detail/4.1', 4000);
  const iv = p.locator('[data-interactive-id], .interactive-block, [class*=interactive]').first();
  const cnt = await p.locator('input[type=range]').count(); console.log('ranges', cnt);
  if (cnt) {
    const r = p.locator('input[type=range]').first(); await r.scrollIntoViewIfNeeded(); await p.evaluate(()=>{ const r=document.querySelector('input[type=range]'); r.scrollIntoView({block:'center'}); }); await p.waitForTimeout(800);
    fs.mkdirSync('seq/inter',{recursive:true});
    const bb = await r.boundingBox(); console.log(bb);
    const min = await r.getAttribute('min'), max = await r.getAttribute('max');
    for (let k=0;k<=30;k++){ const v = +min + (+max - +min) * (0.5+0.45*Math.sin(k/30*Math.PI*2)); await r.evaluate((el,v)=>{ const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,String(v)); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }, v); await p.waitForTimeout(60); await p.screenshot({ path:`seq/inter/${String(k).padStart(4,'0')}.jpg`, type:'jpeg', quality:92 }); }
  }
  // quiz tab
  await go('/histology/kaoqian-moni/sim-01', 3000);
  await p.screenshot({ path:'shots/quiz-0.png' });
  const tabs = await p.locator('button, [role=tab]').allTextContents(); console.log(tabs.filter(t=>t.trim()).slice(0,40).join('|'));
  // home year 1
  await go('/', 2000);
  const y1 = p.getByText('大一', { exact: true }).first(); await y1.click(); await p.waitForTimeout(1200); await p.screenshot({ path:'shots/home-y1.png' });
  const y2 = p.getByText('大二', { exact: true }).first(); await y2.click(); await p.waitForTimeout(1200);
  await p.hover('[data-subject-id=biochemistry]').catch(()=>{}); await p.evaluate(()=>{ const s=document.querySelector('.scroll-y'); if(s) s.scrollTop=300; }); await p.hover('[data-subject-id=biochemistry]').catch(e=>console.log(e.message)); await p.waitForTimeout(600); await p.screenshot({ path:'shots/home-hover.png' });
  await go('/agent/plugins', 2500); await p.screenshot({ path:'shots/plugins.png' });
  await go('/agent/scheduled', 2500); await p.screenshot({ path:'shots/scheduled.png' });
  await go('/biochemistry/review', 2500); await p.screenshot({ path:'shots/review.png' });
  await b.close();
})();

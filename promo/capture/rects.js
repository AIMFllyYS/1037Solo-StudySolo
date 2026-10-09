const { chromium } = require('playwright');
const fs = require('fs');
const script = require('./chatscript.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(require('./lightinit.js')(process.env.THEME || 'light', process.env.MODE || 'default'));
  await ctx.addInitScript(require('./inject.js'));
  const p = await ctx.newPage();
  await p.goto('http://localhost:35349/agent', { waitUntil:'networkidle', timeout:240000 }); await p.addStyleTag({content:'nextjs-portal{display:none!important}'}); await p.waitForTimeout(2000);
  await p.locator('textarea, [contenteditable=true]').last().click();
  await p.keyboard.type('为什么糖尿病人的呼吸，会有烂苹果味？'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__chatOpen);
  const upto = script.findIndex(c => c.type==='text-start');
  await p.evaluate((s)=>window.__push(s), script.slice(0, upto)); await p.waitForTimeout(1500);
  const r1 = await p.evaluate(() => { const out={}; const q=(sel)=>[...document.querySelectorAll(sel)].map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height), (e.textContent||'').trim().slice(0,30)]}).filter(a=>a[2]>0);
    const byText=(t)=>{const el=[...document.querySelectorAll('*')].filter(e=>e.children.length<4 && (e.textContent||'').includes(t)).sort((a,b)=>a.textContent.length-b.textContent.length)[0]; if(!el) return null; const r=el.getBoundingClientRect(); return [r.x,r.y,r.width,r.height].map(Math.round);};
    out.search=byText('检索笔记'); out.think=byText('学生问的是'); out.srcHead=byText('来源 · 4'); return out; });
  await p.evaluate((s)=>window.__push(s), script.slice(upto)); await p.evaluate(()=>window.__end()); await p.waitForTimeout(2500);
  const r2 = await p.evaluate(() => { const out={};
    const byText=(t)=>{const el=[...document.querySelectorAll('*')].filter(e=>(e.textContent||'').includes(t)).sort((a,b)=>a.textContent.length-b.textContent.length)[0]; if(!el) return null; const r=el.getBoundingClientRect(); return [r.x,r.y,r.width,r.height].map(Math.round);};
    for (const [k,t] of Object.entries({user:'为什么糖尿病人的呼吸', oneline:'一句话', chainHead:'因果链', c1:'组胚 · 胰岛', c2:'生化 · 脂肪动员', c3:'β-氧化', c4:'酮体生成', breath:'呼吸道', quote:'血酮体正常仅', follow:'你可能还想问', src1:'组织学与胚胎学 · 第十五章', src2:'生物化学 · 第八章', src3:'生物化学 · 第七章', src4:'系统解剖学 · 第二章', srcHead:'来源 · 4'})) out[k]=byText(t);
    const k=document.querySelector('.katex-display'); if(k){const r=k.getBoundingClientRect(); out.formula=[r.x,r.y,r.width,r.height].map(Math.round);}
    // source cards: climb up to card container
    for (const s of ['src1','src2','src3','src4']) {}
    const cards=[...document.querySelectorAll('li, a, [class*=source]')].filter(e=>/textbook\/ch/.test(e.textContent)&&e.textContent.length<140).map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round).concat([e.textContent.slice(0,12)])});
    out.cards=cards; return out; });
  fs.writeFileSync('rects.json', JSON.stringify({mid:r1, done:r2}, null, 1));
  console.log(JSON.stringify({mid:r1, done:r2}));
  await b.close();
})();

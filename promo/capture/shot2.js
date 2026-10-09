const { chromium } = require('playwright');
const HIDE = `nextjs-portal, [data-nextjs-toast], #__next-build-watcher {display:none!important}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(require('./lightinit.js')(process.env.THEME || 'light', process.env.MODE || 'default'));
  const p = await ctx.newPage();
  const list = JSON.parse(process.argv[2]);
  for (const [name, u, wait] of list) {
    await p.goto('http://localhost:35349' + u, { waitUntil: 'networkidle', timeout: 240000 }).catch(e => console.log('err', e.message));
    await p.addStyleTag({ content: HIDE });
    await p.waitForTimeout(wait || 3000);
    await p.screenshot({ path: `shots/${name}.png` });
    console.log(name, u, await p.title());
  }
  await b.close();
})();

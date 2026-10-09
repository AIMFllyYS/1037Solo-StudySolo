// New montage material: flashcards, model lineup, agent tools, theme switching (light UI).
const { chromium } = require('playwright');
const fs = require('fs');
const lightinit = require('./lightinit.js');
const HIDE = `nextjs-portal{display:none!important} *{caret-color:transparent}`;
const SRC = '生物化学与分子生物学 / 教材 / ch08-3 甘油三酯代谢';
const CARDS = [
  ['quiz', '胰岛素不足时，为什么乙酰 CoA 会在肝里堆成**酮体**？', '脂肪动员↑ → β-氧化产生大量乙酰 CoA；糖代谢障碍使**草酰乙酸↓**，乙酰 CoA 进不了三羧酸循环，只能在肝线粒体缩合成酮体。'],
  ['cloze', '酮体包括乙酰乙酸（____）、β-羟丁酸（____）和____（微量）。', '乙酰乙酸 **30%**、β-羟丁酸 **70%**、**丙酮**（微量）。'],
  ['excerpt', '丙酮经呼吸道排出，有“**烂苹果气味**”。', '记忆提示：酮症酸中毒的呼气特征 —— 丙酮易挥发，经肺呼出。'],
  ['quiz', '肝能生成酮体，为什么自己却**不能利用**？', '肝有活性很强的酮体合成酶系，但缺乏琥珀酰 CoA 转硫酶等**酮体利用酶**，酮体须经血液运到肝外氧化。'],
  ['cloze', '本版 1 分子软脂酸彻底氧化净生成 ____ 分子 ATP。', '**106** 分子 ATP（不要默写口诀 129 或 38）。'],
  ['quiz', '丙二酸单酰 CoA 竞争性抑制的是哪个酶？', '**CPT-Ⅰ**（肉碱脂肪酰转移酶Ⅰ）—— 同时关掉 β-氧化和酮体生成。'],
];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(lightinit('light', 'default'));
  const p = await ctx.newPage();
  const go = async (u, w = 2500) => { await p.goto('http://localhost:35349' + u, { waitUntil: 'networkidle', timeout: 300000 }); await p.addStyleTag({ content: HIDE }); await p.waitForTimeout(w); };
  const shot = (name) => p.screenshot({ path: name, type: 'jpeg', quality: 92 });
  fs.mkdirSync('seq/cards', { recursive: true }); fs.mkdirSync('seq/models', { recursive: true });
  fs.mkdirSync('seq/tools', { recursive: true }); fs.mkdirSync('seq/themes', { recursive: true });

  // ---------- 1. flashcards: seed IndexedDB, then flip through ----------
  await go('/', 1500);
  const now = Date.now();
  const byId = {}, order = [];
  CARDS.forEach(([cardType, front, back], i) => {
    const id = 'demo' + i;
    byId[id] = { id, subjectId: 'biochemistry', categoryId: 'textbook', itemId: 'ch08-3', sourceLabel: SRC, originalText: front.replace(/\*\*/g, ''), mode: cardType === 'quiz' ? 'quiz' : cardType, cardType, front, back, status: 'ready', model: 'deepseek/deepseek-v4-flash', createdAt: now - (CARDS.length - i) * 60000 };
    order.push(id);
  });
  await p.evaluate(async (value) => {
    await new Promise((res, rej) => {
      const r = indexedDB.open('gailvlun-db');
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('keyval')) r.result.createObjectStore('keyval'); };
      r.onsuccess = () => { const db = r.result; const tx = db.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put(value, 'review-cards'); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = rej; };
      r.onerror = rej;
    });
  }, JSON.stringify({ state: { byId, order }, version: 0 }));
  await go('/biochemistry/review', 3000);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Animation.enable');
  let f = 0;
  const cs = async () => { await shot(`seq/cards/${String(f).padStart(4, '0')}.jpg`); f++; };
  await cs();
  const flipOnce = async () => {
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.12 });
    await p.keyboard.press('Space');
    for (let k = 0; k < 10; k++) { await p.waitForTimeout(90); await cs(); }
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
    await p.waitForTimeout(700); await cs();
  };
  await flipOnce();
  for (let c = 0; c < 2; c++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600); await cs(); await flipOnce(); }
  console.log('cards frames', f);

  // ---------- 2. models: open menu, hover each series ----------
  await go('/agent', 2500);
  await p.getByTestId('model-menu-button').first().click(); await p.waitForTimeout(700);
  await shot('seq/models/0000.jpg');
  const btns = p.locator('[data-menu-level="1"] button');
  const n = await btns.count();
  for (let i = 0; i < n; i++) {
    await btns.nth(i).hover(); await p.waitForTimeout(450);
    const m = p.locator('[data-menu-level="2"] button').first();
    if (await m.count()) { await m.hover(); await p.waitForTimeout(450); }
    await shot(`seq/models/${String(i + 1).padStart(4, '0')}.jpg`);
  }
  const box = await p.getByRole('dialog').first().boundingBox().catch(() => null);
  fs.writeFileSync('seq/models/box.json', JSON.stringify(box));
  await p.keyboard.press('Escape');
  // plus menu
  await p.getByTitle('添加计划、工具或技能').first().click(); await p.waitForTimeout(800);
  await shot('shots/plus-menu.jpg');
  const pbox = await p.locator('[role=menu], [role=dialog], [role=listbox]').first().boundingBox().catch(() => null);
  fs.writeFileSync('seq/tools/plus-box.json', JSON.stringify(pbox));
  await p.keyboard.press('Escape');

  // ---------- 3. tools: settings → Agent 能力, scroll the toggle list ----------
  await go('/biochemistry/textbook/ch08-3', 3000);
  await p.getByText('设置', { exact: true }).first().click(); await p.waitForTimeout(900);
  await p.getByText('Agent 能力', { exact: true }).first().click(); await p.waitForTimeout(900);
  const scrollBox = await p.evaluate(() => {
    const all = [...document.querySelectorAll('[role=dialog] *')].filter((e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY));
    all.sort((a, b) => b.scrollHeight - a.scrollHeight);
    const e = all[0]; if (!e) return null; e.setAttribute('data-promo-scroll', '1');
    const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, sh: e.scrollHeight };
  });
  fs.writeFileSync('seq/tools/box.json', JSON.stringify(scrollBox));
  for (let k = 0; k <= 24; k++) {
    await p.evaluate((k) => { const e = document.querySelector('[data-promo-scroll]'); if (e) e.scrollTop = (e.scrollHeight - e.clientHeight) * Math.min(1, k / 24); }, k);
    await p.waitForTimeout(60);
    await shot(`seq/tools/${String(k).padStart(4, '0')}.jpg`);
  }

  // ---------- 4. themes: click through the appearance picker, then full pages ----------
  await p.getByText('外观', { exact: true }).first().click(); await p.waitForTimeout(900);
  let t = 0;
  for (const [mode, theme] of [['默认', '浅色'], ['彩色', '浅色'], ['Anthropic', '浅色'], ['iOS', '浅色'], ['Codex', '深色'], ['Anthropic', '深色']]) {
    await p.getByText(theme, { exact: true }).first().click(); await p.waitForTimeout(200);
    await p.getByText(mode, { exact: true }).first().click(); await p.waitForTimeout(700);
    await shot(`seq/themes/picker-${t++}.jpg`);
  }
  await b.close();

  // full-page snapshots per appearance (fresh context each, same page)
  const MODES = [['light', 'default'], ['light', 'colorful'], ['light', 'anthropic'], ['light', 'ios'], ['light', 'codex'], ['dark', 'anthropic'], ['dark', 'default'], ['light', 'custom']];
  const b2 = await chromium.launch();
  for (let i = 0; i < MODES.length; i++) {
    const [theme, mode] = MODES[i];
    const c2 = await b2.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
    const custom = mode === 'custom' ? { lightAccent: '#0f8a5f', lightBackground: '#f3fbf6', selection: '#ffb020', font: 'songti' } : null;
    await c2.addInitScript(lightinit(theme, mode, custom));
    const q = await c2.newPage();
    await q.goto('http://localhost:35349/biochemistry/detail/1.1', { waitUntil: 'networkidle', timeout: 300000 });
    await q.addStyleTag({ content: HIDE }); await q.waitForTimeout(2500);
    await q.screenshot({ path: `seq/themes/page-${i}.jpg`, type: 'jpeg', quality: 92 });
    console.log('theme', theme, mode);
    await c2.close();
  }
  await b2.close();
})();

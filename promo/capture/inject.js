// Page-side fetch override: /api/chat returns a stream fed by window.__push
module.exports = `(() => {
  const orig = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (/\\/api\\/chat(\\?|$)/.test(url)) {
      let ctrl; const stream = new ReadableStream({ start(c) { ctrl = c; } });
      const enc = new TextEncoder();
      window.__push = (objs) => { for (const o of objs) ctrl.enqueue(enc.encode(o === 'DONE' ? 'data: [DONE]\\n\\n' : 'data: ' + JSON.stringify(o) + '\\n\\n')); };
      window.__end = () => ctrl.close();
      window.__chatOpen = true;
      return Promise.resolve(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } }));
    }
    if (/\\/api\\/chat-title/.test(url)) return Promise.resolve(new Response(JSON.stringify({ title: '糖尿病为何有烂苹果味' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    return orig.apply(this, arguments);
  };
  const fix = () => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (/已处理\s*\d+/.test(n.textContent)) n.textContent = n.textContent.replace(/已处理\s*[\d分 ]+秒/, '已处理 6 秒'); } };
  document.addEventListener('DOMContentLoaded', () => new MutationObserver(fix).observe(document.body, { subtree: true, childList: true, characterData: true }));
})();`;

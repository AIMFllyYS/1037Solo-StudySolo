/* Paste into a browser DevTools console before a manual performance scenario. No app data is read. */
(() => {
  const old = window.__ssPerfCollector;
  if (old?.dispose) old.dispose();
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const make = value => originalCreate.call(URL,value);
  const revoke = url => originalRevoke.call(URL,url);
  const active = new Set();
  const samples = [];
  const longTasks = [];
  const startedAt = performance.now();
  const observer = typeof PerformanceObserver === 'function' ? new PerformanceObserver(list => {
    for (const entry of list.getEntries()) longTasks.push(entry.duration);
  }) : null;
  try { observer?.observe({entryTypes:['longtask']}); } catch { observer?.disconnect(); }
  URL.createObjectURL = value => { const url = make(value); active.add(url); return url; };
  URL.revokeObjectURL = url => { active.delete(url); return revoke(url); };
  const collector = {
    async sample(rawLabel='sample') {
      const label=String(rawLabel).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64);
      const memory=performance.memory;
      let uaBytes=null;
      if(typeof performance.measureUserAgentSpecificMemory==='function'){
        try { uaBytes=(await performance.measureUserAgentSpecificMemory()).bytes; } catch {}
      }
      const row={label,elapsedMs:Math.round(performance.now()-startedAt),domElements:document.getElementsByTagName('*').length,activeObjectUrls:active.size,jsHeapUsedBytes:memory?.usedJSHeapSize??null,jsHeapLimitBytes:memory?.jsHeapSizeLimit??null,userAgentSpecificBytes:uaBytes};
      samples.push(row);
      return row;
    },
    export() {
      const ordered=longTasks.slice().sort((a,b)=>a-b);
      const percentile=p=>ordered.length?ordered[Math.min(ordered.length-1,Math.floor((ordered.length-1)*p))]:null;
      const report={schemaVersion:1,scenario:'manual-browser',environment:'browser-devtools',samples,longTasks:{count:longTasks.length,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:ordered.at(-1)??null},notes:['JS heap and user-agent memory depend on browser support','Object URL count starts when collector is installed','No user content, token or URL values are exported']};
      const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
      const url=make(blob);const link=document.createElement('a');link.href=url;link.download='studysolo-browser-performance.json';link.click();setTimeout(()=>revoke(url),1000);
      return report;
    },
    dispose() { observer?.disconnect();URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;active.clear();delete window.__ssPerfCollector; },
  };
  window.__ssPerfCollector=collector;
})();

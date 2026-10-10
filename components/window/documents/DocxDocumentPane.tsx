"use client";

import { useEffect, useRef, useState } from "react";
import { translateNow, useT } from "@/lib/i18n/index";
import {getOwnerEpoch,onStorageOwnerChange} from '@/lib/storage/ownerScope';

export default function DocxDocumentPane({ src, name }: { src: string; name: string }) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const generationRef=useRef(0);
  const renderChainRef=useRef<Promise<void>>(Promise.resolve());
  const [error, setError] = useState<string | null>(null);
  const [retryToken,setRetryToken]=useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const generation=++generationRef.current,ownerEpoch=getOwnerEpoch(),controller=new AbortController();
    const renderHost=document.createElement('div');
    const current=()=>!cancelled&&generationRef.current===generation&&getOwnerEpoch()===ownerEpoch;
    const unsubscribe=onStorageOwnerChange(()=>{cancelled=true;controller.abort();renderHost.replaceChildren()});
    host.replaceChildren();
    setError(null);
    void (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if(!current())return;
        const response = await fetch(src,{signal:controller.signal});
        if(!response.ok)throw new Error(`DOCX fetch failed (${response.status})`)
        const blob = await response.blob();
        if (!current()) return;
        const render=renderChainRef.current.catch(()=>{}).then(async()=>{
          if(!current())return;
          await renderAsync(blob,renderHost,undefined,{className:'docx-preview',inWrapper:true,ignoreWidth:false,breakPages:true});
        });
        renderChainRef.current=render.catch(()=>{});
        await render;
        if(!current()){renderHost.replaceChildren();return}
        host.replaceChildren(renderHost);
      } catch (err) {
        if (current()) {
          setError(err instanceof Error ? err.message : translateNow("panel.reader.openFailed", { name }));
        }
      }finally{
        if(!current())renderHost.replaceChildren()
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();unsubscribe();renderHost.replaceChildren();
    };
  }, [name, src,retryToken]);

  return <div className="relative h-full min-h-0 w-full">
    <div ref={hostRef} hidden={!!error} className="docx-preview-host h-full min-h-0 overflow-auto bg-[var(--bg-muted)] p-4" />
    {error ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--bg-panel)] px-6 text-center">
        <p className="text-[13px] font-semibold text-[var(--ink)]">{t("panel.docx.renderFailed")}</p>
        <p className="max-w-sm text-[12px] leading-6 text-[var(--ink-soft)]">{error}</p>
        <div className="flex gap-3 text-xs"><button type="button" className="underline" onClick={()=>setRetryToken(value=>value+1)}>重试</button><a href={src} download={name} className="underline">下载原件</a></div>
      </div>:null}
  </div>;
}

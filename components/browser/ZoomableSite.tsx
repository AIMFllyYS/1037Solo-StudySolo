"use client";

import { useEffect, useRef, useState, type ReactEventHandler } from "react";
import { computeIframeZoomLayout } from "@/lib/browser/iframeZoom";
import { safeHttpUrl } from "@/components/browser/safeUrl";

/** Outer iframe zoom; no cross-origin document access or script injection. */
export default function ZoomableSite({
  url, nonce, zoomPercent, title, logicalWidth,
  allow = "autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write",
  onLoad, onError,
}: {
  url: string;
  nonce: number;
  zoomPercent: number;
  title: string;
  /** Omitted: use the actual container width; explicit: fit a simulated viewport. */
  logicalWidth?: number;
  allow?: string;
  onLoad?: ReactEventHandler<HTMLIFrameElement>;
  onError?: ReactEventHandler<HTMLIFrameElement>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const safeUrl = safeHttpUrl(url);
  const frame = computeIframeZoomLayout({ containerWidth: size.w, containerHeight: size.h, logicalWidth: logicalWidth ?? size.w, zoomFactor: zoomPercent / 100 });
  return (
    <div ref={wrapRef} className="relative h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-white">
      {safeUrl && size.w > 0 && (
        <iframe
          key={`${safeUrl}:${nonce}:${logicalWidth ?? "desktop"}`}
          src={safeUrl}
          title={title}
          style={{ position: "absolute", left: frame.offsetLeft, top: 0, width: frame.iframeWidth, height: frame.iframeHeight, transform: `scale(${frame.renderScale})`, transformOrigin: "top left", border: 0 }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads allow-modals"
          allow={allow}
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={onLoad}
          onError={onError}
        />
      )}
    </div>
  );
}

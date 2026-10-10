"use client";

import { useCallback, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import type { CanvasBlock, RawSvgCanvasBlock } from '@/lib/canvas/types';
import { sanitizeSvg } from '@/lib/utils/sanitizeSvg';
import { analyzeSvgHealth } from '@/lib/svg/svgHealth';
import { useCanvasFullscreen } from '@/lib/hooks/runtime/useCanvasFullscreen';
import { CanvasControls } from '../CanvasControls';
import { CanvasFrame } from '../CanvasFrame';
import { CanvasFullscreenPortal } from '../CanvasFullscreenPortal';

interface RawSvgRendererProps {
  block: RawSvgCanvasBlock;
  revisionBlock?: CanvasBlock;
  revisionTopic?: string;
  onRevisionSubmit?: (instruction: string) => void | Promise<void>;
  onRevisionAccepted?: (block: CanvasBlock) => void;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

function ensureViewBox(markup: string, width: number, height: number): string {
  const open = markup.match(/<svg\b[^>]*>/i);
  if (!open) return markup;
  const tag = open[0];
  if (/\bviewbox\s*=/i.test(tag)) return markup;
  const wn = tag.match(/\bwidth\s*=\s*["']?\s*(\d+(?:\.\d+)?)/i);
  const hn = tag.match(/\bheight\s*=\s*["']?\s*(\d+(?:\.\d+)?)/i);
  const vw = wn ? parseFloat(wn[1]) : width;
  const vh = hn ? parseFloat(hn[1]) : height;
  return markup.replace(tag, tag.replace(/<svg\b/i, `<svg viewBox="0 0 ${vw} ${vh}"`));
}

export function RawSvgRenderer({
  block,
  revisionBlock = block,
  revisionTopic,
  onRevisionSubmit,
  onRevisionAccepted,
}: RawSvgRendererProps) {
  const width = block.width ?? 400;
  const height = block.height ?? 300;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const { fullscreen, toggle, exit } = useCanvasFullscreen();
  const cleaned = useMemo(() => sanitizeSvg(block.source), [block.source]);
  const hasOwnSvgRoot = cleaned.trimStart().startsWith('<svg');
  const innerHtml = useMemo(() => {
    const base = hasOwnSvgRoot
      ? cleaned
      : `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${cleaned}</svg>`;
    return ensureViewBox(base, width, height);
  }, [cleaned, hasOwnSvgRoot, height, width]);
  const health = useMemo(() => analyzeSvgHealth(innerHtml), [innerHtml]);
  const diagnostic = health.ok
    ? null
    : {
        ok: false,
        reason: health.reason,
        message: 'Canvas has no visible SVG content.',
        details: { visibleElementCount: health.visibleElementCount },
      };

  const handlePointerDown = useCallback(
    (event: RPointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest('.svg-canvas-controls, .canvas-revision-panel, .canvas-source-panel')) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
    },
    [pan],
  );

  const handlePointerMove = useCallback((event: RPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.panX + event.clientX - dragRef.current.startX,
      y: dragRef.current.panY + event.clientY - dragRef.current.startY,
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleWheel = useCallback((event: RWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    setZoom((value) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value * factor)));
  }, []);

  const resetView = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const controls = (
    <CanvasControls
      onReset={resetView}
      onZoomIn={() => setZoom((value) => Math.min(ZOOM_MAX, value * 1.2))}
      onZoomOut={() => setZoom((value) => Math.max(ZOOM_MIN, value / 1.2))}
      onMaximize={toggle}
      fullscreen={fullscreen}
    />
  );

  return (
    <CanvasFullscreenPortal open={fullscreen} onExit={exit}>
      <CanvasFrame
        title={block.title}
        source={block.source}
        diagnostic={diagnostic}
        controls={controls}
        className="svg-raw-content"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        revisionBlock={revisionBlock}
        revisionTopic={revisionTopic}
        onRevisionSubmit={onRevisionSubmit}
        onRevisionAccepted={onRevisionAccepted}
      >
        <div
          className="svg-raw-inner"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            width: '100%',
            height: 'auto',
            minHeight: height,
          }}
          dangerouslySetInnerHTML={{ __html: innerHtml }}
        />
      </CanvasFrame>
    </CanvasFullscreenPortal>
  );
}


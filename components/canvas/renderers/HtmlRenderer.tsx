"use client";

import { useCallback } from 'react';
import type { CanvasBlock, HtmlCanvasBlock } from '@/lib/canvas/types';
import { CANVAS_HTML_IFRAME_SANDBOX, injectOpaqueOriginStorageShim } from '@/lib/sandbox/opaqueOriginStorageShim';
import { downloadHtmlFile } from '@/lib/utils/downloadHtml';
import { openHtmlInNewTab } from '@/lib/utils/openHtmlInNewTab';
import { useCanvasFullscreen } from '@/lib/hooks/runtime/useCanvasFullscreen';
import { CanvasControls } from '../CanvasControls';
import { CanvasFrame } from '../CanvasFrame';
import { CanvasFullscreenPortal } from '../CanvasFullscreenPortal';

interface HtmlRendererProps {
  block: HtmlCanvasBlock;
  revisionTopic?: string;
  onRevisionSubmit?: (instruction: string) => void | Promise<void>;
  onRevisionAccepted?: (block: CanvasBlock) => void;
}

export function HtmlRenderer({ block, revisionTopic, onRevisionSubmit, onRevisionAccepted }: HtmlRendererProps) {
  const { fullscreen, toggle, exit } = useCanvasFullscreen();
  const title = block.title || 'HTML canvas';
  const height = block.height ?? 360;
  const openExternal = useCallback(() => {
    openHtmlInNewTab(block.source);
  }, [block.source]);
  const download = useCallback(() => downloadHtmlFile(block.source, title), [block.source, title]);

  const controls = (
    <CanvasControls onDownload={download} onOpenExternal={openExternal} onMaximize={toggle} fullscreen={fullscreen} />
  );

  return (
    <CanvasFullscreenPortal open={fullscreen} onExit={exit}>
      <CanvasFrame
        title={block.title}
        source={block.source}
        controls={controls}
        className="html-canvas-layer"
        revisionBlock={block}
        revisionTopic={revisionTopic}
        onRevisionSubmit={onRevisionSubmit}
        onRevisionAccepted={onRevisionAccepted}
      >
        <iframe
          title={title}
          srcDoc={injectOpaqueOriginStorageShim(block.source)}
          sandbox={CANVAS_HTML_IFRAME_SANDBOX}
          className="html-canvas-frame"
          style={{ height: fullscreen ? '100%' : height }}
        />
      </CanvasFrame>
    </CanvasFullscreenPortal>
  );
}


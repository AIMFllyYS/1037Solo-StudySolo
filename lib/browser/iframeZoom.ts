export interface IframeZoomInput {
  containerWidth: number;
  containerHeight: number;
  logicalWidth: number;
  zoomFactor: number;
}

export interface IframeZoomLayout {
  fitScale: number;
  renderScale: number;
  iframeWidth: number;
  iframeHeight: number;
  offsetLeft: number;
}

/**
 * Downscale a simulated viewport that is wider than the host panel.
 * User zoom stays independent by changing the iframe's CSS viewport and applying
 * the matching outer transform, which preserves visible bounds while allowing
 * the site to reflow at the requested zoom.
 */
export function computeIframeZoomLayout({
  containerWidth,
  containerHeight,
  logicalWidth,
  zoomFactor,
}: IframeZoomInput): IframeZoomLayout {
  const width = Number.isFinite(containerWidth) ? Math.max(0, containerWidth) : 0;
  const height = Number.isFinite(containerHeight) ? Math.max(0, containerHeight) : 0;
  const viewportWidth = Number.isFinite(logicalWidth) ? Math.max(1, logicalWidth) : 1;
  const zoom = Number.isFinite(zoomFactor) ? Math.min(2, Math.max(0.5, zoomFactor)) : 1;
  const fitScale = width > 0 ? Math.min(1, width / viewportWidth) : 1;
  const logicalHeight = fitScale > 0 ? height / fitScale : height;
  const iframeWidth = viewportWidth / zoom;
  const iframeHeight = logicalHeight / zoom;
  const renderScale = fitScale * zoom;
  const renderedWidth = iframeWidth * renderScale;

  return {
    fitScale,
    renderScale,
    iframeWidth,
    iframeHeight,
    offsetLeft: Math.max(0, (width - renderedWidth) / 2),
  };
}

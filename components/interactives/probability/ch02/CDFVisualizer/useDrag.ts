import { useCallback, useRef, useEffect } from "react";
import { SVG_W } from "./appearance";

// ─── 拖拽 Hook ───────────────────────────────────────────────────
export function useDrag(
  onDrag: (svgX: number) => void,
  svgRef: React.RefObject<SVGSVGElement | null>
) {
  const dragging = useRef(false);

  const getSvgX = useCallback(
    (clientX: number): number => {
      const svg = svgRef.current;
      if (!svg) return 0;
      const rect = svg.getBoundingClientRect();
      const scaleX = SVG_W / rect.width;
      return (clientX - rect.left) * scaleX;
    },
    [svgRef]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      onDrag(getSvgX(e.clientX));
    },
    [onDrag, getSvgX]
  );

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current) return;
      onDrag(getSvgX(e.clientX));
    },
    [onDrag, getSvgX]
  );

  const onMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // Touch support
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      dragging.current = true;
      onDrag(getSvgX(e.touches[0].clientX));
    },
    [onDrag, getSvgX]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!dragging.current) return;
      onDrag(getSvgX(e.touches[0].clientX));
    },
    [onDrag, getSvgX]
  );

  const onTouchEnd = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [onTouchMove, onTouchEnd]);

  return { onMouseDown, onTouchStart };
}
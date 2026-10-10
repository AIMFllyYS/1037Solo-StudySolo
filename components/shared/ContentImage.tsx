"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import displayImages from "@/lib/content-data/display-images.generated.json";
import { useLightbox } from "@/lib/stores/workspace/lightbox";

interface ContentImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  node?: unknown;
}

/**
 * Shared image component for markdown content (NoteRenderer & QuizMarkdown).
 * Wraps in <figure> when a title/caption is present; shows a fallback on error.
 */
const displayByOriginal = displayImages as Record<string, { src: string; width: number; height: number; originalWidth: number; originalHeight: number }>;

export function ContentImage({ src, alt, title, node, onClick, onKeyDown, tabIndex, style, ...rest }: ContentImageProps) {
  void node;
  const [failed, setFailed] = useState<{ src: string; stage: "display" | "original" } | null>(null);
  const originalSrc = typeof src === "string" ? src : "";
  const cleanSrc = originalSrc.split("?")[0];
  const display = displayByOriginal[cleanSrc];
  const useDisplay = Boolean(display && !(failed?.stage === "display" && failed.src === originalSrc));
  const errored = failed?.stage === "original" && failed.src === originalSrc;

  if (errored || !src) {
    return (
      <span className="figure-directive-error" role="img" aria-label={alt ?? "image"}>
        <ImageOff size={24} />
        <span>{alt || "图片加载失败"}</span>
      </span>
    );
  }

  const imgEl = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={useDisplay ? display.src : src}
      alt={alt ?? ""}
      title={title}
      loading="lazy"
      decoding="async"
      width={useDisplay ? display.width : undefined}
      height={useDisplay ? display.height : undefined}
      tabIndex={display ? tabIndex ?? 0 : tabIndex}
      role={display ? "button" : undefined}
      style={display ? { cursor: "zoom-in", ...style } : style}
      onClick={(event) => {
        onClick?.(event);
        if (display && !event.defaultPrevented) {
          event.preventDefault();
          useLightbox.getState().open(originalSrc, alt ?? "");
        }
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (display && !event.defaultPrevented && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          useLightbox.getState().open(originalSrc, alt ?? "");
        }
      }}
      onError={() => setFailed({ src: originalSrc, stage: useDisplay ? "display" : "original" })}
      {...rest}
    />
  );

  if (title) {
    return (
      <figure className="figure-directive">
        {imgEl}
        <figcaption>{title}</figcaption>
      </figure>
    );
  }

  return imgEl;
}

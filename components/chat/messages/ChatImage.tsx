"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";
import { useLightbox } from "@/lib/stores/lightbox";
import { useShareImagePlaceholder } from "@/components/share/ShareViewContext";
import { useT } from "@/lib/i18n/index";

export function ChatImage({ src, alt, title }: ImgHTMLAttributes<HTMLImageElement>) {
  const t = useT();
  const [errored, setErrored] = useState(false);
  const openLightbox = useLightbox((s) => s.open);
  /**
   * 公开分享页：云端 payload 刻意剥掉了所有媒体（见 lib/sync/payload.ts），
   * 这里再尝试渲染只会得到一张裂图，所以直接换成占位。
   * 非分享页时该值为 null，下面这段整个跳过——ChatImage 的公共行为不变。
   */
  const shareImagePlaceholder = useShareImagePlaceholder();

  const resolvedSrc: string | undefined = typeof src === "string" ? src : undefined;

  if (shareImagePlaceholder) {
    return (
      <span className="figure-directive-error" role="img" aria-label={alt || shareImagePlaceholder}>
        <ImageOff size={24} />
        <span>{shareImagePlaceholder}</span>
      </span>
    );
  }

  if (errored || !resolvedSrc) {
    return (
      <span className="figure-directive-error" role="img" aria-label={alt ?? "image"}>
        <ImageOff size={24} />
        <span>{alt || t("trace.images.loadFailed")}</span>
      </span>
    );
  }

  const handleClick = () => {
    openLightbox(resolvedSrc, alt || title || "");
  };

  const imgEl = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt={alt ?? ""}
      title={title}
      loading="lazy"
      decoding="async"
      onError={() => setErrored(true)}
      onClick={handleClick}
      className="chat-image-clickable"
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

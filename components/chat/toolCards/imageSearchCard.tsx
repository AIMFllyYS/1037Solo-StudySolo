"use client";

import { AgentImageIcon } from "@/components/icons/AgentIcons";
import { ChatImage } from "@/components/chat/messages/ChatImage";
import { ImageStrip } from "@/components/chat/attachments/ImageStrip";
import { dedupeByKey, webItemKey } from "@/lib/chat/sources/traceSources";
import { safeHttpUrl } from "@/components/browser/safeUrl";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";
import { useT } from "@/lib/i18n";

export default function ImageSearchResultCard({ part }: ResultCardProps<"imageSearch">) {
  const t = useT();
  if (part.state !== "output-available" || !part.output.sources?.length) return null;
  const sources = dedupeByKey(part.output.sources, webItemKey);
  if (!sources.length) return null;
  const fallbackTitle = t("trace.images.untitled");

  return (
    <div className="image-search-gallery">
      <div className="image-search-gallery-header">
        <AgentImageIcon size={16} />
        <span>{t("trace.images.searchTitle", { count: sources.length })}</span>
        <span className="image-search-gallery-via">via Unsplash</span>
      </div>
      <ImageStrip>
        {sources.map((source, index) => (
          <div
            key={source.url || `image:${index}:${source.title || source.alt || "untitled"}`}
            className="image-search-gallery-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/uri-list", source.url);
              e.dataTransfer.setData("text/plain", source.url);
              e.dataTransfer.effectAllowed = "copy";
            }}
          >
            <ChatImage src={source.url} alt={source.alt || source.title || fallbackTitle} />
            <div className="image-search-gallery-credit">
              {/* 搜索结果来自联网工具返回，href 只放行 http(s)，其余 scheme 不渲染链接。 */}
              {safeHttpUrl(source.url) ? (
                <a href={safeHttpUrl(source.url)} target="_blank" rel="noopener noreferrer">
                  {source.title || source.alt || fallbackTitle}
                </a>
              ) : (
                <span>{source.title || source.alt || fallbackTitle}</span>
              )}
              {source.author ? (
                <>
                  {" · "}
                  {safeHttpUrl(source.authorUrl || source.url) ? (
                    <a href={safeHttpUrl(source.authorUrl || source.url)} target="_blank" rel="noopener noreferrer">
                      {source.author}
                    </a>
                  ) : (
                    <span>{source.author}</span>
                  )}
                </>
              ) : null}
              {" · "}
              <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer">Unsplash</a>
            </div>
          </div>
        ))}
      </ImageStrip>
    </div>
  );
}

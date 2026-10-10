"use client";

import { memo, useEffect, useRef } from "react";
import { ListTree, ChevronRight, FileText } from "lucide-react";
import { useStore } from "@/lib/store";
import type { TocItem } from "@/lib/types/toc";

function handleTocClick(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/** 单个 TOC 节点行 — 递归渲染子节点，带 VS Code 风格引导线 */
const TocNode = memo(function TocNode({
  item,
  depth,
}: {
  item: TocItem;
  depth: number;
}) {
  const isActive = useStore((s) => s.activeTocId === item.id);
  const hasChildren = item.children.length > 0;
  const isH1 = item.level === 1;

  return (
    <div>
      <button
        onClick={() => handleTocClick(item.id)}
        data-toc-id={item.id}
        title={item.text}
        className="flex w-full items-center gap-1 border-0 bg-transparent text-left outline-none"
        style={{
          paddingLeft: depth * 16 + 4,
          height: 28,
          lineHeight: "28px",
          fontSize: 13,
          fontWeight: isH1 ? 600 : 400,
          background: isActive
            ? "var(--md-sys-color-primary-container)"
            : undefined,
          color: isActive
            ? "var(--md-sys-color-on-primary-container)"
            : isH1
              ? "var(--md-sys-color-on-surface)"
              : "var(--md-sys-color-on-surface-variant)",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background =
              "var(--md-sys-color-surface-container-high)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isActive
            ? "var(--md-sys-color-primary-container)"
            : "";
        }}
      >
        {/* 展开箭头（有子节点时显示，全展开模式下固定旋转 90deg） */}
        <span
          className="inline-flex shrink-0 items-center justify-center"
          style={{
            width: 16,
            height: 16,
            opacity: hasChildren ? 1 : 0,
          }}
        >
          {hasChildren && (
            <ChevronRight
              size={14}
              style={{
                transform: "rotate(90deg)",
                color: "var(--md-sys-color-outline)",
              }}
            />
          )}
        </span>

        {/* 图标 */}
        <span
          className="inline-flex shrink-0 items-center justify-center"
          style={{ width: 18, height: 18 }}
        >
          {isH1 ? (
            <FileText
              size={14}
              style={{ color: "var(--md-sys-color-primary)" }}
            />
          ) : (
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "var(--md-sys-color-outline)",
                display: "inline-block",
              }}
            />
          )}
        </span>

        {/* 标题文本 */}
        <span
          className="truncate"
          style={{ fontSize: 13 }}
        >
          {item.text}
        </span>
      </button>

      {/* 子节点：带垂直引导线 */}
      {hasChildren && (
        <div
          style={{
            marginLeft: 8,
            borderLeft: "1px solid var(--md-sys-color-outline-variant)",
          }}
        >
          {item.children.map((child) => (
            <TocNode
              key={child.id}
              item={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
});

function EmptyToc() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center"
      style={{ minHeight: 200 }}
    >
      <ListTree
        size={28}
        style={{ color: "var(--md-sys-color-outline)" }}
      />
      <p
        className="text-[13px]"
        style={{
          color: "var(--md-sys-color-on-surface-variant)",
        }}
      >
        当前页面无目录
      </p>
    </div>
  );
}

export default function TocTree() {
  const tocItems = useStore((s) => s.tocItems);
  const activeTocId = useStore((s) => s.activeTocId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // activeTocId 变化时，自动滚动 TOC 面板使 active 项可见
  useEffect(() => {
    if (!activeTocId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(
      `[data-toc-id="${activeTocId}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [activeTocId]);

  if (tocItems.length === 0) {
    return (
      <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
        <div
          className="shrink-0 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--md-sys-color-outline)" }}
        >
          目录
        </div>
        <EmptyToc />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="scroll-y flex-1"
      style={{ padding: "4px 0", minHeight: 0 }}
    >
      <div
        className="shrink-0 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--md-sys-color-outline)" }}
      >
        目录
      </div>
      {tocItems.map((item) => (
        <TocNode
          key={item.id}
          item={item}
          depth={0}
        />
      ))}
    </div>
  );
}

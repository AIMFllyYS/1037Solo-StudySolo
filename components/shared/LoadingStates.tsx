"use client";

import clsx from "clsx";
import BrandLogo from "@/components/layout/BrandLogo";
import { NoteSkeleton } from "@/components/notes/NoteSkeleton";
import { useT } from "@/lib/i18n";

/**
 * 全站统一的懒加载占位。
 * - BootSplash：整页（根 Suspense / 工作台首屏）。品牌图形 + 细进度条，前 140ms 透明，快路径不闪屏。
 * - PanelSkeleton：面板 / 标签页级占位。按「将要出现的内容形态」选 variant，而不是一律灰块。
 * 动画样式在 app/styles/loading.css（只用 transform / opacity）。
 */

export function BootSplash({ label }: { label?: string }) {
  const t = useT();
  const text = label ?? t("app.loading.label");
  return (
    <div className="ss-boot" role="status" aria-label={text} data-testid="boot-splash">
      <BrandLogo size={44} />
      <span className="ss-boot-name">StudySolo</span>
      <span className="ss-progress" style={{ width: 120 }} aria-hidden />
    </div>
  );
}

function Skel({ w = "100%", h = 12, className, accent = false }: { w?: string | number; h?: number; className?: string; accent?: boolean }) {
  return <span aria-hidden className={clsx("ss-skel", !className?.includes("rounded") && "rounded-lg", accent && "ss-skel-accent", className)} style={{ width: w, height: h }} />;
}

function ListRows() {
  return (
    <div className="flex flex-col gap-1 px-3 py-3">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Skel w={28} h={28} className="shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skel w={`${58 - (index % 3) * 10}%`} h={11} />
            <Skel w={`${32 + (index % 2) * 12}%`} h={9} />
          </div>
        </div>
      ))}
    </div>
  );
}

export type PanelSkeletonVariant = "document" | "chat" | "list" | "cards" | "workspace";

const CHAT_BUBBLES: { side: "l" | "r"; w: string; h: number }[] = [
  { side: "l", w: "62%", h: 40 },
  { side: "r", w: "44%", h: 32 },
  { side: "l", w: "74%", h: 56 },
  { side: "r", w: "36%", h: 32 },
];

/** 面板骨架：`document` 标题+段落、`chat` 气泡、`list` 行列表、`cards` 卡片网格、`workspace` 左栏+正文的整块工作区。 */
export function PanelSkeleton({
  variant = "document",
  label,
  className,
}: {
  variant?: PanelSkeletonVariant;
  label?: string;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      role="status"
      aria-label={label ?? t("app.loading.label")}
      data-testid="panel-skeleton"
      data-variant={variant}
      className={clsx("ss-skel-wrap flex h-full min-h-0 w-full flex-col overflow-hidden", className)}
    >
      {variant === "chat" ? (
        <div className="flex flex-col gap-4 px-4 py-5">
          {CHAT_BUBBLES.map((bubble, index) => (
            <Skel key={index} w={bubble.w} h={bubble.h} accent={bubble.side === "r"} className={clsx("rounded-2xl", bubble.side === "r" && "self-end")} />
          ))}
        </div>
      ) : variant === "list" ? (
        <ListRows />
      ) : variant === "cards" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 px-5 py-4">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex h-[148px] flex-col gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4">
              <Skel w={36} h={36} className="rounded-xl" />
              <Skel w="64%" h={12} />
              <Skel w="86%" h={10} />
              <Skel w="40%" h={10} className="mt-auto" />
            </div>
          ))}
        </div>
      ) : variant === "workspace" ? (
        <div className="flex h-full min-h-0 w-full">
          <aside className="hidden w-64 shrink-0 border-r border-[var(--line-soft)] bg-[var(--bg-panel)] md:block">
            <ListRows />
          </aside>
          <div className="min-w-0 flex-1 overflow-hidden">
            <NoteSkeleton />
          </div>
        </div>
      ) : (
        <NoteSkeleton />
      )}
    </div>
  );
}

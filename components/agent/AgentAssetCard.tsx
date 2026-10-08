"use client";

import Link from "next/link";
import { FileDigit, Globe, Layers, MonitorPlay, GraduationCap } from "lucide-react";
import NotebookFormulaIcon from "@/components/icons/NotebookFormulaIcon";
import FileTypeIcon, { resolveFileGlyphKind } from "@/components/icons/file-types/FileTypeIcon";
import { assetHref } from "@/lib/agent/assetHref";
import Badge from "@/components/ui/Badge";
import { assetOriginLabel, formatAssetTime, type AssetItem } from "@/lib/agent/assetCatalog";

/** 资产卡片的类型图标：六类各不相同，橱窗视图只显示它与标题（不预览正文）。 */
export function AssetKindIcon({ item, size = 20 }: { item: AssetItem; size?: number }) {
  if(item.kind==="classroom")return <GraduationCap size={size}/>;
  if (item.kind === "note") return <NotebookFormulaIcon size={size} />;
  if (item.kind === "flashcard") return <Layers size={size} />;
  if (item.kind === "document") return <FileDigit size={size} />;
  if (item.kind === "artifact") return <MonitorPlay size={size} />;
  if (item.kind === "url") return <Globe size={size} />;
  return (
    <FileTypeIcon
      kind={resolveFileGlyphKind({ mimeType: item.meta?.mimeType, name: item.title })}
      mimeType={item.meta?.mimeType}
      name={item.title}
      size={size}
    />
  );
}

/**
 * 一张资产卡片。整卡是一个 Link：点击**跳到详情页**（不是就地预览）——用户口径如此。
 * 橱窗与列表共用，只是排布不同。
 */
export default function AgentAssetCard({ item, view = "grid" }: { item: AssetItem; view?: "grid" | "list" }) {
  const origin = assetOriginLabel(item.origin);
  const time = formatAssetTime(item.updatedAt);
  if (view === "list") {
    return (
      <Link
        href={assetHref(item.kind, item.id)}
        data-testid={`asset-card-${item.kind}-${item.id}`}
        className="press flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--bg-muted)]"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-weak)] text-[var(--accent-ink)]">
          <AssetKindIcon item={item} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-[var(--ink)]">{item.title}</span>
          <span className="block truncate text-[11.5px] text-[var(--ink-faint)]">{item.subtitle}</span>
        </span>
        <span className="hidden shrink-0 text-[11.5px] text-[var(--ink-faint)] sm:block">{time}</span>
        {origin ? <Badge tone="outline">{origin}</Badge> : null}
      </Link>
    );
  }
  return (
    <Link
      href={assetHref(item.kind, item.id)}
      data-testid={`asset-card-${item.kind}-${item.id}`}
      className="press flex h-[188px] flex-col gap-2.5 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4 text-left transition-[border-color,box-shadow] duration-[var(--duration-fast)] hover:border-[var(--accent)] hover:shadow-[var(--shadow-sm)]"
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-weak)] text-[var(--accent-ink)]">
        <AssetKindIcon item={item} size={22} />
      </span>
      <span className="line-clamp-2 text-[13.5px] font-medium leading-snug text-[var(--ink)]">{item.title}</span>
      <span className="mt-auto flex flex-col gap-1 text-[11.5px] text-[var(--ink-faint)]">
        <span className="truncate">{item.subtitle}</span>
        <span className="flex items-center justify-between gap-2">
          <span>{time}</span>
          {origin ? <Badge tone="outline">{origin}</Badge> : null}
        </span>
      </span>
    </Link>
  );
}
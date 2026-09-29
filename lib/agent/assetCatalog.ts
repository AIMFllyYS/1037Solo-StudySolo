import { subjectLabel } from "@/lib/notes/userNote";
import type { UserNote } from "@/lib/notes/userNote";
import type { ReviewCard } from "@/lib/review/types";
import type { StoredDocument } from "@/lib/documents/types";
import type { Artifact } from "@/lib/stores/artifacts";
import type { ImportRecord } from "@/lib/stores/imports";

/**
 * 「我的资产」的聚合层：把四个产物 store + 本地导入记录摊平成一张可筛选的清单。
 * 纯函数，不碰 store（hook 在 lib/hooks/useAgentAssets.ts）。
 *
 * 口径（用户确认）：**以本机为准 + 同步角标** —— 本机有、云端没上传的也列出来并标「仅本机」。
 * 对话本身不在这里：它们在左栏，资产页只列「产物」与「导入」。
 */

export type AssetKind = "note" | "flashcard" | "document" | "artifact" | "file" | "url" | "classroom";

export const ASSET_KINDS: readonly AssetKind[] = [
  "note",
  "flashcard",
  "document",
  "artifact",
  "file",
  "url",
  "classroom",
];

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  note: "笔记",
  flashcard: "闪卡",
  document: "长文本",
  artifact: "可交互",
  file: "文件",
  url: "网址",
  classroom:"课堂",
};

/** 与云同步 kind 的对应关系；file / url 只在本机。 */
const CLOUD_KIND_OF: Partial<Record<AssetKind, string>> = {
  note: "user-note",
  flashcard: "review-card",
  document: "document",
  artifact: "artifact",
};

export type AssetOrigin = "local" | "cloud" | "both" | "unknown";

export interface AssetItem {
  id: string;
  kind: AssetKind;
  title: string;
  /** 副标题：科目 / 类型 / 来源，列表视图直接显示。 */
  subtitle: string;
  /** 排序用；产物没有时间戳时给 null（排在最后）。 */
  updatedAt: number | null;
  sizeBytes?: number;
  subjectId?: string | null;
  origin: AssetOrigin;
  /** 详情页要用的补充信息（绝对路径 / 网址 / 状态）。 */
  meta?: Record<string, string>;
}

export interface AssetSources {
  notes: UserNote[];
  cards: ReviewCard[];
  documents: StoredDocument[];
  /** 按写入顺序（旧 → 新）；产物没有时间戳，只能靠顺序表近似。 */
  artifacts: Artifact[];
  imports: ImportRecord[];
  classrooms?:Array<{id:string;title:string;updatedAt:string;origin:AssetOrigin}>;
  /** 云端行是否存在：true=已同步，false=仅本机，null=还没拉过（不显示角标）。 */
  cloudRow?: (kind: string, id: string) => boolean | null;
}

function originOf(kind: AssetKind, id: string, cloudRow: AssetSources["cloudRow"]): AssetOrigin {
  const cloudKind = CLOUD_KIND_OF[kind];
  if (!cloudKind) return "local";
  const has = cloudRow?.(cloudKind, id);
  if (has === undefined || has === null) return "unknown";
  return has ? "both" : "local";
}

function clip(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

const CARD_STATUS_LABELS: Record<ReviewCard["status"], string> = {
  saved: "待整理",
  processing: "整理中",
  parsing: "整理中",
  ready: "已就绪",
  error: "出错",
};

const DOC_STATUS_LABELS: Record<StoredDocument["status"], string> = {
  idle: "待写",
  outlining: "列提纲",
  writing: "写作中",
  done: "已完成",
  error: "出错",
};

export function buildAssetItems(sources: AssetSources): AssetItem[] {
  const items: AssetItem[] = [];

  for (const note of sources.notes) {
    items.push({
      id: note.id,
      kind: "note",
      title: note.title.trim() || "无标题笔记",
      subtitle: [subjectLabel(note.subjectId), note.kind === "classroom" ? "课堂便签" : "个人笔记"]
        .filter(Boolean)
        .join(" · "),
      updatedAt: note.updatedAt ?? note.createdAt ?? null,
      subjectId: note.subjectId ?? null,
      origin: originOf("note", note.id, sources.cloudRow),
    });
  }

  for (const card of sources.cards) {
    items.push({
      id: card.id,
      kind: "flashcard",
      title: card.front.trim() || clip(card.originalText, 40) || "未成卡",
      subtitle: [subjectLabel(card.subjectId), CARD_STATUS_LABELS[card.status]]
        .filter(Boolean)
        .join(" · "),
      updatedAt: card.createdAt ?? null,
      subjectId: card.subjectId ?? null,
      origin: originOf("flashcard", card.id, sources.cloudRow),
      meta: { sourceLabel: card.sourceLabel },
    });
  }

  for (const doc of sources.documents) {
    items.push({
      id: doc.id,
      kind: "document",
      title: doc.spec.title.trim() || "未命名长文",
      subtitle: ["长文本", DOC_STATUS_LABELS[doc.status], `${doc.sections.length} 节`].join(" · "),
      updatedAt: doc.updatedAt ?? doc.createdAt ?? null,
      origin: originOf("document", doc.id, sources.cloudRow),
    });
  }

  sources.artifacts.forEach((artifact, index) => {
    items.push({
      id: artifact.id,
      kind: "artifact",
      title: artifact.title.trim() || "未命名演示",
      subtitle: "可交互 HTML",
      // 产物不带时间戳：用写入顺序当排序键（越靠后越新）。
      updatedAt: index,
      origin: originOf("artifact", artifact.id, sources.cloudRow),
    });
  });

  for (const record of sources.imports) {
    items.push({
      id: record.id,
      kind: record.kind,
      title: record.title?.trim() || record.name,
      subtitle:
        record.kind === "url"
          ? "网址快捷方式"
          : [record.mimeType, record.absPath ? "本机路径" : "仅文件名"].filter(Boolean).join(" · "),
      updatedAt: record.updatedAt ?? record.createdAt ?? null,
      sizeBytes: record.sizeBytes,
      // 导入记录只在本机：不参与云角标。
      origin: "local",
      meta: {
        ...(record.absPath ? { absPath: record.absPath } : {}),
        ...(record.url ? { url: record.url } : {}),
        ...(record.mimeType ? { mimeType: record.mimeType } : {}),
        ...(record.projectId ? { projectId: record.projectId } : {}),
      },
    });
  }

  for(const session of sources.classrooms??[]){items.push({id:session.id,kind:"classroom",title:session.title,subtitle:"Classolo 文稿、提纲与课堂问答",updatedAt:new Date(session.updatedAt).getTime(),origin:session.origin});}
  return items;
}

export type AssetSort = "recent" | "title";

export interface AssetFilter {
  kind?: AssetKind | "all";
  query?: string;
  sort?: AssetSort;
}

export function sortAssetItems(items: AssetItem[], sort: AssetSort = "recent"): AssetItem[] {
  const sorted = [...items];
  if (sort === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
    return sorted;
  }
  sorted.sort((a, b) => {
    const at = a.updatedAt ?? Number.NEGATIVE_INFINITY;
    const bt = b.updatedAt ?? Number.NEGATIVE_INFINITY;
    if (bt !== at) return bt - at;
    return a.title.localeCompare(b.title, "zh-Hans-CN");
  });
  return sorted;
}

export function matchesAssetQuery(item: AssetItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const hay = [item.title, item.subtitle, item.meta?.absPath, item.meta?.url, item.meta?.sourceLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export function filterAssets(items: AssetItem[], filter: AssetFilter = {}): AssetItem[] {
  const kind = filter.kind && filter.kind !== "all" ? filter.kind : null;
  const pool = kind ? items.filter((item) => item.kind === kind) : items;
  return sortAssetItems(
    pool.filter((item) => matchesAssetQuery(item, filter.query ?? "")),
    filter.sort ?? "recent",
  );
}

export interface AssetCounts {
  all: number;
  byKind: Record<AssetKind, number>;
}

export function assetCounts(items: AssetItem[]): AssetCounts {
  const byKind = Object.fromEntries(ASSET_KINDS.map((kind) => [kind, 0])) as Record<AssetKind, number>;
  for (const item of items) byKind[item.kind] += 1;
  return { all: items.length, byKind };
}

/** 同步角标的展示文案；unknown 不显示角标（还没和云端对过账）。 */
export function assetOriginLabel(origin: AssetOrigin): string | null {
  if (origin === "local") return "仅本机";
  if (origin === "both") return "已同步";
  if (origin === "cloud") return "来自云端";
  return null;
}

export function formatAssetTime(timestamp: number | null): string {
  if (!timestamp || timestamp <= 0) return "—";
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatAssetSize(bytes: number | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

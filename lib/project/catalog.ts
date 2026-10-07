import { PROJECT_LIMITS } from "./limits";
import type { ProjectFileEntry, ProjectFileStatus, ProjectStudioRef } from "./types";

/**
 * 请求体里携带的「项目文件目录」与「本轮切片」构造器。纯函数。
 *
 * 为什么这么拆：服务端工具读不到浏览器 IndexedDB（见 lib/ai/agent/tools/_shared.ts 的既有范式），
 * 所以目录（小）随每次请求上行，正文（大）只在「本轮携带」的范围内上行。
 */

export interface ProjectSliceIndexItem {
  sliceId: string;
  title: string;
  chars: number;
  summary: string;
}

export interface ProjectFileCatalogItem {
  cloudFileId?: string;
  fileId: string;
  name: string;
  kind: ProjectFileEntry["kind"];
  status: ProjectFileStatus;
  error?: string;
  /** Studio 教材软链接：只有 path，正文由既有 getSection(path) 读。 */
  studioRef?: ProjectStudioRef;
  slices: ProjectSliceIndexItem[];
}

export interface ProjectCatalog {
  projectId: string;
  files: ProjectFileCatalogItem[];
  bytes: number;
  /** 目录超上限被裁过（工具里会说明，避免模型以为文件就这么点切片）。 */
  truncated: boolean;
}

function toCatalogItem(file: ProjectFileEntry): ProjectFileCatalogItem {
  return {
    fileId: file.id,
    cloudFileId: file.cloudFileId,
    name: file.name,
    kind: file.kind,
    status: file.status,
    ...(file.error ? { error: file.error } : {}),
    ...(file.studioRef ? { studioRef: file.studioRef } : {}),
    slices: file.slices.map((slice) => ({
      sliceId: slice.id,
      title: slice.title,
      chars: slice.chars,
      summary: slice.summary,
    })),
  };
}

function byteSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function buildProjectCatalog(files: ProjectFileEntry[], projectId: string): ProjectCatalog {
  const items = files
    .filter((file) => file.projectId === projectId)
    .map(toCatalogItem)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

  let truncated = false;
  let bytes = byteSize(items);
  // 第一轮：轮转裁——每次从"当前切片最多"的文件里去掉最后一片。
  // 这样每个文件都先各留一片，而不是把排在后面的文件整个从模型视野里抹掉
  // （以前的实现从尾部整文件地删，排在后面的文件会直接消失，模型不知道它存在）。
  while (bytes > PROJECT_LIMITS.MAX_CATALOG_BYTES) {
    const target = items
      .filter((item) => item.slices.length > 1)
      .sort((a, b) => b.slices.length - a.slices.length)[0];
    if (!target) break;
    target.slices = target.slices.slice(0, target.slices.length - 1);
    truncated = true;
    bytes = byteSize(items);
  }
  // 第二轮：每个文件只剩一片还是超（比如单个文件的摘要就很大）时，才真的让某些文件
  // 从索引里消失；仍然先从排在最后的开始。
  while (bytes > PROJECT_LIMITS.MAX_CATALOG_BYTES) {
    const target = items.filter((item) => item.slices.length > 0).pop();
    if (!target) break;
    target.slices = target.slices.slice(0, target.slices.length - 1);
    truncated = true;
    bytes = byteSize(items);
  }

  return { projectId, files: items, bytes, truncated };
}

export interface ProjectSlicePayload {
  fileId: string;
  sliceId: string;
  title: string;
  text: string;
}

export interface CarryPlan {
  /** all = 项目不大，默认全带；pinned = 只带用户勾的；none = 没有可带的内容。 */
  mode: "all" | "pinned" | "none";
  sliceIds: string[];
  chars: number;
  /** 项目切片正文总字数（用来告诉用户「已带入 N 片 / 共 M 片」）。 */
  totalChars: number;
  totalSlices: number;
  truncated: boolean;
}

/**
 * 携带计划：正文合计 ≤ MAX_CARRY_CHARS 就全部默认带上（用户不用手动勾），
 * 超了才只带 pinned 的切片（窗口里明确显示已带入多少片）。
 */
export function planCarry(files: ProjectFileEntry[], projectId?: string): CarryPlan {
  const pool = files.filter(
    (file) => file.kind === "imported" && (projectId === undefined || file.projectId === projectId),
  );
  const totalSlices = pool.reduce((sum, file) => sum + file.slices.length, 0);
  const totalChars = pool.reduce(
    (sum, file) => sum + file.slices.reduce((inner, slice) => inner + slice.chars, 0),
    0,
  );
  if (totalSlices === 0) {
    return { mode: "none", sliceIds: [], chars: 0, totalChars, totalSlices, truncated: false };
  }
  if (totalChars <= PROJECT_LIMITS.MAX_CARRY_CHARS) {
    return {
      mode: "all",
      sliceIds: [],
      chars: totalChars,
      totalChars,
      totalSlices,
      truncated: false,
    };
  }
  const pinned = pool.flatMap((file) => file.slices.filter((slice) => slice.pinned).map((slice) => slice.id));
  if (pinned.length === 0) {
    return { mode: "none", sliceIds: [], chars: 0, totalChars, totalSlices, truncated: true };
  }
  return {
    mode: "pinned",
    sliceIds: pinned,
    chars: 0,
    totalChars,
    totalSlices,
    truncated: true,
  };
}

export interface SliceBodyResult {
  payloads: ProjectSlicePayload[];
  chars: number;
  truncated: boolean;
}

/** 按携带计划取出切片正文；总额仍以 MAX_CARRY_CHARS 封顶。 */
export function buildProjectSliceBodies(
  files: ProjectFileEntry[],
  plan: CarryPlan,
  projectId?: string,
): SliceBodyResult {
  const pool = files.filter(
    (file) => file.kind === "imported" && (projectId === undefined || file.projectId === projectId),
  );
  const pinnedSet = new Set(plan.sliceIds);
  const payloads: ProjectSlicePayload[] = [];
  let chars = 0;
  let truncated = false;
  for (const file of pool) {
    for (const slice of file.slices) {
      const carried = plan.mode === "all" || pinnedSet.has(slice.id);
      if (!carried) continue;
      if (chars + slice.chars > PROJECT_LIMITS.MAX_CARRY_CHARS) {
        truncated = true;
        continue;
      }
      chars += slice.chars;
      payloads.push({ fileId: file.id, sliceId: slice.id, title: slice.title, text: slice.text });
    }
  }
  return { payloads, chars, truncated };
}

/**
 * 携带摘要：只统计"目录里能看到的切片"与"这一轮真的带进上下文的切片"。
 * 服务端用它判断要不要给用户一条降级提示——项目一大就从 all 翻成 pinned/none，
 * 以前这个翻转是静默的，用户只会看到 Agent 说"这一轮没携带到正文"。
 */
export interface CarrySummary {
  /** 真的进了上下文、readProjectSlices 能读到的切片数。 */
  carried: number;
  /** 目录里可见的切片总数。 */
  total: number;
  /** 未全带：模型只能读到 carried 那部分。 */
  degraded: boolean;
}

/** 服务端拿到的目录只含索引字段；这里只依赖 slices 的长度。 */
export function summarizeCarry(
  files: readonly { slices: readonly { sliceId: string }[] }[],
  carriedSlices: readonly { sliceId: string }[],
): CarrySummary {
  const total = files.reduce((sum, file) => sum + file.slices.length, 0);
  const carried = carriedSlices.length;
  // 目录本身也可能被裁过：别报出 carried > total 这种自相矛盾的比例。
  return { carried, total: Math.max(total, carried), degraded: total > 0 && carried < total };
}

/** 降级时给用户的一句话（data-info）。全带或没项目时返回 null。 */
export function carryNotice(summary: CarrySummary): string | null {
  if (!summary.degraded) return null;
  const guide = summary.carried === 0
    ? "本轮一片正文都没进上下文"
    : `本轮只带入了 ${summary.carried}/${summary.total} 片正文`;
  return `项目文件偏大，${guide}。需要其它内容时，请在项目文件窗勾选切片后点「带入对话」，或在输入框里指明文件名。`;
}

/**
 * 把「本会话已读过的切片」并进携带计划。
 *
 * 为什么需要：项目超预算后会从"全带"翻成"只带勾选的"，于是模型第 3 轮读得到的东西，
 * 第 5 轮可能就读不到了——用户感受就是"文件过一会儿就找不着了"。已读过的切片进过一次
 * 上下文说明它跟这轮对话有关，理应继续可读，直到用户主动清空或超出总预算。
 *
 * 只在降级态（pinned/none）补：all 本来就全覆盖，补了也不会多带任何东西。
 */
export function withRememberedSlices(plan: CarryPlan, remembered: readonly string[]): CarryPlan {
  if (plan.mode === "all" || remembered.length === 0) return plan;
  const known = new Set(plan.sliceIds);
  const extra = remembered.filter((id) => id && !known.has(id));
  if (extra.length === 0) return plan;
  return { ...plan, sliceIds: [...plan.sliceIds, ...extra] };
}

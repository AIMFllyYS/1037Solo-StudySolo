import { PROJECT_LIMITS } from "./limits";
import type { ProjectSlice } from "./types";

/**
 * 把一段长文本切成「索引 + 切片」。纯函数，不碰 DOM / fs —— 本地解析与测试共用同一套规则。
 *
 * 规则：
 * 1. 先按标题（Markdown 的 #/##/###）切；标题不足两处时退回按字符窗口切；
 * 2. 任何一片超过 MAX_SLICE_CHARS 再按窗口 + 重叠二次切；
 * 3. 总片数封顶 MAX_SLICES，超出的丢掉并在索引里注明。
 */

export interface SliceTextOptions {
  /** 文件名，写进索引标题。 */
  name?: string;
  /** 覆盖上限（测试与特殊来源用）。 */
  maxSlices?: number;
  sliceChars?: number;
  sliceOverlap?: number;
  maxSliceChars?: number;
}

export interface SliceTextResult {
  slices: ProjectSlice[];
  indexMarkdown: string;
  charCount: number;
  /** 片数被 MAX_SLICES 截断（索引里会写明）。 */
  truncated: boolean;
}

const HEADING_RE = /^[ \t]{0,3}(#{1,3})[ \t]+(.+?)[ \t]*$/;

interface HeadingSection {
  title: string;
  body: string;
}

function normalize(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
}

function clipSummary(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 按 Markdown 标题切段；标题少于两处时返回 null（交给窗口切）。 */
function splitByHeadings(text: string): HeadingSection[] | null {
  const lines = text.split("\n");
  const sections: HeadingSection[] = [];
  let current: HeadingSection | null = null;
  let headingCount = 0;
  for (const line of lines) {
    const match = HEADING_RE.exec(line);
    if (match) {
      headingCount += 1;
      if (current) sections.push(current);
      current = { title: match[2]!.trim() || "未命名小节", body: "" };
      continue;
    }
    if (!current) current = { title: "前言", body: "" };
    current.body = current.body ? `${current.body}\n${line}` : line;
  }
  if (current) sections.push(current);
  if (headingCount < 2) return null;
  return sections.filter((section) => section.body.trim() || section.title !== "前言");
}

/** 窗口切：按字符数切片并留重叠，尽量在换行处断开。 */
function windowSlice(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end);
      if (newline > start + size * 0.5) end = newline;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

function makeSlice(index: number, title: string, text: string): ProjectSlice {
  return {
    id: `slice-${index + 1}`,
    title: title || `第 ${index + 1} 段`,
    chars: text.length,
    summary: clipSummary(text),
    text,
  };
}

interface WindowOptions {
  sliceChars: number;
  sliceOverlap: number;
  maxSliceChars: number;
}

function pushSlices(out: ProjectSlice[], title: string, body: string, options: WindowOptions): void {
  const trimmed = body.trim();
  if (!trimmed) return;
  if (trimmed.length <= options.maxSliceChars) {
    out.push(makeSlice(out.length, title, trimmed));
    return;
  }
  const chunks = windowSlice(trimmed, options.sliceChars, options.sliceOverlap);
  chunks.forEach((chunk, index) => {
    out.push(makeSlice(out.length, chunks.length > 1 ? `${title} · ${index + 1}` : title, chunk));
  });
}

export function sliceText(raw: string, options: SliceTextOptions = {}): SliceTextResult {
  const text = normalize(raw);
  const resolved: WindowOptions = {
    sliceChars: options.sliceChars ?? PROJECT_LIMITS.SLICE_CHARS,
    sliceOverlap: options.sliceOverlap ?? PROJECT_LIMITS.SLICE_OVERLAP,
    maxSliceChars: options.maxSliceChars ?? PROJECT_LIMITS.MAX_SLICE_CHARS,
  };
  const maxSlices = options.maxSlices ?? PROJECT_LIMITS.MAX_SLICES;

  const slices: ProjectSlice[] = [];
  const sections = splitByHeadings(text);
  if (sections) {
    for (const section of sections) pushSlices(slices, section.title, section.body, resolved);
  } else {
    const chunks = windowSlice(text.trim(), resolved.sliceChars, resolved.sliceOverlap);
    for (const chunk of chunks) pushSlices(slices, `第 ${slices.length + 1} 段`, chunk, resolved);
  }

  const truncated = slices.length > maxSlices;
  const kept = slices.slice(0, maxSlices);
  return {
    slices: kept,
    indexMarkdown: buildIndexMarkdown({
      name: options.name ?? "未命名文件",
      charCount: text.length,
      slices: kept,
      truncated,
    }),
    charCount: text.length,
    truncated,
  };
}

/** 「隐藏索引 md」：人看得懂、Agent 也读得懂的目录（文件头 + 切片表）。 */
export function buildIndexMarkdown(input: {
  name: string;
  charCount: number;
  slices: readonly ProjectSlice[];
  truncated?: boolean;
}): string {
  const lines = [
    `# ${input.name} · 索引`,
    "",
    "> 文件解析索引缓存。正文按标题切片，云端文件全文可由 Agent 按需读取。",
    "",
    `- 原始字数：${input.charCount}`,
    `- 切片数：${input.slices.length}${input.truncated ? "（已达上限，后续内容未索引）" : ""}`,
    "",
    "| # | 切片 | 字数 | 摘要 |",
    "| --- | --- | --- | --- |",
  ];
  input.slices.forEach((slice, index) => {
    lines.push(`| ${index + 1} | ${slice.id} · ${slice.title} | ${slice.chars} | ${slice.summary.replace(/\\|/g, "|")} |`);
  });
  return lines.join("\n");
}

/** 从笔记 Markdown 抽标题，供编辑器左侧目录栏使用。Crepe 7.22 没有官方 TOC。 */

export interface NoteTocItem {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  line: number;
}

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*$/;

export function parseNoteToc(markdown: string): NoteTocItem[] {
  if (!markdown) return [];
  const items: NoteTocItem[] = [];
  const seen = new Map<string, number>();
  const lines = markdown.split(/\r?\n/);
  let fence: { marker: "`" | "~"; length: number } | null = null;

  const pushHeading = (rawTitle: string, level: 1 | 2 | 3, line: number) => {
    const title = stripMdInline(rawTitle);
    if (!title) return;
    const base = slugHeading(title) || `h${line}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    items.push({ id: count === 1 ? base : `${base}-${count}`, level, title, line });
  };

  for (let i = 0; i < lines.length; i++) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[i]);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as "`" | "~";
      if (!fence) fence = { marker, length: fenceMatch[1].length };
      else if (marker === fence.marker && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;

    const match = HEADING_RE.exec(lines[i]);
    if (match) {
      pushHeading(match[2], match[1].length as 1 | 2 | 3, i);
      continue;
    }

    // CommonMark setext headings are also rendered as h1/h2 in the editor.
    const next = lines[i + 1]?.trim();
    const setextLevel = next && /^=+\s*$/.test(next) ? 1 : next && /^-+\s*$/.test(next) ? 2 : null;
    const rawTitle = lines[i].trim();
    if (setextLevel && rawTitle && !/^[-*_]{3,}$/.test(rawTitle)) {
      pushHeading(rawTitle, setextLevel, i);
    }
  }
  return items;
}

export function stripMdInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/\s+#+\s*$/, "")
    .trim();
}

export function slugHeading(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]+/g, "")
    .slice(0, 48);
}

/** 源码 textarea：把光标落到该行并滚进视口。 */
export function focusMarkdownLine(el: HTMLTextAreaElement, line: number): void {
  const lines = el.value.split(/\n/);
  let start = 0;
  for (let i = 0; i < line && i < lines.length; i++) start += lines[i].length + 1;
  const end = start + (lines[line]?.length ?? 0);
  el.focus();
  el.setSelectionRange(start, end);
  const ratio = el.value.length > 0 ? start / el.value.length : 0;
  el.scrollTop = Math.max(0, ratio * el.scrollHeight - el.clientHeight / 3);
}

/** 渲染编辑：按标题文本滚到 Crepe 里对应的 h1–h3。 */
export function scrollCrepeHeading(root: HTMLElement | null, title: string, occurrence = 0): boolean {
  if (!root) return false;
  const matches: HTMLElement[] = [];
  const headings = root.querySelectorAll<HTMLElement>("h1, h2, h3");
  for (const node of headings) {
    if (stripMdInline(node.textContent ?? "") === title) {
      matches.push(node);
    }
  }
  const target = matches[occurrence];
  if (!target) return false;
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  return true;
}

import { unwrapMark, wrapRange } from "@/lib/notes/selection/crayonHighlight";

interface MapPoint {
  node: Text;
  offset: number;
}

const BLOCK_SELECTOR =
  "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, pre, .callout, dt, dd";

function foldAscii(value: string): string {
  return value.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~#>]+/g, "")
    .replace(/\|/g, " ");
}

export function normalizeForMatch(input: string): string {
  return foldAscii(
    stripMarkdown(input)
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function snippetNeedles(snippet: string): string[] {
  const raw = normalizeForMatch(snippet);
  if (!raw) return [];
  const out: string[] = [];
  const push = (value: string) => {
    const text = value.trim();
    if (text.length >= 8 && !out.includes(text)) out.push(text);
  };
  push(raw);
  for (const part of raw.split(/[。！？.!?;；]/)) push(part);
  if (raw.length > 48) push(raw.slice(0, 48));
  if (raw.length > 24) push(raw.slice(0, 24));
  if (!out.length && raw.length) out.push(raw);
  return out.sort((a, b) => b.length - a.length);
}

function buildNormalizedCorpus(root: HTMLElement): { haystack: string; points: MapPoint[] } {
  const points: MapPoint[] = [];
  const chars: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const el = (node as Text).parentElement;
      if (!el) return NodeFilter.FILTER_REJECT;
      if (el.closest("script, style, noscript, [data-citation-highlight]")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let lastWasSpace = true;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue ?? "";
    for (let i = 0; i < text.length; i++) {
      const raw = text[i]!;
      if (/[\u200B-\u200D\uFEFF]/.test(raw)) continue;
      if (/\s/.test(raw)) {
        if (lastWasSpace) continue;
        chars.push(" ");
        points.push({ node: node as Text, offset: i });
        lastWasSpace = true;
        continue;
      }
      chars.push(foldAscii(raw));
      points.push({ node: node as Text, offset: i });
      lastWasSpace = false;
    }
  }

  while (chars.length && chars[chars.length - 1] === " ") {
    chars.pop();
    points.pop();
  }
  return { haystack: chars.join(""), points };
}

export function findSnippetRange(root: HTMLElement, snippet: string): Range | null {
  const needles = snippetNeedles(snippet);
  if (!needles.length) return null;
  const { haystack, points } = buildNormalizedCorpus(root);
  if (!haystack) return null;

  for (const needle of needles) {
    const index = haystack.indexOf(needle);
    if (index < 0) continue;
    const start = points[index];
    const end = points[index + needle.length - 1];
    if (!start || !end) continue;
    const range = root.ownerDocument.createRange();
    try {
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, Math.min(end.node.length, end.offset + 1));
      if (!range.collapsed) return range;
    } catch {
      continue;
    }
  }
  return null;
}

export function scrollWithin(container: HTMLElement, target: HTMLElement) {
  const cRect = container.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const next = container.scrollTop + (tRect.top - cRect.top) - Math.max(24, container.clientHeight * 0.22);
  const top = Math.max(0, next);
  if (typeof container.scrollTo === "function") {
    container.scrollTo({ top, behavior: "smooth" });
    return;
  }
  container.scrollTop = top;
}

export function applyCitationHighlight(
  root: HTMLElement,
  snippet: string,
  scrollContainer?: HTMLElement | null,
): (() => void) | null {
  const range = findSnippetRange(root, snippet);
  if (!range) return null;

  const marks = wrapRange(range, "crayon-highlight citation-flash");
  for (const mark of marks) mark.dataset.citationHighlight = "1";

  const target =
    marks[0] ??
    (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement);
  const block = target?.closest(BLOCK_SELECTOR) as HTMLElement | null;
  block?.classList.add("citation-flash-block");

  const scrollTarget = block ?? (target instanceof HTMLElement ? target : null);
  if (scrollTarget && scrollContainer) scrollWithin(scrollContainer, scrollTarget);

  const timer = window.setTimeout(() => cleanup(), 4200);
  function cleanup() {
    window.clearTimeout(timer);
    marks.forEach(unwrapMark);
    block?.classList.remove("citation-flash-block");
  }
  return cleanup;
}

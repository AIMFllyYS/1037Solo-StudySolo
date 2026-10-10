import { extractSnippet, matchFlashcard, matchUserNote } from "@/lib/search/globalSearch";
import { subjectLabel } from "@/lib/notes/userNote";
import { markdownDigest } from "@/lib/notes/proposals/noteChangeProposal";

/** 请求里随身带的本机笔记/闪卡目录上限：只给工具按需取，不进 system 全文。 */
export const MAX_MEMORY_NOTES = 24;
export const MAX_MEMORY_NOTE_CHARS = 6000;
export const MAX_MEMORY_CARDS = 32;
export const MAX_MEMORY_CARD_FIELD_CHARS = 1200;
export const MEMORY_LIST_LIMIT = 8;

export interface UserNoteCatalogItem {
  id: string;
  title: string;
  subjectId: string | null;
  markdown: string;
  updatedAt: number;
  /** 正文被 MAX_MEMORY_NOTE_CHARS 截断过；截断的原文不能用于整篇替换。 */
  truncated?: boolean;
  /** 笔记正文（不含 quote）的指纹，供 updateUserNote 做并发校验。 */
  markdownDigest?: string;
  kind?: "personal" | "classroom";
}

export interface FlashcardCatalogItem {
  id: string;
  subjectId: string;
  sourceLabel: string;
  front: string;
  back: string;
  originalText: string;
  explanation?: string;
  status: string;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** 从本机笔记摊平出请求目录：按更新时间倒序，正文截断。 */
export function collectUserNoteCatalog(
  notes: Array<{
    id: string;
    title: string;
    markdown: string;
    subjectId: string | null;
    updatedAt: number;
    kind?: "personal" | "classroom";
    quote?: string;
  }>,
  limit = MAX_MEMORY_NOTES,
): UserNoteCatalogItem[] {
  return [...notes]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((note) => {
      const full = [note.quote, note.markdown].filter(Boolean).join("\n\n");
      return {
        id: note.id,
        title: note.title,
        subjectId: note.subjectId,
        markdown: clip(full, MAX_MEMORY_NOTE_CHARS),
        updatedAt: note.updatedAt,
        truncated: full.length > MAX_MEMORY_NOTE_CHARS,
        markdownDigest: markdownDigest(note.markdown),
        kind: note.kind,
      };
    });
}

/** 从复习板摊平出请求目录：按创建顺序倒序（新的在前）。 */
export function collectFlashcardCatalog(
  cards: Array<{
    id: string;
    subjectId: string;
    sourceLabel: string;
    front: string;
    back: string;
    originalText: string;
    explanation?: string;
    status: string;
    createdAt?: number;
  }>,
  limit = MAX_MEMORY_CARDS,
): FlashcardCatalogItem[] {
  return [...cards]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, limit)
    .map((card) => ({
      id: card.id,
      subjectId: card.subjectId,
      sourceLabel: card.sourceLabel,
      front: clip(card.front, MAX_MEMORY_CARD_FIELD_CHARS),
      back: clip(card.back, MAX_MEMORY_CARD_FIELD_CHARS),
      originalText: clip(card.originalText, MAX_MEMORY_CARD_FIELD_CHARS),
      explanation: card.explanation ? clip(card.explanation, MAX_MEMORY_CARD_FIELD_CHARS) : undefined,
      status: card.status,
    }));
}

export function filterNotesBySubject(
  notes: readonly UserNoteCatalogItem[],
  subjectId?: string,
): UserNoteCatalogItem[] {
  if (!subjectId) return [...notes];
  return notes.filter((note) => note.subjectId === subjectId);
}

export function filterCardsBySubject(
  cards: readonly FlashcardCatalogItem[],
  subjectId?: string,
): FlashcardCatalogItem[] {
  if (!subjectId) return [...cards];
  return cards.filter((card) => card.subjectId === subjectId);
}

export function findUserNote(
  notes: readonly UserNoteCatalogItem[],
  id: string,
): UserNoteCatalogItem | undefined {
  return notes.find((note) => note.id === id);
}

export function findFlashcard(
  cards: readonly FlashcardCatalogItem[],
  id: string,
): FlashcardCatalogItem | undefined {
  return cards.find((card) => card.id === id);
}

export function listUserNoteLines(
  notes: readonly UserNoteCatalogItem[],
  limit = MEMORY_LIST_LIMIT,
): string[] {
  return notes.slice(0, limit).map((note) => {
    const title = note.title.trim() || "无标题笔记";
    const kind = note.kind === "classroom" ? "课堂便签" : "个人";
    return `- id=${note.id} [${kind}] 「${title}」 ${subjectLabel(note.subjectId)}`;
  });
}

export function searchUserNoteCatalog(
  notes: readonly UserNoteCatalogItem[],
  query: string,
  limit = MEMORY_LIST_LIMIT,
): Array<UserNoteCatalogItem & { snippet: string }> {
  const q = query.trim();
  if (!q) {
    return notes.slice(0, limit).map((note) => ({
      ...note,
      snippet: extractSnippet(note.markdown, ""),
    }));
  }
  return notes
    .map((note) => {
      const hit = matchUserNote(note, q);
      return hit ? { ...note, snippet: hit.snippet, score: hit.score } : null;
    })
    .filter((item): item is UserNoteCatalogItem & { snippet: string; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...rest }) => rest);
}

export function listFlashcardLines(
  cards: readonly FlashcardCatalogItem[],
  limit = MEMORY_LIST_LIMIT,
): string[] {
  return cards.slice(0, limit).map((card) => {
    const title = card.front.trim() || card.originalText.trim() || "复习闪卡";
    return `- id=${card.id} 「${title}」 ${card.sourceLabel || subjectLabel(card.subjectId)}`;
  });
}

export function searchFlashcardCatalog(
  cards: readonly FlashcardCatalogItem[],
  query: string,
  limit = MEMORY_LIST_LIMIT,
): Array<FlashcardCatalogItem & { snippet: string }> {
  const q = query.trim();
  if (!q) {
    return cards.slice(0, limit).map((card) => ({
      ...card,
      snippet: extractSnippet([card.front, card.back, card.originalText].join(" "), ""),
    }));
  }
  return cards
    .map((card) => {
      const hit = matchFlashcard(card, q);
      return hit ? { ...card, snippet: hit.snippet, score: hit.score } : null;
    })
    .filter((item): item is FlashcardCatalogItem & { snippet: string; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...rest }) => rest);
}

/** 易变段只报数量，不 dump 标题/正文。 */
export function formatMemoryCatalogLine(
  notes: readonly UserNoteCatalogItem[],
  cards: readonly FlashcardCatalogItem[],
): string {
  if (!notes.length && !cards.length) return "";
  return `【本机记忆】个人笔记 ${notes.length} 篇，闪卡 ${cards.length} 张。需要对照时先 searchNotes(scope="personal") 或 searchFlashcards 看列表，再按 id 取一篇/一张，不要一次展开全文。要改当前篇就调 updateUserNote 产出候选稿（学生会点同意后才写入），不要翻整库。`;
}

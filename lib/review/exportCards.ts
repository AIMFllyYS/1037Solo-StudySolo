import { downloadAsMarkdown } from "@/lib/documents/export";
import type { ReviewCard } from "@/lib/review/types";
import { ankiTsv } from "@/lib/connectors/anki";

function csvCell(value: string): string {
  const text = value.replace(/\r\n/g, "\n");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function flashcardsToCsv(cards: ReviewCard[]): string {
  const header = ["正面", "背面", "出处", "模式", "原文", "解析"];
  const rows = cards.map((card) => [
    card.front || card.originalText,
    card.back,
    card.sourceLabel,
    card.mode ?? card.cardType,
    card.originalText,
    card.explanation ?? "",
  ]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(String(cell))).join(",")).join("\n");
}

export function downloadFlashcardsCsv(cards: ReviewCard[], title: string): void {
  const blob = new Blob([flashcardsToCsv(cards)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[<>:"/\\|?*\s]+/g, "_")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function flashcardToMarkdown(card: ReviewCard): string {
  const lines = [
    `# ${card.front || card.sourceLabel || "复习闪卡"}`,
    "",
    `出处：${card.sourceLabel}`,
    card.mode ? `模式：${card.mode}` : "",
    "",
    "## 正面",
    "",
    card.front || card.originalText,
    "",
    "## 背面",
    "",
    card.back || "（还没有背面）",
  ];
  if (card.explanation) {
    lines.push("", "## 解析", "", card.explanation);
  }
  if (card.originalText && card.originalText !== card.front) {
    lines.push("", "## 原文", "", card.originalText);
  }
  return lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n");
}

export function downloadFlashcardMarkdown(card: ReviewCard): void {
  downloadAsMarkdown(flashcardToMarkdown(card), card.front || card.sourceLabel || "复习闪卡");
}

export async function downloadFlashcardsAnki(cards: ReviewCard[]): Promise<void> {
  const content = await ankiTsv(cards);
  const url = URL.createObjectURL(new Blob([content], { type: "text/tab-separated-values;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "StudySolo-Anki.tsv"; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

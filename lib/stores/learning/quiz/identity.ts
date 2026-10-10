export function newAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function bankQuizId(subjectId: string, categoryId: string, chapterId: string, generatedAt: string): string {
  return `bank:${JSON.stringify([subjectId, categoryId, chapterId, generatedAt])}`;
}
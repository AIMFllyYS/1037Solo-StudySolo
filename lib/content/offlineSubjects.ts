/** Build-time desktop subject subset. Empty means Web or full online desktop. */
const selected = (process.env.NEXT_PUBLIC_OFFLINE_SUBJECTS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
const allow = selected.length ? new Set(selected) : null;

export function isSubjectInRuntime(subjectId: string): boolean {
  return !allow || allow.has(subjectId);
}

export function filterRuntimeSubjects<T extends { id: string }>(subjects: readonly T[]): T[] {
  return allow ? subjects.filter((subject) => allow.has(subject.id)) : [...subjects];
}

export function offlineSubjectIds(): readonly string[] { return selected; }

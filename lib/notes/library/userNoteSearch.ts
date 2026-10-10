import type { UserNote } from "@/lib/notes/userNote";

export interface UserNoteSearchFields {
  title: string;
  markdown: string | null;
}

type CachedSearchFields = {
  sourceTitle: string;
  sourceMarkdown: string;
  fields: UserNoteSearchFields;
};

// The cache follows the note object lifetime, so changing accounts and rehydrating
// a different note object cannot surface a previous owner's indexed text.
const cache = new WeakMap<UserNote, CachedSearchFields>();

export function getUserNoteSearchFields(note: UserNote): UserNoteSearchFields {
  const current = cache.get(note);
  if (
    current?.sourceTitle === note.title &&
    current.sourceMarkdown === note.markdown &&
    current.fields.markdown !== null
  ) {
    return current.fields;
  }

  const fields: UserNoteSearchFields = {
    title: current?.sourceTitle === note.title ? current.fields.title : note.title.toLowerCase(),
    markdown: note.markdown.toLowerCase(),
  };
  cache.set(note, { sourceTitle: note.title, sourceMarkdown: note.markdown, fields });
  return fields;
}

/**
 * Carry normalized fields across metadata-only UserNote replacements. A changed
 * Markdown string invalidates only that note's body index, and remains lazy until
 * a non-empty search actually needs it.
 */
export function carryUserNoteSearchFields(previous: UserNote, next: UserNote): void {
  const cached = cache.get(previous);
  if (!cached) return;
  const fields: UserNoteSearchFields = {
    title:
      cached.sourceTitle === next.title ? cached.fields.title : next.title.toLowerCase(),
    markdown:
      cached.sourceMarkdown === next.markdown
        ? cached.fields.markdown
        : null,
  };
  cache.set(next, { sourceTitle: next.title, sourceMarkdown: next.markdown, fields });
}

export function userNoteMatchesQuery(note: UserNote, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const fields = getUserNoteSearchFields(note);
  return fields.title.includes(normalizedQuery) || Boolean(fields.markdown?.includes(normalizedQuery));
}

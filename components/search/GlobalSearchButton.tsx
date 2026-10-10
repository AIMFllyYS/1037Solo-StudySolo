"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command, Search } from "lucide-react";
import { useAcademicYear } from "@/lib/stores/academicYear";
import { useGlobalSearch } from "@/lib/keyboard/useGlobalSearch";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { formatShortcut } from "@/lib/keyboard/format";
import { useKeyboardSettings } from "@/lib/keyboard/useKeyboardSettings";
import { useProgressiveGlobalSearch } from "@/lib/search/useProgressiveGlobalSearch";
import type { GlobalSearchHit } from "@/lib/search/globalSearch";
import { openNoteEditor, openFlashcardCitePicker } from "@/lib/notes/openUserNote";
import { useFlashcardCitations } from "@/lib/stores/learning/flashcardCitations";
import SpotlightDialog from "@/components/search/SpotlightDialog";
import { SPOTLIGHT_BODY_CLASS, SPOTLIGHT_INPUT_CLASS, SPOTLIGHT_SEARCH_FIELD_CLASS } from "@/components/search/spotlightChrome";
import GlobalSearchResults from "@/components/search/GlobalSearchResults";
import GlobalSearchFilterMenu, {
  type GlobalSearchKindFilter,
  type GlobalSearchSubjectFilter,
} from "@/components/search/GlobalSearchFilterMenu";

export default function GlobalSearchButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const open = useGlobalSearch((s) => s.open);
  const setOpen = useGlobalSearch((s) => s.setOpen);
  const searchEnabled = useKeyboardSettings((s) => s.isEnabled("global.search"));
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<GlobalSearchKindFilter>(null);
  const [subjectFilter, setSubjectFilter] = useState<GlobalSearchSubjectFilter>(null);
  const deferredQuery = useDeferredValue(query);
  const academicYear = useAcademicYear((s) => s.year);
  const { noteHits, cardHits, bodyHits, notesLoading, cardsLoading, bodyLoading } =
    useProgressiveGlobalSearch(open ? deferredQuery : "", academicYear, kindFilter);

  useOverlayRegistration({
    id: "global-search",
    open,
    onClose: () => setOpen(false),
    priority: 80,
  });

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const openHit = (hit: GlobalSearchHit) => {
    setOpen(false);
    setQuery("");
    if (hit.kind === "note" && hit.noteId) {
      openNoteEditor(hit.noteId);
      return;
    }
    if (hit.kind === "flashcard" && hit.cardId) {
      openFlashcardCitePicker({ subjectId: hit.subjectId ?? null });
      useFlashcardCitations.getState().setActiveCardId(hit.cardId);
      return;
    }
    if (hit.href) router.push(hit.href);
  };

  const shortcutLabel = formatShortcut("global.search");
  const showNotes = !kindFilter || kindFilter === "note";
  const showCards = !kindFilter || kindFilter === "flashcard";
  const showBody = !kindFilter || kindFilter === "body";
  const bySubject = (hits: GlobalSearchHit[]) =>
    subjectFilter ? hits.filter((hit) => hit.subjectId === subjectFilter) : hits;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={searchEnabled ? `全局搜索 ${shortcutLabel}` : "全局搜索（快捷键已关闭）"}
        className={`group ${SPOTLIGHT_SEARCH_FIELD_CLASS} transition-colors hover:border-[var(--md-sys-color-primary)] hover:text-[var(--ink)]`}
        style={{ opacity: searchEnabled ? 1 : 0.72 }}
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.18),transparent)] transition-transform duration-700 group-hover:translate-x-full" />
        <Search size={15} className="relative shrink-0" />
        <span className="relative hidden max-w-28 truncate lg:inline">全局搜索</span>
        {searchEnabled && (
          <span className="relative hidden items-center gap-0.5 rounded-md border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--ink-faint)] xl:flex">
            <Command size={10} /> ⇧F
          </span>
        )}
      </button>

      <SpotlightDialog
        open={open}
        onClose={() => setOpen(false)}
        label="全局搜索"
        icon={<Search size={18} className="shrink-0 text-[var(--md-sys-color-primary)]" />}
        input={
          <>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索章节、正文、笔记、闪卡..."
              className={SPOTLIGHT_INPUT_CLASS}
            />
            <GlobalSearchFilterMenu
              kind={kindFilter}
              subjectId={subjectFilter}
              onKindChange={setKindFilter}
              onSubjectChange={setSubjectFilter}
            />
          </>
        }
      >
        <div className={SPOTLIGHT_BODY_CLASS}>
          <GlobalSearchResults
            query={deferredQuery}
            noteHits={showNotes ? bySubject(noteHits) : []}
            cardHits={showCards ? bySubject(cardHits) : []}
            bodyHits={showBody ? bySubject(bodyHits) : []}
            notesLoading={showNotes && notesLoading}
            cardsLoading={showCards && cardsLoading}
            bodyLoading={showBody && bodyLoading}
            onOpen={openHit}
          />
        </div>
      </SpotlightDialog>
    </>
  );
}

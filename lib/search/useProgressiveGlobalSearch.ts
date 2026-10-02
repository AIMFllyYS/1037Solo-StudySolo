"use client";

import { useEffect, useMemo, useState } from "react";
import { contentTree } from "@/lib/content-data";
import { filterRuntimeSubjects } from "@/lib/content/offlineSubjects";
import { academicYearOfSubject, type AcademicYearId } from "@/lib/constants/academic-year";
import { useUserNotes } from "@/lib/stores/userNotes";
import { useReviewCards } from "@/lib/stores/reviewCards";
import {
  buildGlobalSearchIndex,
  chapterHitsFromIndex,
  listBodySearchShards,
  matchFlashcard,
  matchUserNote,
  mergeBodyHits,
  type GlobalSearchHit,
  type GlobalSearchSectionId,
} from "@/lib/search/globalSearch";
import { scanInChunks, yieldToMain } from "@/lib/search/progressiveScan";
import { fetchSubjectBodyHits } from "@/lib/search/fetchSubjectBody";

const TITLE_LIMIT = 12;
const BODY_LIMIT = 16;

export function useProgressiveGlobalSearch(
  rawQuery: string,
  preferYear: AcademicYearId,
  kind: GlobalSearchSectionId | null = null,
) {
  const query = rawQuery.trim();
  const titleIndex = useMemo(() => buildGlobalSearchIndex({ subjects: filterRuntimeSubjects(contentTree.subjects) }), []);
  const chapterHits = useMemo(
    () => (query && (!kind || kind === "body") ? chapterHitsFromIndex(titleIndex, query, TITLE_LIMIT) : []),
    [kind, query, titleIndex],
  );

  const notesOrder = useUserNotes((s) => s.order);
  const notesHydrated = useUserNotes((s) => s._hasHydrated);
  const cardsOrder = useReviewCards((s) => s.order);
  const cardsHydrated = useReviewCards((s) => s._hasHydrated);
  const wantNotes = !kind || kind === "note";
  const wantCards = !kind || kind === "flashcard";
  const wantBody = !kind || kind === "body";

  const [noteHits, setNoteHits] = useState<GlobalSearchHit[]>([]);
  const [cardHits, setCardHits] = useState<GlobalSearchHit[]>([]);
  const [bodyHits, setBodyHits] = useState<GlobalSearchHit[]>([]);
  const [notesScanning, setNotesScanning] = useState(false);
  const [cardsScanning, setCardsScanning] = useState(false);
  const [bodyLoading, setBodyLoading] = useState(false);

  useEffect(() => {
    if (!query) return;

    const ac = new AbortController();
    void (async () => {
      await yieldToMain();
      if (ac.signal.aborted) return;

      if (wantNotes) {
        const notesState = useUserNotes.getState();
        const notes = notesOrder.map((id) => notesState.byId[id]).filter(Boolean);
        if (notesHydrated && notes.length === 0) {
          setNoteHits([]);
          setNotesScanning(false);
        } else if (notesHydrated) {
          setNotesScanning(true);
          const hits = await scanInChunks(notes, (note) => matchUserNote(note, query), {
            signal: ac.signal,
            onProgress: setNoteHits,
          });
          if (ac.signal.aborted) return;
          setNoteHits(hits);
          setNotesScanning(false);
        }
      } else {
        setNoteHits([]);
        setNotesScanning(false);
      }

      if (wantCards) {
        const cardsState = useReviewCards.getState();
        const cards = cardsOrder.map((id) => cardsState.byId[id]).filter(Boolean);
        if (cardsHydrated && cards.length === 0) {
          setCardHits([]);
          setCardsScanning(false);
        } else if (cardsHydrated) {
          setCardsScanning(true);
          const hits = await scanInChunks(cards, (card) => matchFlashcard(card, query), {
            signal: ac.signal,
            onProgress: setCardHits,
          });
          if (ac.signal.aborted) return;
          setCardHits(hits);
          setCardsScanning(false);
        }
      } else {
        setCardHits([]);
        setCardsScanning(false);
      }
    })();

    return () => ac.abort();
  }, [query, notesHydrated, notesOrder, cardsHydrated, cardsOrder, wantNotes, wantCards]);

  useEffect(() => {
    if (!query || !wantBody) return;

    const ac = new AbortController();
    const shards = listBodySearchShards({ subjects: filterRuntimeSubjects(contentTree.subjects) }, preferYear);
    const preferredCount = preferYear
      ? shards.filter((subjectId) => academicYearOfSubject(subjectId) === preferYear).length
      : shards.length;

    void (async () => {
      await yieldToMain();
      if (ac.signal.aborted) return;
      setBodyHits([]);
      setBodyLoading(true);
      const acc: GlobalSearchHit[] = [];
      for (let i = 0; i < shards.length; i++) {
        if (ac.signal.aborted) return;
        if (i === preferredCount) await yieldToMain(120);
        try {
          const hits = await fetchSubjectBodyHits(shards[i]!, query, ac.signal);
          if (ac.signal.aborted) return;
          acc.push(...hits);
          setBodyHits(acc.slice());
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
        await yieldToMain();
      }
      if (!ac.signal.aborted) setBodyLoading(false);
    })();

    return () => ac.abort();
  }, [query, preferYear, wantBody]);

  const bodySectionHits = useMemo(
    () => mergeBodyHits(chapterHits, bodyHits, BODY_LIMIT),
    [chapterHits, bodyHits],
  );

  return {
    noteHits: query && wantNotes ? noteHits : [],
    cardHits: query && wantCards ? cardHits : [],
    bodyHits: query && wantBody ? bodySectionHits : [],
    notesLoading: Boolean(query) && wantNotes && (!notesHydrated || notesScanning),
    cardsLoading: Boolean(query) && wantCards && (!cardsHydrated || cardsScanning),
    bodyLoading: Boolean(query) && wantBody && bodyLoading,
  };
}

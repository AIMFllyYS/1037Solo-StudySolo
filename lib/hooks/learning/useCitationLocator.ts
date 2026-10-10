"use client";

import { useEffect } from "react";
import { notePathEquals } from "@/lib/content/notePath";
import { applyCitationHighlight } from "@/lib/notes/locateSnippet";
import { useNoteLocator } from "@/lib/stores/learning/noteLocator";

export function useCitationLocator({
  containerRef,
  subjectId,
  categoryId,
  itemId,
  enabled,
  onNeedContentTab,
}: {
  containerRef: { readonly current: HTMLElement | null };
  subjectId: string;
  categoryId: string;
  itemId: string;
  enabled: boolean;
  onNeedContentTab?: () => void;
}) {
  const request = useNoteLocator((s) => s.request);
  const consume = useNoteLocator((s) => s.consume);
  const matches = !!request && notePathEquals(request.path, { subjectId, categoryId, itemId });

  useEffect(() => {
    const pending = useNoteLocator.getState().request;
    if (pending && notePathEquals(pending.path, { subjectId, categoryId, itemId }) && pending.snippet.trim()) {
      return;
    }
    containerRef.current?.scrollTo({ top: 0 });
  }, [itemId, subjectId, categoryId, containerRef]);

  useEffect(() => {
    if (!request || !matches) return;
    if (!enabled) {
      onNeedContentTab?.();
      return;
    }
    if (!request.snippet.trim()) {
      consume(request.nonce);
      return;
    }

    let cancelled = false;
    const nonce = request.nonce;
    const snippet = request.snippet;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const container = containerRef.current;
      const root =
        (container?.querySelector(".prose-notes") as HTMLElement | null) ?? container;
      if (root) applyCitationHighlight(root, snippet, container);
      consume(nonce);
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, request, matches, consume, containerRef, onNeedContentTab]);
}

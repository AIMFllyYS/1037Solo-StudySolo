"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import ManagedWindow from "@/components/window/ManagedWindow";
import YearSubjectFolderTree from "@/components/layout/navigation/YearSubjectFolderTree";
import { listFlashcardSubjectGroups } from "@/lib/notes/flashcardSubjects";
import { academicYearOfSubject } from "@/lib/constants/academic-year";
import { useAcademicYear } from "@/lib/stores/academicYear";
import { TEXTBOOK_WINDOW_ID } from "@/lib/textbook/openTextbook";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { useT } from "@/lib/i18n";
import TextbookFolderTree from "./TextbookFolderTree";
import { textbookSelectionKey, type TextbookReadingState } from "@/lib/textbook/state";
import TextbookContent from "./TextbookContent";

/** 教材正文在左，Studio 同源文件夹树常驻最右；选择器复用学期 → 学科树。 */
export default function TextbookWindow() {
  const t = useT();
  const groups = useMemo(() => listFlashcardSubjectGroups(), []);
  const academicYear = useAcademicYear((state) => state.year);
  const managedData = useWindowManager((state) => state.windows.find((window) => window.id === TEXTBOOK_WINDOW_ID)?.data) as Partial<TextbookReadingState> | undefined;
  const [fallback, setFallback] = useState<TextbookReadingState>(() => ({ yearId: academicYear, subjectId: null, selection: null, expandedKeys: [] }));
  const reading = { ...fallback, ...managedData };
  const { yearId, subjectId, selection } = reading;
  const updateReading = (patch: Partial<TextbookReadingState>) => {
    setFallback((previous) => ({ ...previous, ...patch }));
    const manager = useWindowManager.getState();
    const current = manager.windows.find((window) => window.id === TEXTBOOK_WINDOW_ID);
    // 父目录单次点击会先展开、再选择正文：第二个 patch 必须保留第一个已提交的树状态。
    if (current) manager.updateWindow(TEXTBOOK_WINDOW_ID, { data: { ...fallback, ...current.data, ...patch } });
  };
  const [choosing, setChoosing] = useState(false);
  const group = groups.find((entry) => entry.yearId === yearId);
  useOverlayRegistration({ id: "textbook-folder-picker", open: choosing, onClose: () => setChoosing(false), priority: 62 });
  const chooseSubject = (id: string | null) => {
    updateReading({ subjectId: id, yearId: id ? academicYearOfSubject(id) : yearId, selection: null, expandedKeys: id ? [`s:${id}`] : [] });
    setChoosing(false);
  };

  return (
    <ManagedWindow
      windowId={TEXTBOOK_WINDOW_ID}
      title={t("window.textbook.windowTitle")}
      icon={<BookOpen size={15} />}
      onClose={() => useWindowManager.getState().closeWindow(TEXTBOOK_WINDOW_ID)}
      fullscreenTarget="notes"
      minSize={{ minW: 360, minH: 320 }}
      overlayId="textbook"
      bodyClassName="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      unmountWhenMinimized
    >
      <div className="flex h-full min-h-0 min-w-0 flex-1" data-testid="textbook-window">
        <div className="min-h-0 min-w-0 flex-1" data-testid="textbook-body">
          <TextbookContent selection={selection} />
        </div>
        <aside className="relative flex min-h-0 w-[clamp(10rem,30%,15rem)] shrink-0 flex-col border-l border-[var(--line-soft)] bg-[var(--bg-panel)]" data-testid="textbook-tree-panel" data-no-drag>
          <div className="shrink-0 border-b border-[var(--line-soft)] px-2 py-2">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--ink)]">{group?.label ?? t("window.textbook.yearAria")}</span>
              <button type="button" aria-expanded={choosing} aria-label={t("window.textbook.choose")} onClick={() => setChoosing((value) => !value)} className="press flex shrink-0 items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-soft)]" data-testid="textbook-choose">{t("window.textbook.choose")}<ChevronDown size={12} /></button>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--ink-faint)]">{t("window.textbook.dragHint")}</p>
          </div>
          {choosing ? <div role="dialog" aria-label={t("window.textbook.yearAria")} className="absolute inset-0 z-10 flex min-h-0 flex-col bg-[var(--bg-panel)]" data-testid="textbook-selection-tree">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--line-soft)] px-2 py-2 text-[12px] font-semibold"><span>{t("window.textbook.yearAria")}</span><button type="button" onClick={() => setChoosing(false)} className="rounded px-2 py-1 text-[11px] text-[var(--ink-soft)]">{t("window.textbook.done")}</button></div>
            <YearSubjectFolderTree selectedId={subjectId} onSelect={chooseSubject} />
          </div> : null}
          <TextbookFolderTree group={group} subjectId={subjectId} selectedKey={selection ? textbookSelectionKey(selection) : null} onSelect={(next) => updateReading({ selection: next })} expandedKeys={reading.expandedKeys} onExpandedChange={(keys) => updateReading({ expandedKeys: keys })} />
        </aside>
      </div>
    </ManagedWindow>
  );
}

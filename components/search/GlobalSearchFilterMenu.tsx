"use client";

import { useState } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import AnchoredMenu from "@/components/ui/AnchoredMenu";
import { SPOTLIGHT_CLOSE_CLASS } from "@/components/search/spotlightChrome";
import { listFlashcardSubjectGroups } from "@/lib/notes/library/flashcardSubjects";
import { subjectLabel } from "@/lib/notes/userNote";

export type GlobalSearchKindFilter = "note" | "flashcard" | "body" | null;
export type GlobalSearchSubjectFilter = string | null;

const KIND_OPTIONS: { id: GlobalSearchKindFilter; label: string }[] = [
  { id: null, label: "全部种类" },
  { id: "note", label: "笔记" },
  { id: "flashcard", label: "闪卡" },
  { id: "body", label: "正文" },
];

function kindLabel(kind: GlobalSearchKindFilter) {
  return KIND_OPTIONS.find((item) => item.id === kind)?.label ?? "全部种类";
}

function FilterMenuBody({
  kind,
  subjectId,
  onKindChange,
  onSubjectChange,
  close,
}: {
  kind: GlobalSearchKindFilter;
  subjectId: GlobalSearchSubjectFilter;
  onKindChange: (kind: GlobalSearchKindFilter) => void;
  onSubjectChange: (subjectId: GlobalSearchSubjectFilter) => void;
  close: () => void;
}) {
  const [pane, setPane] = useState<"root" | "kind" | "subject">("root");
  const groups = listFlashcardSubjectGroups();

  if (pane === "kind") {
    return (
      <>
        <button type="button" role="menuitem" className="app-menu-item" onClick={() => setPane("root")}>
          <span className="app-menu-check"><ChevronLeft size={13} /></span>
          <span>返回</span>
        </button>
        <div className="app-menu-heading">按种类</div>
        {KIND_OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            role="menuitemradio"
            aria-checked={kind === option.id}
            className="app-menu-item"
            data-testid={`search-filter-kind-${option.id ?? "all"}`}
            onClick={() => {
              onKindChange(option.id);
              close();
            }}
          >
            <span className="app-menu-check">{kind === option.id && <Check size={13} />}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </>
    );
  }

  if (pane === "subject") {
    return (
      <>
        <button type="button" role="menuitem" className="app-menu-item" onClick={() => setPane("root")}>
          <span className="app-menu-check"><ChevronLeft size={13} /></span>
          <span>返回</span>
        </button>
        <div className="app-menu-heading">按课程</div>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={subjectId === null}
          className="app-menu-item"
          data-testid="search-filter-subject-all"
          onClick={() => {
            onSubjectChange(null);
            close();
          }}
        >
          <span className="app-menu-check">{subjectId === null && <Check size={13} />}</span>
          <span>全部课程</span>
        </button>
        {groups.map((group) => (
          <div key={group.yearId} role="group" aria-label={group.label}>
            <div className="app-menu-heading">{group.label}</div>
            {group.subjects.map((subject) => {
              const selected = subjectId === subject.id;
              return (
                <button
                  key={subject.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className="app-menu-item"
                  title={subject.fullName}
                  data-testid={`search-filter-subject-${subject.id}`}
                  onClick={() => {
                    onSubjectChange(subject.id);
                    close();
                  }}
                >
                  <span className="app-menu-check">{selected && <Check size={13} />}</span>
                  <span>
                    <span>{subject.name}</span>
                    {subject.name !== subject.fullName ? <small>{subject.fullName}</small> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <div className="app-menu-heading">筛选</div>
      <button
        type="button"
        role="menuitem"
        className="app-menu-item"
        data-testid="search-filter-by-kind"
        onClick={() => setPane("kind")}
      >
        <span className="app-menu-check"><ListFilter size={13} /></span>
        <span>按种类<small>{kindLabel(kind)}</small></span>
        <ChevronRight size={13} />
      </button>
      <button
        type="button"
        role="menuitem"
        className="app-menu-item"
        data-testid="search-filter-by-subject"
        onClick={() => setPane("subject")}
      >
        <span className="app-menu-check"><BookOpen size={13} /></span>
        <span>按课程<small>{subjectId ? subjectLabel(subjectId) : "全部课程"}</small></span>
        <ChevronRight size={13} />
      </button>
    </>
  );
}

export default function GlobalSearchFilterMenu({
  kind,
  subjectId,
  onKindChange,
  onSubjectChange,
}: {
  kind: GlobalSearchKindFilter;
  subjectId: GlobalSearchSubjectFilter;
  onKindChange: (kind: GlobalSearchKindFilter) => void;
  onSubjectChange: (subjectId: GlobalSearchSubjectFilter) => void;
}) {
  const active = kind !== null || subjectId !== null;
  const summary = [kind ? kindLabel(kind) : null, subjectId ? subjectLabel(subjectId) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <AnchoredMenu
      label="筛选搜索"
      role="menu"
      width={260}
      testId="global-search-filter"
      className={
        active
          ? "flex h-7 max-w-[10rem] shrink-0 items-center gap-1 rounded-lg px-1.5 text-[12px] text-[var(--md-sys-color-primary)] hover:bg-[var(--bg-muted)]"
          : SPOTLIGHT_CLOSE_CLASS
      }
      trigger={
        <>
          <ListFilter size={16} />
          {active ? <span className="truncate">{summary}</span> : null}
        </>
      }
    >
      {(close) => (
        <FilterMenuBody
          kind={kind}
          subjectId={subjectId}
          onKindChange={onKindChange}
          onSubjectChange={onSubjectChange}
          close={close}
        />
      )}
    </AnchoredMenu>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Folder, FolderOpen, Layers } from "lucide-react";
import FolderTreeRow from "./FolderTreeRow";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";
import SubjectIcon from "@/components/shared/SubjectIcon";
import { DEFAULT_ACADEMIC_YEAR, academicYearOfSubject } from "@/lib/constants/academic-year";
import { listFlashcardSubjectGroups } from "@/lib/notes/flashcardSubjects";

/** 学年 → 学科文件夹树。数据与主页书架同一份 registry；行组件复用 FolderTreeRow。 */
export default function YearSubjectFolderTree({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (subjectId: string | null) => void;
}) {
  const groups = useMemo(() => listFlashcardSubjectGroups(), []);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => {
    const yearId = selectedId ? academicYearOfSubject(selectedId) : DEFAULT_ACADEMIC_YEAR;
    return new Set([yearId]);
  });

  const toggleYear = (yearId: string) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(yearId)) next.delete(yearId);
      else next.add(yearId);
      return next;
    });
  };

  return (
    <nav className="year-subject-folder-tree" aria-label="文件夹" data-no-drag data-testid="year-subject-folder-tree">
      <div className="year-subject-folder-tree-head">目录</div>
      <div className="year-subject-folder-tree-scroll">
        <FolderTreeRow
          depth={0}
          title="全部"
          isSelected={selectedId === null}
          icon={<Layers size={14} style={{ color: "var(--md-sys-color-outline)" }} />}
          onClick={() => onSelect(null)}
          fontWeight={600}
        />
        {groups.map((group) => {
          const expanded = expandedYears.has(group.yearId);
          return (
            <div key={group.yearId}>
              <FolderTreeRow
                depth={0}
                title={group.label}
                isFolder
                isExpanded={expanded}
                icon={
                  expanded ? (
                    <FolderOpen size={15} style={{ color: "var(--md-sys-color-primary)" }} />
                  ) : (
                    <Folder size={15} style={{ color: "var(--md-sys-color-outline)" }} />
                  )
                }
                onClick={() => toggleYear(group.yearId)}
                fontWeight={600}
              />
              <AnimatedCollapse isOpen={expanded}>
                {group.subjects.map((subject) => {
                  const selected = selectedId === subject.id;
                  return (
                    <FolderTreeRow
                      key={subject.id}
                      depth={1}
                      title={subject.fullName}
                      isSelected={selected}
                      icon={<SubjectIcon subjectId={subject.id} size={15} />}
                      titleAttr={subject.fullName}
                      ariaLabel={subject.fullName}
                      onClick={() => onSelect(subject.id)}
                    />
                  );
                })}
              </AnimatedCollapse>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

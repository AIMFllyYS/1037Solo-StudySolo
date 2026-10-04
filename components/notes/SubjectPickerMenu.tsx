"use client";

import { Check } from "lucide-react";
import AnchoredMenu from "@/components/ui/AnchoredMenu";
import { listFlashcardSubjectGroups } from "@/lib/notes/flashcardSubjects";
import { subjectLabel } from "@/lib/notes/userNote";

interface SubjectPickerMenuProps {
  value: string | null;
  onChange: (subjectId: string | null) => void;
  /** 笔记可回到未归档；闪卡 subjectId 必填，不提供此项。 */
  allowUnfiled?: boolean;
  className?: string;
  disabled?: boolean;
}

/** 加号 / 思考菜单同款 AnchoredMenu：点学科标签更换这篇笔记或这张卡的科目。 */
export default function SubjectPickerMenu({
  value,
  onChange,
  allowUnfiled = false,
  className = "user-note-editor-subject",
  disabled = false,
}: SubjectPickerMenuProps) {
  const groups = listFlashcardSubjectGroups();
  return (
    <AnchoredMenu
      label="更换学科"
      role="menu"
      width={260}
      className={className}
      disabled={disabled}
      testId="subject-picker"
      triggerData={{ "data-no-drag": "" }}
      trigger={<>{subjectLabel(value)}</>}
    >
      {(close) => (
        <>
          <div className="app-menu-heading">学科</div>
          {allowUnfiled ? (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === null}
              className="app-menu-item"
              data-testid="subject-picker-option-unfiled"
              onClick={() => {
                onChange(null);
                close();
              }}
            >
              <span className="app-menu-check">{value === null && <Check size={13} />}</span>
              <span>未归档</span>
            </button>
          ) : null}
          {groups.map((group) => (
            <div key={group.yearId} role="group" aria-label={group.label}>
              <div className="app-menu-heading">{group.label}</div>
              {group.subjects.map((subject) => {
                const selected = value === subject.id;
                return (
                  <button
                    key={subject.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className="app-menu-item"
                    title={subject.fullName}
                    data-testid={`subject-picker-option-${subject.id}`}
                    onClick={() => {
                      onChange(subject.id);
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
      )}
    </AnchoredMenu>
  );
}

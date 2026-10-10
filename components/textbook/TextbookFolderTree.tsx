"use client";

import { FileText, Folder, FolderOpen } from "lucide-react";
import FolderTreeRow from "@/components/layout/navigation/FolderTreeRow";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";
import SubjectIcon from "@/components/shared/SubjectIcon";
import { navTree } from "@/lib/content-data/nav";
import { writeNotebookFileDrag } from "@/lib/chat/composerIntent";
import { toAttachedFileRef } from "@/lib/chat/fileMentions";
import type { ContentItem } from "@/lib/types/content";
import type { FlashcardSubjectGroup } from "@/lib/notes/flashcardSubjects";
import { useT } from "@/lib/i18n";
import type { TextbookSelection } from "@/lib/textbook/state";

function ItemNode({ item, ancestors, context, depth, expanded, toggle, selectedKey, onSelect }: {
  item: ContentItem;
  ancestors: ContentItem[];
  context: Omit<TextbookSelection, "item">;
  depth: number;
  expanded: Set<string>;
  toggle: (key: string) => void;
  selectedKey: string | null;
  onSelect: (selection: TextbookSelection) => void;
}) {
  const t = useT();
  const key = `${context.subjectId}/${context.categoryId}/${item.id}`;
  const folder = !!item.children?.length;
  const open = expanded.has(key);
  return <>
    <FolderTreeRow
      depth={depth}
      title={item.title}
      isFolder={folder}
      isExpanded={open}
      isSelected={selectedKey === key}
      icon={folder ? open ? <FolderOpen size={15} /> : <Folder size={15} /> : <FileText size={14} />}
      titleAttr={`${item.title} · ${t("window.textbook.dragHint")}`}
      draggable
      onDragStart={(event) => writeNotebookFileDrag(event.dataTransfer, [toAttachedFileRef(context.subjectId, context.categoryId, context.subjectName, context.categoryName, ancestors, item)])}
      onClick={() => {
        if (folder) toggle(key);
        if (!item.navigationOnly) onSelect({ ...context, item });
      }}
    />
    {folder ? <AnimatedCollapse isOpen={open}>
      {item.children!.map((child) => <ItemNode key={child.id} item={child} ancestors={[...ancestors, item]} context={context} depth={depth + 1} expanded={expanded} toggle={toggle} selectedKey={selectedKey} onSelect={onSelect} />)}
    </AnimatedCollapse> : null}
  </>;
}

/** 教材树与 Studio 共用 nav manifest、文件夹行以及引用拖拽载荷。 */
export default function TextbookFolderTree({ group, subjectId, selectedKey, onSelect, expandedKeys, onExpandedChange }: {
  group: FlashcardSubjectGroup | undefined;
  subjectId: string | null;
  selectedKey: string | null;
  onSelect: (selection: TextbookSelection) => void;
  expandedKeys: string[];
  onExpandedChange: (keys: string[]) => void;
}) {
  const t = useT();
  const expanded = new Set(expandedKeys);
  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    onExpandedChange([...next]);
  };
  const subjects = group?.subjects.filter((subject) => !subjectId || subject.id === subjectId) ?? [];
  return <nav aria-label={t("window.textbook.folderAria")} data-testid="textbook-folder-tree" className="scroll-y min-h-0 flex-1 py-1" data-no-drag>
    {subjects.length === 0 ? <p className="px-4 py-6 text-center text-[12px] text-[var(--ink-faint)]">{t("window.textbook.emptyYear")}</p> : subjects.map((subject) => {
      const navSubject = navTree.subjects.find((entry) => entry.id === subject.id);
      const key = `s:${subject.id}`;
      return <div key={subject.id}>
        <FolderTreeRow depth={0} title={subject.fullName} isFolder isExpanded={expanded.has(key)} icon={<SubjectIcon subjectId={subject.id} size={15} />} fontWeight={600} onClick={() => toggle(key)} />
        <AnimatedCollapse isOpen={expanded.has(key)}>
          {(navSubject?.categories ?? []).map((category) => {
            const categoryKey = `c:${subject.id}/${category.id}`;
            const open = expanded.has(categoryKey);
            const context = { subjectId: subject.id, subjectName: navSubject?.name ?? subject.fullName, categoryId: category.id, categoryName: category.name };
            return <div key={category.id}>
              <FolderTreeRow depth={1} title={category.name} isFolder isExpanded={open} icon={open ? <FolderOpen size={15} /> : <Folder size={15} />} onClick={() => toggle(categoryKey)} />
              <AnimatedCollapse isOpen={open}>
                {category.items.map((item) => <ItemNode key={item.id} item={item} ancestors={[]} context={context} depth={2} expanded={expanded} toggle={toggle} selectedKey={selectedKey} onSelect={onSelect} />)}
              </AnimatedCollapse>
            </div>;
          })}
        </AnimatedCollapse>
      </div>;
    })}
  </nav>;
}

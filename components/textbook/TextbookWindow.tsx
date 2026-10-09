"use client";

import { useMemo, useState } from "react";
import { BookOpen, FileText, Folder, FolderOpen } from "lucide-react";
import ManagedWindow from "@/components/window/ManagedWindow";
import FolderTreeRow from "@/components/layout/FolderTreeRow";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";
import SubjectIcon from "@/components/shared/SubjectIcon";
import { navTree } from "@/lib/content-data/nav";
import { listFlashcardSubjectGroups } from "@/lib/notes/flashcardSubjects";
import { writeNotebookFileDrag } from "@/lib/chat/composerIntent";
import { toAttachedFileRef } from "@/lib/chat/fileMentions";
import type { ContentItem } from "@/lib/types/content";
import { TEXTBOOK_WINDOW_ID } from "@/lib/textbook/openTextbook";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { useT } from "@/lib/i18n";

interface ItemCtx {
  subjectId: string;
  subjectName: string;
  categoryId: string;
  categoryName: string;
}

function ItemNode({
  item,
  ancestors,
  ctx,
  depth,
  expanded,
  toggle,
  dragHint,
}: {
  item: ContentItem;
  ancestors: ContentItem[];
  ctx: ItemCtx;
  depth: number;
  expanded: Set<string>;
  toggle: (key: string) => void;
  dragHint: string;
}) {
  const key = `i:${ctx.subjectId}/${ctx.categoryId}/${item.id}`;
  const isFolder = !!(item.children && item.children.length > 0);
  const open = expanded.has(key);
  return (
    <>
      <FolderTreeRow
        depth={depth}
        title={item.title}
        isFolder={isFolder}
        isExpanded={open}
        icon={
          isFolder
            ? open
              ? <FolderOpen size={15} style={{ color: "var(--md-sys-color-primary)" }} />
              : <Folder size={15} style={{ color: "var(--md-sys-color-outline)" }} />
            : <FileText size={14} style={{ color: "var(--md-sys-color-outline)" }} />
        }
        titleAttr={`${item.title} · ${dragHint}`}
        draggable
        onDragStart={(event) => {
          writeNotebookFileDrag(event.dataTransfer, [
            toAttachedFileRef(ctx.subjectId, ctx.categoryId, ctx.subjectName, ctx.categoryName, ancestors, item),
          ]);
        }}
        onClick={() => {
          if (isFolder) toggle(key);
          else window.open(`/${ctx.subjectId}/${ctx.categoryId}/${item.id}`, "_blank", "noopener");
        }}
      />
      {isFolder ? (
        <AnimatedCollapse isOpen={open}>
          {item.children!.map((child) => (
            <ItemNode
              key={child.id}
              item={child}
              ancestors={[...ancestors, item]}
              ctx={ctx}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              dragHint={dragHint}
            />
          ))}
        </AnimatedCollapse>
      ) : null}
    </>
  );
}

/**
 * 内部教材窗：先选学年，下面按 Studio 实际的文件夹树（学科 → 分类 → 章节…）展示。
 *
 * 独立性：只读浏览，**不注入任何上下文**，也不调用 Agent；
 * 唯一的联动是拖拽——树里每个栏目都能拖进输入框，变成对话的文件引用（复用 Studio 侧栏同一套拖拽载荷）。
 */
export default function TextbookWindow() {
  const t = useT();
  const groups = useMemo(() => listFlashcardSubjectGroups(), []);
  const [yearId, setYearId] = useState(() => groups[0]?.yearId ?? "");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const group = groups.find((entry) => entry.yearId === yearId) ?? groups[0];
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <ManagedWindow
      windowId={TEXTBOOK_WINDOW_ID}
      title={t("window.textbook.windowTitle")}
      icon={<BookOpen size={15} />}
      onClose={() => useWindowManager.getState().closeWindow(TEXTBOOK_WINDOW_ID)}
      fullscreenTarget="notes"
      minSize={{ minW: 360, minH: 320 }}
      overlayId="textbook"
      bodyClassName="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      unmountWhenMinimized
    >
      <div className="shrink-0 border-b border-[var(--line-soft)] px-3 py-2" data-testid="textbook-window">
        <p className="mb-2 text-[11.5px] leading-relaxed text-[var(--ink-faint)]">{t("window.textbook.intro")}</p>
        <div role="radiogroup" aria-label={t("window.textbook.yearAria")} className="hide-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
          {groups.map((entry) => (
            <button
              key={entry.yearId}
              type="button"
              role="radio"
              aria-checked={entry.yearId === group?.yearId}
              data-testid={`textbook-year-${entry.yearId}`}
              onClick={() => setYearId(entry.yearId)}
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-[12px] ${
                entry.yearId === group?.yearId
                  ? "border-[var(--accent)] bg-[var(--accent-weak)] font-medium text-[var(--accent-ink)]"
                  : "border-[var(--line-soft)] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll-y min-h-0 flex-1 py-1" data-no-drag>
        {!group || group.subjects.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-[var(--ink-faint)]">{t("window.textbook.emptyYear")}</p>
        ) : (
          group.subjects.map((subject) => {
            const navSubject = navTree.subjects.find((entry) => entry.id === subject.id);
            const subjectKey = `s:${subject.id}`;
            const subjectOpen = expanded.has(subjectKey);
            return (
              <div key={subject.id}>
                <FolderTreeRow
                  depth={0}
                  title={subject.fullName}
                  isFolder
                  isExpanded={subjectOpen}
                  icon={<SubjectIcon subjectId={subject.id} size={15} />}
                  fontWeight={600}
                  onClick={() => toggle(subjectKey)}
                />
                <AnimatedCollapse isOpen={subjectOpen}>
                  {(navSubject?.categories ?? []).map((category) => {
                    const categoryKey = `c:${subject.id}/${category.id}`;
                    const categoryOpen = expanded.has(categoryKey);
                    const ctx: ItemCtx = {
                      subjectId: subject.id,
                      subjectName: navSubject?.name ?? subject.fullName,
                      categoryId: category.id,
                      categoryName: category.name,
                    };
                    return (
                      <div key={category.id}>
                        <FolderTreeRow
                          depth={1}
                          title={category.name}
                          isFolder
                          isExpanded={categoryOpen}
                          icon={
                            categoryOpen
                              ? <FolderOpen size={15} style={{ color: "var(--md-sys-color-primary)" }} />
                              : <Folder size={15} style={{ color: "var(--md-sys-color-outline)" }} />
                          }
                          onClick={() => toggle(categoryKey)}
                        />
                        <AnimatedCollapse isOpen={categoryOpen}>
                          {category.items.map((item) => (
                            <ItemNode
                              key={item.id}
                              item={item}
                              ancestors={[]}
                              ctx={ctx}
                              depth={2}
                              expanded={expanded}
                              toggle={toggle}
                              dragHint={t("window.textbook.dragHint")}
                            />
                          ))}
                        </AnimatedCollapse>
                      </div>
                    );
                  })}
                </AnimatedCollapse>
              </div>
            );
          })
        )}
      </div>
    </ManagedWindow>
  );
}

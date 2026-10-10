"use client";

import { memo } from "react";
import FileTreeItem from "./FileTreeItem";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";
import { useStore } from "@/lib/store";
import type { ContentItem } from "@/lib/types/content";

interface FileTreeProps {
  items: ContentItem[];
  depth?: number;
  /** 当前子树所属科目，用于构造命名空间化的选中/展开键，避免跨学科 id 碰撞 */
  subjectId: string;
  /** 当前子树所属分类 */
  categoryId: string;
  selectedId: string | null;
  onItemSelect: (subjectId: string, categoryId: string, item: ContentItem) => void;
}

function FileTree({
  items,
  depth = 0,
  subjectId,
  categoryId,
  selectedId,
  onItemSelect,
}: FileTreeProps) {
  const expandedIds = useStore((s) => s.expandedIds);
  const toggleExpand = useStore((s) => s.toggleExpand);

  if (!items || items.length === 0) return null;

  return (
    <div>
      {items.map((item) => {
        // 命名空间键：`${subjectId}/${categoryId}/${item.id}`。
        // 不同学科复用相同的 item.id（ch01 / 1.1 等），裸 id 会导致跨学科
        // 选中高亮与展开状态相互串扰，必须加上学科+分类前缀。
        const nsKey = `${subjectId}/${categoryId}/${item.id}`;
        const isExpanded = expandedIds.has(nsKey);
        const isSelected = selectedId === nsKey;
        const hasChildren = item.children && item.children.length > 0;

        return (
          <div key={item.id}>
            <FileTreeItem
              item={item}
              depth={depth}
              nsKey={nsKey}
              subjectId={subjectId}
              categoryId={categoryId}
              isExpanded={isExpanded}
              isSelected={isSelected}
              onToggle={toggleExpand}
              onSelect={onItemSelect}
            />
            <AnimatedCollapse isOpen={!!(isExpanded && hasChildren)}>
              <FileTree
                items={item.children!}
                depth={depth + 1}
                subjectId={subjectId}
                categoryId={categoryId}
                selectedId={selectedId}
                onItemSelect={onItemSelect}
              />
            </AnimatedCollapse>
          </div>
        );
      })}
    </div>
  );
}

export default memo(FileTree);

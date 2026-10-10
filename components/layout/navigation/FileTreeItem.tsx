"use client";

import { memo, useCallback, useRef, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Folder, FolderOpen, FileText } from "lucide-react";
import type { ContentItem } from "@/lib/types/content";
import FolderTreeRow from "./FolderTreeRow";
import { writeNotebookFileDrag } from "@/lib/chat/composerIntent";
import { fileRefFromNav } from "@/lib/chat/fileMentions";

interface FileTreeItemProps {
  item: ContentItem;
  depth: number;
  /** 命名空间化的展开/选中键 */
  nsKey: string;
  subjectId: string;
  categoryId: string;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: (nsKey: string) => void;
  onSelect: (subjectId: string, categoryId: string, item: ContentItem) => void;
}

// hover 停留 120ms 才触发 prefetch，避免鼠标滑过整列时对每一项都创建 RSC 请求。
// 概率论 kaoqian-moni（24 项）/ shizhan-yanlian（11 项）单卷体积大，滥 prefetch 反而挤压主线程。
const PREFETCH_HOVER_DELAY_MS = 120;

// 会话级去重：一次访问同一路由只 prefetch 一次，防止反复 hover 时重复触发。
const prefetchedPaths = new Set<string>();

function FileTreeItem({
  item,
  depth,
  nsKey,
  subjectId,
  categoryId,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
}: FileTreeItemProps) {
  const router = useRouter();
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 仅当存在 children 时才视为文件夹；叶子小节（如 1.1）应触发跳转而非展开
  const isFolder = !!(item.children && item.children.length > 0);
  // 叶子项对应的实际路由（与 handleItemSelect 里的 router.push 保持一致）
  const leafPath = isFolder ? null : `/${subjectId}/${categoryId}/${item.id}`;

  const schedulePrefetch = useCallback(() => {
    if (!leafPath || isSelected) return;
    if (prefetchedPaths.has(leafPath)) return;
    if (prefetchTimerRef.current) return;
    prefetchTimerRef.current = setTimeout(() => {
      prefetchTimerRef.current = null;
      // Next 16：router.prefetch 会对目标 route 拉取 RSC payload 并放入客户端缓存，
      // 用户点击时无需再等服务端渲染 → 概率论大试卷 (real-XX 40KB) 切换从"卡顿"变"瞬开"。
      try {
        router.prefetch(leafPath);
        prefetchedPaths.add(leafPath);
      } catch {
        // Next 版本差异或路由未预备好时静默失败——绝不阻塞交互
      }
    }, PREFETCH_HOVER_DELAY_MS);
  }, [leafPath, isSelected, router]);

  const cancelPrefetch = useCallback(() => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }, []);

  const handleDragStart = useCallback((event: DragEvent<HTMLButtonElement>) => {
    writeNotebookFileDrag(event.dataTransfer, [fileRefFromNav(subjectId, categoryId, item)]);
  }, [subjectId, categoryId, item]);

  const icon = isFolder ? (
    isExpanded ? (
      <FolderOpen size={15} style={{ color: "var(--md-sys-color-primary)" }} />
    ) : (
      <Folder size={15} style={{ color: "var(--md-sys-color-outline)" }} />
    )
  ) : (
    <FileText size={14} style={{ color: "var(--md-sys-color-outline)" }} />
  );

  return (
    <FolderTreeRow
      depth={depth}
      title={item.title}
      isFolder={isFolder}
      isExpanded={isExpanded}
      isSelected={isSelected}
      icon={icon}
      onClick={isFolder ? () => onToggle(nsKey) : () => onSelect(subjectId, categoryId, item)}
      onMouseEnter={schedulePrefetch}
      onMouseLeave={cancelPrefetch}
      onFocus={schedulePrefetch}
      onBlur={cancelPrefetch}
      titleAttr={`${item.title} · 长按拖到输入框可引用`}
      draggable
      onDragStart={handleDragStart}
    />
  );
}

// memo + 稳定回调：仅当某行自身的 props（isExpanded/isSelected 等）变化时才重渲染，
// 避免一次展开/选中导致整棵树所有行重渲染。
export default memo(FileTreeItem);

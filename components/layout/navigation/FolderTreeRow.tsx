"use client";

import type { DragEvent, FocusEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** 主页左侧文件树行（与 FileTreeItem / SubjectSidebar 同款：28px、chevron、图标）。 */
export default function FolderTreeRow({
  depth,
  title,
  isFolder = false,
  isExpanded = false,
  isSelected = false,
  icon,
  endAdornment,
  ariaDescribedBy,
  fadeTitle = false,
  inset = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  titleAttr,
  ariaLabel,
  fontWeight,
  textOnlyIndent,
  draggable,
  onDragStart,
  onDragEnd,
  onPointerDown,
  onPointerUp,
}: {
  depth: number;
  title: string;
  isFolder?: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
  icon: ReactNode;
  onClick: () => void;
  onMouseEnter?: (event: MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLButtonElement>) => void;
  onFocus?: (event: FocusEvent<HTMLButtonElement>) => void;
  onBlur?: (event: FocusEvent<HTMLButtonElement>) => void;
  titleAttr?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  /** Fade the title at its right edge without adding an ellipsis. */
  fadeTitle?: boolean;
  /**
   * 嵌入式行（Agent 左栏）：圆角 + 右侧留白 + 状态位与标题拉开间距。
   * 文件树（Studio）不传，保持贴边的通栏行。
   */
  inset?: boolean;
  /** Optional row-end status/action, kept in the same line as the title. */
  endAdornment?: ReactNode;
  fontWeight?: number;
  /** 仅文字模式：不渲染箭头位和图标，标题左缘直接落在这个像素位置（用于文件夹下的对话行）。 */
  textOnlyIndent?: number;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLButtonElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      data-no-drag
      title={titleAttr ?? title}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-current={isSelected ? "true" : undefined}
      aria-expanded={isFolder ? isExpanded : undefined}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      className={inset ? "flex w-full items-center gap-1.5 border-0 bg-transparent text-left outline-none" : "flex w-full items-center gap-1 border-0 bg-transparent text-left outline-none"}
      style={{
        paddingLeft: textOnlyIndent ?? (inset ? depth * 12 + 6 : depth * 16 + 4),
        paddingRight: inset ? 8 : undefined,
        borderRadius: inset ? 8 : undefined,
        height: inset ? 30 : 28,
        lineHeight: inset ? "30px" : "28px",
        fontSize: 13,
        fontWeight,
        background: isSelected
          ? "var(--md-sys-color-primary-container)"
          : undefined,
        color: isSelected
          ? "var(--md-sys-color-on-primary-container)"
          : "var(--md-sys-color-on-surface-variant)",
      }}
      onMouseEnter={(event) => {
        if (!isSelected) {
          event.currentTarget.style.background =
            "var(--md-sys-color-surface-container-high)";
        }
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = isSelected
          ? "var(--md-sys-color-primary-container)"
          : "";
        onMouseLeave?.(event);
      }}
    >
      {textOnlyIndent === undefined && (
        <span
          className="inline-flex shrink-0 items-center justify-center"
          style={{
            width: 16,
            height: 16,
            transition: "transform 0.35s cubic-bezier(0.05,0.7,0.1,1.0)",
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            opacity: isFolder ? 1 : 0,
          }}
        >
          <ChevronRight size={14} />
        </span>
      )}
      {textOnlyIndent === undefined && (
        <span className="inline-flex shrink-0 items-center justify-center" style={{ width: 18, height: 18 }}>
          {icon}
        </span>
      )}
      <span className={fadeTitle || endAdornment ? "agent-session-title-fade" : "truncate"} style={{ fontSize: 13 }}>
        {title}
      </span>
      {endAdornment}
    </button>
  );
}

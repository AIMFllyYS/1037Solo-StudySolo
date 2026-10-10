"use client";

import { Fragment, useState, type ReactNode, type Ref } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useIsAgentSurface } from "@/lib/window/useManagedWindowSurface";
import { useT } from "@/lib/i18n/index";

/**
 * 目录分组标题。**文案一律由调用方给**（i18n 在调用方做），
 * 这里只负责"连续同组项前面出一条标题"的排版。
 */
export interface DocumentOutlineGroup {
  id: string;
  label: string;
  /** 副文，如检索轮次的 query。 */
  meta?: string;
}

export interface DocumentOutlineItem {
  id: string;
  title: string;
  meta?: string;
  kindLabel?: string;
  /** 目录副文（如网页 URL）允许换行，避免长链接被截成省略号。 */
  metaWrap?: boolean;
  /**
   * 可选分组。**连续**且 group.id 相同的项共用一条分组标题；
   * 不传 group 的调用方渲染结果与旧版一字不差。
   */
  group?: DocumentOutlineGroup;
}

function OutlineNav({
  outline,
  activeId,
  onSelect,
  outlineLabel,
  emptyLabel,
}: {
  outline: DocumentOutlineItem[];
  activeId: string;
  onSelect: (id: string) => void;
  outlineLabel: string;
  emptyLabel?: string;
}) {
  const t = useT();
  return (
    <nav className="note-citation-outline" aria-label={outlineLabel}>
      {outline.length === 0 ? (
        <p className="note-citation-status">{emptyLabel ?? t("panel.reader.emptyOutline")}</p>
      ) : (
        outline.map((item, index) => {
          const selected = item.id === activeId;
          // 只在「这一组的开头」出一条标题：连续同组项共用一条，组变了（或又绕回来）才再出一条。
          const group = item.group && outline[index - 1]?.group?.id !== item.group.id ? item.group : null;
          return (
            <Fragment key={`${item.id}::${index}`}>
              {group ? (
                <div className="flex min-w-0 shrink-0 flex-col gap-0.5 px-2.5 pb-1 pt-3" data-outline-group={group.id}>
                  {/* 不用 .note-citation-nav-title：那是目录项的 11.5px 样式，分组标题要更大更重。 */}
                  <span className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--ink)]">
                    {group.label}
                  </span>
                  {group.meta ? (
                    <span className="note-citation-nav-path" title={group.meta}>
                      {group.meta}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                data-no-drag
                className={clsx("note-citation-nav-item", selected && "is-active")}
                onClick={() => onSelect(item.id)}
              >
                {item.kindLabel ? (
                  <span className="note-citation-nav-path">{item.kindLabel}</span>
                ) : null}
                <span className="note-citation-nav-title">{item.title}</span>
                {item.meta ? (
                  <span className={clsx("note-citation-nav-path", item.metaWrap && "is-wrap")}>{item.meta}</span>
                ) : null}
              </button>
            </Fragment>
          );
        })
      )}
    </nav>
  );
}

function Stage({
  toolbar,
  children,
  navToggle,
  bodyRef,
}: {
  toolbar?: ReactNode;
  children: ReactNode;
  /** Agent 里的列表收起/展开把手：贴在目录列那一侧的正文边缘上。 */
  navToggle?: ReactNode;
  /** 阅读器（PDF/PPTX）要拿这个滚动容器做滚动定位与宽度测量。 */
  bodyRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div className="document-workspace-stage">
      {toolbar ? <div className="document-workspace-toolbar">{toolbar}</div> : null}
      <div className="document-workspace-body" ref={bodyRef}>{children}</div>
      {navToggle}
    </div>
  );
}

function FolderTreeResizeHandle() {
  return (
    <PanelResizeHandle
      data-no-drag
      data-testid="folder-tree-resize-handle"
      className="document-workspace-resize-handle is-vertical group relative outline-none"
    >
      <span className="absolute -bottom-1 -top-1 inset-x-0 z-10 cursor-row-resize" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-data-[resize-handle-state=drag]:opacity-100">
        <span className="block h-1 w-7 rounded-full bg-[var(--md-sys-color-primary)]/50" />
      </span>
    </PanelResizeHandle>
  );
}

function LeftPane({
  nav,
  folderTree,
  layoutKey,
}: {
  nav: ReactNode;
  folderTree?: ReactNode;
  /** 每个工作区各自的持久化键：不带它就等于让所有窗口共用一条分栏宽度。 */
  layoutKey: string;
}) {
  if (!folderTree) {
    return <div className="note-citation-sidebar">{nav}</div>;
  }

  return (
    <div className="note-citation-sidebar has-folder-tree">
      <PanelGroup
        direction="vertical"
        autoSaveId={`document-workspace-folder-tree:${layoutKey}`}
        className="h-full min-h-0"
      >
        <Panel defaultSize={75} minSize={28} className="min-h-0">
          <div className="note-citation-outline-pane">{nav}</div>
        </Panel>
        <FolderTreeResizeHandle />
        <Panel defaultSize={25} minSize={14} maxSize={55} className="min-h-0">
          <div className="note-citation-folder-pane">{folderTree}</div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

export default function DocumentWorkspace({
  outline,
  activeId,
  onSelect,
  toolbar,
  children,
  outlineLabel,
  emptyLabel,
  layoutKey = "default",
  folderTree,
  bodyRef,
}: {
  outline: DocumentOutlineItem[];
  activeId: string;
  onSelect: (id: string) => void;
  toolbar?: ReactNode;
  children: ReactNode;
  /** 目录标题。不传就用词典里的「目录」；阅读器会传自己的（如「幻灯片」）。 */
  outlineLabel?: string;
  /** 目录为空时的说明。缺省「没有目录」。 */
  emptyLabel?: string;
  /**
   * 分栏宽度的持久化键（同一外壳下每类工作区一个）。
   * 不传就全部共用 "default" —— 拖一次目录，所有窗口的目录宽度都会跟着变。
   */
  layoutKey?: string;
  /** 左侧列表下方的文件夹树（学年 → 学科），默认约 1/4 高，可上下拖。 */
  folderTree?: ReactNode;
  /** 正文滚动容器。连续滚动的阅读器靠它做滚动定位、当前页推导与宽度测量。 */
  bodyRef?: Ref<HTMLDivElement>;
}) {
  const t = useT();
  // 目录标题缺省「目录」：文案在词典里，调用方传进来的优先级更高。
  const navLabel = outlineLabel ?? t("panel.reader.outline");
  // Agent 右栏窄：目录列改挂右侧，并且可以整个收起来，把宽度让给正文。
  const agentSurface = useIsAgentSurface();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const showNav = !(agentSurface && navCollapsed);
  const navSide = agentSurface ? "right" : "left";

  const nav = (
    <OutlineNav
      outline={outline}
      activeId={activeId}
      onSelect={onSelect}
      outlineLabel={navLabel}
      emptyLabel={emptyLabel}
    />
  );
  const left = <LeftPane nav={nav} folderTree={folderTree} layoutKey={layoutKey} />;
  const navToggle = agentSurface ? (
    <button
      type="button"
      data-no-drag
      data-testid="document-workspace-nav-toggle"
      aria-label={t(showNav ? "panel.reader.collapseOutline" : "panel.reader.expandOutline", { label: navLabel })}
      title={t(showNav ? "panel.reader.collapseOutline" : "panel.reader.expandOutline", { label: navLabel })}
      aria-expanded={showNav}
      onClick={() => setNavCollapsed((value) => !value)}
      className="document-workspace-nav-toggle"
    >
      {showNav ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
    </button>
  ) : null;
  const stage = (
    <Stage toolbar={toolbar} navToggle={navToggle} bodyRef={bodyRef}>
      {children}
    </Stage>
  );

  // 目录列一律可拖拽：几乎所有工作区（PDF/PPTX/笔记库/闪卡/来源/长文本）都靠它导航，
  // 固定 13.5rem 在窄窗口里要么太宽要么太窄，交给用户自己拉。
  //
  // 分栏顺序按「视觉顺序」直接铺开，**不要用 Panel 的 order 属性**：
  // PanelResizeHandle 没有 order（等于 0），而 Agent 下 stage/nav 是 2/3，
  // 于是分隔条会被排到最前面 —— 目录明明挂在右边，拖拽线却画在整块正文的最左边，
  // 用户抓住的是工作区外沿（实测抓到右栏自身的分栏边界），目录根本调不动。
  const navPanel = (
    <Panel id="document-workspace-nav" defaultSize={agentSurface ? 26 : 24} minSize={12} maxSize={60} className="min-h-0 min-w-0">
      <div className="flex h-full min-h-0 min-w-0 flex-col">{left}</div>
    </Panel>
  );
  // Agent 下 stage 曾经是 defaultSize=100，与 nav 的 26 相加超过 100，
  // react-resizable-panels 归一化后目录只剩 ~20%，窄得没法用。两边都给成能相加的和。
  const stagePanel = (
    <Panel id="document-workspace-stage" defaultSize={agentSurface ? 74 : 76} minSize={30} className="min-h-0 min-w-0">
      <div className="flex h-full min-h-0 min-w-0 flex-col">{stage}</div>
    </Panel>
  );
  const splitter = (
    <PanelResizeHandle
      data-no-drag
      data-testid="document-workspace-resize-handle"
      className="document-workspace-resize-handle group relative outline-none"
    >
      <span className="absolute inset-y-0 -left-1 -right-1 z-10 cursor-col-resize" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-data-[resize-handle-state=drag]:opacity-100">
        <span className="block h-7 w-1 rounded-full bg-[var(--md-sys-color-primary)]/50" />
      </span>
    </PanelResizeHandle>
  );

  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId={`document-workspace:${agentSurface ? "agent" : "studio"}:${layoutKey}`}
      className={clsx("note-citation-layout document-workspace is-resizable", agentSurface && "is-agent")}
      data-nav-side={navSide}
    >
      {agentSurface ? (
        <>
          {stagePanel}
          {showNav && splitter}
          {showNav && navPanel}
        </>
      ) : (
        <>
          {navPanel}
          {splitter}
          {stagePanel}
        </>
      )}
    </PanelGroup>
  );
}

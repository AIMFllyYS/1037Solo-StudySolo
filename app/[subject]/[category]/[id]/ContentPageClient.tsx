"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { FileText, ClipboardCheck, Lightbulb, PanelTopClose, PanelTopOpen, Maximize, Minimize, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import SelectionPopover from "@/components/notes/SelectionPopover";
import PlainTextReader from "@/components/notes/PlainTextReader";
import { NoteSkeleton } from "@/components/notes/NoteSkeleton";
import type { LayoutProfile, SubjectId, RenderType } from "@/lib/types/content";
import type { LectureMaterialRole } from "@/lib/content/lectures/roles";
import type { LayoutFlags } from "@/lib/content/layoutProfile";
import type { ExampleDetail } from "@/lib/content/loader";
import { useStore } from "@/lib/store";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { tabPanelVariants } from "@/lib/motion";
import { ComponentRenderer } from "@/lib/content/componentRegistry";
import { useToc } from "@/lib/hooks/useToc";
import { useCitationLocator } from "@/lib/hooks/useCitationLocator";
import WindowTaskbar from "@/components/window/WindowTaskbar";
import GlobalSearchButton from "@/components/search/GlobalSearchButton";
import { useCenterTabsHosted } from "@/components/layout/center/centerTabsHost";
import { useContentTabs } from "@/lib/stores/contentTabs";

const QuizTab = dynamic(() => import("@/components/quiz/QuizTab"), { ssr: false });
const ExampleTab = dynamic(() => import("@/components/examples/ExampleTab"), { ssr: false });
const DeferredNoteRenderer = dynamic(() => import("@/components/notes/NoteRenderer"), { ssr: false, loading: () => <NoteSkeleton /> });

type ContentTab = "content" | "examples" | "quiz";

const CONTENT_TABS: { id: ContentTab; label: string; icon: React.ReactNode }[] = [
  { id: "content", label: "正文", icon: <FileText size={14} /> },
  { id: "examples", label: "例题", icon: <Lightbulb size={14} /> },
  { id: "quiz", label: "题目测试", icon: <ClipboardCheck size={14} /> },
];

interface ContentPageClientProps {
  subjectId: SubjectId;
  categoryId: string;
  itemId: string;
  /** HTML/text 原文；Markdown 已由服务端渲染，不再重复下传。 */
  initialContent: string | null;
  hasInitialContent?: boolean;
  contentRevision?: string;
  /** Large Markdown travels as a validated contentRef rather than a full RSC tree. */
  deferredMarkdown?: boolean;
  contentBytes?: number;
  /** 服务端/构建期预渲染好的正文 React 树（仅 markdown 类型非空）；客户端不再解析 markdown */
  renderedNote?: React.ReactNode;
  /** 服务端 SSR 注入的例题（含正文，随路由变化重新下发） */
  initialExamples: ExampleDetail[];
  /** 例题所属小节 id（detail 分类为 itemId，否则为 ""） */
  sectionId: string;
  exampleChapterId: string;
  itemTitle: string;
  itemSummary: string;
  subjectName: string;
  categoryName: string;
  itemStatus: string;
  renderType?: RenderType;
  /** 课堂材料角色（recording/minutes/notes/cards），用于区分静态笔记沙箱等。 */
  materialRole?: LectureMaterialRole;
  layoutProfile: LayoutProfile;
  layoutFlags: LayoutFlags;
}

function EmptyNote({ itemId, title }: { itemId: string; title: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg-elevated)] p-8 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--accent-weak)]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
      </div>
      <h3 className="text-[16px] font-semibold">本内容正在系统性撰写中</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-relaxed text-[var(--ink-soft)]">
        「{itemId} {title}」的详尽原创讲解将由 AI 按 SOP 逐节生成。
      </p>
    </div>
  );
}

export default function ContentPageClient({
  subjectId,
  categoryId,
  itemId,
  initialContent,
  hasInitialContent,
  contentRevision,
  deferredMarkdown = false,
  contentBytes = 0,
  renderedNote,
  initialExamples,
  sectionId,
  exampleChapterId,
  itemTitle,
  itemSummary,
  subjectName,
  categoryName,
  renderType = 'markdown',
  materialRole,
  layoutProfile,
  layoutFlags: flags,
}: ContentPageClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 桌面三栏里 Tab 栏由中间工作区统一绘制（与视频/可交互/浏览器同一条），状态走共享 store；
  // 没有工作区外壳（移动端）时内容页自己画栏、自己持有状态。
  const hosted = useCenterTabsHosted();
  const [localTab, setLocalTab] = useState<ContentTab>("content");
  const hostedTab = useContentTabs((s) => s.active);
  const setHostedTab = useContentTabs((s) => s.setActive);
  const setHostedTabs = useContentTabs((s) => s.setTabs);
  const activeTab: ContentTab = hosted ? hostedTab : localTab;
  const setActiveTab = hosted ? setHostedTab : setLocalTab;
  const topBarCollapsed = useStore((s) => s.topBarCollapsed);
  const toggleTopBar = useStore((s) => s.toggleTopBar);
  const isMobile = useIsMobile();
  const [htmlFullscreenItem, setHtmlFullscreenItem] = useState<string | null>(null);
  const isHtmlFullscreen = htmlFullscreenItem === itemId;
  // 课堂静态笔记（notes.html）默认禁脚本 / 禁同源，仅放行新窗口打开外链；
  // 历史 HTML 工具页保持原沙箱以避免回归。
  const htmlSandbox = materialRole === "notes" ? "allow-popups" : "allow-scripts allow-same-origin";

  // content 恒有；examples 仅 markdown（例题是 Markdown）；quiz 与渲染格式解耦——
  // 课堂四材料（text/markdown/html）共享同一套题，只要档位 flags 允许就显示题目 tab。
  const visibleTabs = useMemo(
    () =>
      CONTENT_TABS.filter((t) => {
        if (t.id === "content") return true;
        if (t.id === "examples") return renderType === "markdown" && flags.showExamplesTab;
        if (t.id === "quiz") return flags.showQuizTab;
        return false;
      }),
    [renderType, flags.showExamplesTab, flags.showQuizTab],
  );
  const showTabBar = visibleTabs.length > 1;
  const resolvedTab: ContentTab = visibleTabs.some((t) => t.id === activeTab) ? activeTab : "content";

  // 交给中间工作区的那条栏渲染；进入新内容页回到「正文」，离开时清空。
  useEffect(() => {
    if (!hosted) return;
    setHostedTabs(visibleTabs.map(({ id, label }) => ({ id, label })));
  }, [hosted, visibleTabs, setHostedTabs]);
  useEffect(() => {
    if (!hosted) return;
    setHostedTab("content");
    return () => setHostedTabs([]);
  }, [hosted, itemId, setHostedTab, setHostedTabs]);

  // 切换方向（决定面板从左还是右滑入）：渲染期按 index 变化派生，不依赖是谁点的按钮。
  const tabIndex = visibleTabs.findIndex((t) => t.id === resolvedTab);
  const [tabMotion, setTabMotion] = useState<{ index: number; dir: 1 | -1 }>({ index: tabIndex, dir: 1 });
  if (tabMotion.index !== tabIndex) setTabMotion({ index: tabIndex, dir: tabIndex >= tabMotion.index ? 1 : -1 });
  const tabDirection = tabMotion.dir;

  // 正文由服务端 SSR 注入。客户端切换路由时 page.tsx 会重新做
  // 服务端渲染并以新 prop 下发，无需再 fetch /api/section，消除瀑布与骨架闪烁。
  const content = initialContent;
  const hasContent = hasInitialContent ?? Boolean(initialContent);
  const pageKey = `${subjectId}/${categoryId}/${itemId}:${contentRevision ?? ""}`;
  const [deferredLoad, setDeferredLoad] = useState<{ key: string; status: "idle" | "loading" | "loaded" | "error"; markdown: string }>({ key: "", status: "idle", markdown: "" });
  const activeDeferred = deferredLoad.key === pageKey ? deferredLoad : { key: pageKey, status: "idle" as const, markdown: "" };
  const deferredAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { deferredAbort.current?.abort(); }, [pageKey]);
  const loadDeferred = useCallback(async () => {
    if (!deferredMarkdown) return;
    deferredAbort.current?.abort();
    const controller = new AbortController();
    deferredAbort.current = controller;
    setDeferredLoad({ key: pageKey, status: "loading", markdown: "" });
    try {
      const params = new URLSearchParams({ subjectId, categoryId, itemId });
      const response = await fetch(`/api/section?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`section_${response.status}`);
      const value = await response.json() as { content?: unknown; format?: unknown };
      if (typeof value.content !== "string" || value.format !== "markdown") throw new Error("section_format_mismatch");
      if (!controller.signal.aborted) setDeferredLoad({ key: pageKey, status: "loaded", markdown: value.content });
    } catch {
      if (!controller.signal.aborted) setDeferredLoad({ key: pageKey, status: "error", markdown: "" });
    }
  }, [deferredMarkdown, pageKey, subjectId, categoryId, itemId]);

  // 路由→store 的同步已上移到 AppShell（覆盖所有分类），此处不再处理。

  // TOC 提取：仅在正文 Tab 且档位允许目录时扫描 DOM 标题
  useToc(
    containerRef,
    resolvedTab === "content" && flags.showToc && (!deferredMarkdown || activeDeferred.status === "loaded"),
    itemId,
    `${contentRevision ?? initialContent ?? ""}:${activeDeferred.status}`,
  );

  const switchToContentTab = useCallback(() => setActiveTab("content"), [setActiveTab]);
  useCitationLocator({
    containerRef,
    subjectId,
    categoryId,
    itemId,
    enabled: resolvedTab === "content" && flags.showToc,
    onNeedContentTab: switchToContentTab,
  });

  // HTML 全屏时锁定 body 滚动，退出时恢复。
  useEffect(() => {
    if (isHtmlFullscreen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isHtmlFullscreen]);

  const handleOpenInNewTab = useCallback(() => {
    if (!content) return;
    const blob = new Blob([content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    // 延迟回收，避免新标签页尚未加载就被 revoke
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [content]);

  return (
    <div className="relative flex h-full flex-col bg-[var(--bg-app)]" data-layout-profile={layoutProfile}>
      {/* Content tab bar：桌面三栏由中间工作区统一绘制（hosted），这里只在没有工作区外壳时自己画。 */}
      {!hosted && (
      <div className="flex shrink-0 items-center border-b border-[var(--line)] bg-[var(--bg-app)]">
        {showTabBar && visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={clsx(
              "relative flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium transition-colors",
              resolvedTab === t.id
                ? "text-[var(--md-sys-color-primary)]"
                : "text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]",
            )}
          >
            {t.icon}
            {t.label}
            {resolvedTab === t.id && (
              <motion.div
                layoutId="content-tab-indicator"
                className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--md-sys-color-primary)]"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        ))}

        {!isMobile && topBarCollapsed && (
          <div className="ml-auto mr-1 flex min-w-0 flex-1 items-center justify-end gap-1 border-r border-[var(--line)] pr-2">
            <GlobalSearchButton />
            <WindowTaskbar host="content-tab" />
          </div>
        )}

        {!isMobile && (
          <button
            onClick={toggleTopBar}
            title={topBarCollapsed ? "展开顶部导航栏" : "收起顶部导航栏"}
            aria-pressed={topBarCollapsed}
            className={clsx(
              "mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]",
              !topBarCollapsed && "ml-auto",
            )}
          >
            {topBarCollapsed ? <PanelTopOpen size={18} /> : <PanelTopClose size={18} />}
          </button>
        )}

      </div>
      )}

      {/* Content area */}
      <div ref={containerRef} data-notes-root className="scroll-y flex-1">
        <AnimatePresence mode="wait">
          {resolvedTab === "content" && (
            <motion.div
              key="content"
              variants={tabPanelVariants(tabDirection)}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full"
            >
              <article className={clsx("mx-auto w-full px-4 py-6 sm:px-8 sm:py-10", flags.articleMaxWidth === "wide" ? "max-w-4xl" : "max-w-3xl")}>
                <div className="mb-5 sm:mb-7">
                  <div className="text-[12px] sm:text-[13px] font-semibold text-[var(--accent)]">
                    {subjectName} · {categoryName}
                  </div>
                  <h1 className="mt-1 sm:mt-1.5 text-[22px] sm:text-[28px] font-bold tracking-tight text-[var(--ink)]">
                    <span className="mr-1.5 sm:mr-2 font-mono text-[var(--ink-faint)]">
                      {itemId}
                    </span>
                    {itemTitle}
                  </h1>
                  {itemSummary && (
                    <p className="mt-2 sm:mt-2.5 text-[14px] sm:text-[15px] leading-relaxed text-[var(--ink-soft)]">
                      {itemSummary}
                    </p>
                  )}
                </div>

                {hasContent ? (
                  renderType === 'html' ? (
                    <div key={itemId} className="animate-fade-in relative h-full">
                      {/* HTML 工具组件操作栏：全屏 + 新页面展开，仅作用于 iframe */}
                      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg bg-black/30 px-1 py-0.5 backdrop-blur-sm">
                        <button
                          onClick={handleOpenInNewTab}
                          title="新页面展开"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/20"
                        >
                          <ExternalLink size={14} />
                        </button>
                        <button
                          onClick={() => setHtmlFullscreenItem(itemId)}
                          title="全屏"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/20"
                        >
                          <Maximize size={14} />
                        </button>
                      </div>
                      <iframe
                        srcDoc={content ?? ""}
                        sandbox={htmlSandbox}
                        className="h-full min-h-[60vh] w-full rounded-lg border border-[var(--line)]"
                        title={itemTitle}
                      />
                    </div>
                  ) : renderType === 'component' ? (
                    <div key={itemId} className="animate-fade-in">
                      <ComponentRenderer subjectId={subjectId} categoryId={categoryId} itemId={itemId} />
                    </div>
                  ) : renderType === 'text' ? (
                    <div key={itemId} className="animate-fade-in">
                      <PlainTextReader content={content ?? ""} />
                    </div>
                  ) : deferredMarkdown ? (
                    <div key={itemId} className="prose-notes animate-fade-in">
                      {activeDeferred.status === "loaded" ? <DeferredNoteRenderer content={activeDeferred.markdown} /> : (
                        <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-muted)] p-6 text-center">
                          <p className="text-sm font-medium text-[var(--ink)]">这份资料篇幅较大，正文按需加载</p>
                          <p className="mt-2 text-xs text-[var(--ink-soft)]">约 {Math.max(1, Math.round(contentBytes / 1024))} KB 原文。打开后可阅读全文、公式和引用。</p>
                          <button type="button" onClick={() => void loadDeferred()} disabled={activeDeferred.status === "loading"} className="press mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                            {activeDeferred.status === "loading" ? "正在加载全文…" : activeDeferred.status === "error" ? "重试加载全文" : "加载完整资料"}
                          </button>
                          {activeDeferred.status === "error" ? <p role="alert" className="mt-2 text-xs text-[var(--md-sys-color-error)]">加载失败，请重试。</p> : null}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div key={itemId} className="prose-notes animate-fade-in">
                      {renderedNote}
                    </div>
                  )
                ) : (
                  <div key={itemId} className="animate-fade-in">
                    <EmptyNote itemId={itemId} title={itemTitle} />
                  </div>
                )}
              </article>
            </motion.div>
          )}
          {resolvedTab === "examples" && (
            <motion.div
              key="examples"
              variants={tabPanelVariants(tabDirection)}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full"
            >
              <ExampleTab
                initialExamples={initialExamples}
                sectionId={sectionId}
                subjectId={subjectId}
                chapterId={exampleChapterId}
              />
            </motion.div>
          )}
          {resolvedTab === "quiz" && (
            <motion.div
              key="quiz"
              variants={tabPanelVariants(tabDirection)}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full"
            >
              <QuizTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SelectionPopover containerRef={containerRef} />

      {/* HTML 全屏覆盖层 */}
      {isHtmlFullscreen && content && (
        <div className="fixed inset-0 z-[100] bg-white">
          <iframe
            srcDoc={content}
            sandbox={htmlSandbox}
            className="h-full w-full border-0"
            title={itemTitle}
          />
          <button
            onClick={() => setHtmlFullscreenItem(null)}
            title="退出全屏"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
          >
            <Minimize size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

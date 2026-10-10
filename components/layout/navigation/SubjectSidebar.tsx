"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
  ListTree,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import TocTree from "./TocTree";
import SiblingFilesPanel from "./SiblingFilesPanel";
import GlobalSettings from "../settings/GlobalSettings";
import LeftDock from "../LeftDock";
import SubjectFolderTree from "./SubjectFolderTree";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/stores/theme";
import { EASE } from "@/lib/motion";

let savedSidebarScroll = 0;

export default function SubjectSidebar() {
  // 折叠状态与 AppShell 左面板共用同一真相源（此前各持一份，导致此处的折叠按钮失效）。
  const isCollapsed = useStore((s) => s.sidebarCollapsed);
  const setCollapsed = useStore((s) => s.setSidebarCollapsed);
  const tocMode = useStore((s) => s.tocMode);
  const toggleTocMode = useStore((s) => s.toggleTocMode);
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);
  const hydrateTheme = useTheme((s) => s.hydrate);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = treeRef.current?.querySelector<HTMLElement>(".scroll-y");
    if (el) el.scrollTop = savedSidebarScroll;
    return () => {
      // 清理阶段重读 treeRef.current 拿到的是卸载后的新节点；保存滚位要用同一个元素。
      if (el) savedSidebarScroll = el.scrollTop;
    };
  }, []);

  // 挂载后从 DOM（已由内联脚本应用本地值）回填真实主题。
  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

  return (
    <aside
      // 当用户从 iframe / Electron <webview>（中栏 HTML 演示、右栏内置浏览器）移入侧栏时，
      // 焦点仍停留在嵌入文档内。此时第一次点击仅用于将焦点转回主文档，不会触发按钮 onClick，
      // 表现为「长时间不点击后侧栏点不动、需要点两次」。预先 blur 嵌入元素，确保下一次点击立即生效。
      onPointerEnter={() => {
        if (typeof document === "undefined") return;
        const active = document.activeElement as HTMLElement | null;
        if (!active) return;
        const tag = active.tagName;
        if (tag === "IFRAME" || tag === "WEBVIEW") {
          active.blur();
        }
      }}
      className="flex h-full flex-col"
      style={{
        background: "var(--md-sys-color-surface-container-lowest)",
        borderRight: "1px solid var(--md-sys-color-outline-variant)",
        perspective: 1200,
      }}
    >
      {/* 顶部标题区 */}
      <div
        className="flex shrink-0 items-center justify-between"
        style={{
          height: 36,
          padding: "0 8px 0 12px",
          borderBottom: "1px solid var(--md-sys-color-outline-variant)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--md-sys-color-outline)",
          }}
        >
          期末复习栈
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={toggleTocMode}
            className="flex items-center justify-center rounded"
            style={{
              width: 24,
              height: 24,
              color: tocMode
                ? "var(--md-sys-color-primary)"
                : "var(--md-sys-color-outline)",
              background: tocMode
                ? "var(--md-sys-color-primary-container)"
                : "transparent",
              border: "none",
              cursor: "pointer",
            }}
            title="目录 / 文件树"
            aria-pressed={tocMode}
          >
            <ListTree size={15} />
          </button>
          <button
            onClick={() => setCollapsed(!isCollapsed)}
            className="flex items-center justify-center rounded"
            style={{
              width: 24,
              height: 24,
              color: "var(--md-sys-color-outline)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
            title={isCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          >
            {isCollapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>
      </div>

      {/* 内容区：文件树 / 目录树 X 轴 3D 翻转切换 */}
      <AnimatePresence mode="wait">
        {tocMode ? (
          <motion.div
            key="toc-view"
            initial={{ rotateX: 90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ rotateX: -90, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE.decelerate }}
            style={{
              transformOrigin: "center top",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <TocTree />
            </div>
            <SiblingFilesPanel />
          </motion.div>
        ) : (
          <motion.div
            key="filetree-view"
            initial={{ rotateX: 90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ rotateX: -90, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE.decelerate }}
            style={{
              transformOrigin: "center top",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div ref={treeRef} className="flex min-h-0 flex-1 flex-col">
              <SubjectFolderTree />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部工具条：头像 + 昵称打开设置 */}
      <div
        className="ss-sidebar-dock flex shrink-0 items-center gap-1"
      >
        <LeftDock
          buttonRef={settingsBtnRef}
          settingsOpen={settingsOpen}
          onToggle={() => setSettingsOpen((v) => !v)}
        />
        <button
          onClick={toggleTheme}
          className="flex shrink-0 items-center justify-center rounded-lg transition-colors"
          style={{
            width: 30,
            height: 28,
            color: "var(--md-sys-color-on-surface-variant)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--md-sys-color-surface-container-high)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          title={theme === "light" ? "切换到深色" : "切换到浅色"}
        >
          {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </div>

      {settingsOpen && (
        <GlobalSettings anchorRef={settingsBtnRef} onClose={() => setSettingsOpen(false)} />
      )}
    </aside>
  );
}

"use client";

/**
 * HTML 演示（Artifact）全局浮窗 —— 要改「右侧 Agent 里那个可视化 HTML」请改本文件。
 * AppShell 挂载，portal 到 document.body；既不属于右侧面板，也不属于中间笔记区。
 * 全屏对齐目标由设置 artifactFullscreenTarget 控制（默认笔记栏）。
 * 完整链路见 lib/ai/agent/tools/renderInteractive/tool.ts 的路径地图。
 */
import { Download, LoaderCircle, MonitorPlay } from "lucide-react";
import { useEffect } from "react";
import { acquireArtifactBodyLease, hydrateArtifactBody } from "@/lib/stores/artifacts";
import { useArtifacts } from "@/lib/hooks/useArtifacts";
import { useSettings } from "@/lib/hooks/useSettings";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { ARTIFACT_IFRAME_SANDBOX, injectOpaqueOriginStorageShim } from "@/lib/sandbox/opaqueOriginStorageShim";
import { downloadHtmlFile } from "@/lib/utils/downloadHtml";
import { openHtmlInNewTab } from "@/lib/utils/openHtmlInNewTab";
import { useT } from "@/lib/i18n";
import ManagedWindow from "@/components/window/ManagedWindow";

function artifactWindowId(id: string) {
  return `artifact-viewer:${id}`;
}

export default function ArtifactViewer() {
  const viewerId = useArtifacts((s) => s.viewerId);
  const art = useArtifacts((s) => (s.viewerId ? s.byId[s.viewerId] : null));
  const closeViewer = useArtifacts((s) => s.closeViewer);
  const fullscreenTarget = useSettings((s) => s.artifactFullscreenTarget);
  const windowTitle = useWindowManager((s) =>
    viewerId ? s.windows.find((win) => win.id === artifactWindowId(viewerId))?.title : undefined,
  );
  const t = useT();

  useEffect(() => {
    if (!viewerId) return;
    const release = acquireArtifactBodyLease(viewerId);
    void hydrateArtifactBody(viewerId);
    return release;
  }, [viewerId]);

  if (!viewerId) return null;

  /**
   * 产物还没落盘（正在生成 / 生成失败 / 数据被清掉）：窗口照样开出来，画一张说明卡。
   * 以前这里直接 `return null`，于是从参考列点「演示」在生成完成前是一片空白 —— 看起来像坏了。
   */
  if (!art?.html) {
    return (
      <ManagedWindow
        windowId={artifactWindowId(viewerId)}
        title={windowTitle || t("window.artifact.defaultTitle")}
        icon={<MonitorPlay size={15} />}
        onClose={closeViewer}
        fullscreenTarget={fullscreenTarget}
        overlayId={`artifact-viewer-${viewerId}`}
        bodyClassName="flex flex-col bg-[var(--bg-panel)]"
        unmountWhenMinimized
      >
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
          <LoaderCircle size={22} className="animate-spin motion-reduce:animate-none text-[var(--ink-faint)]" />
          <p className="max-w-[38ch] text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
            {t("window.artifact.notReady")}
          </p>
        </div>
      </ManagedWindow>
    );
  }

  return (
    <ManagedWindow
      windowId={artifactWindowId(viewerId)}
      title={art.title}
      icon={<MonitorPlay size={15} />}
      onClose={closeViewer}
      fullscreenTarget={fullscreenTarget}
      overlayId={`artifact-viewer-${viewerId}`}
      externalLink={{ onOpen: () => openHtmlInNewTab(art.html) }}
      actions={
        <button
          type="button"
          data-no-drag
          onClick={() => downloadHtmlFile(art.html, art.title)}
          title={t("window.common.downloadHtml")}
          className="press flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-variant)]"
        >
          <Download size={15} />
        </button>
      }
      bodyClassName="flex flex-col bg-white"
      unmountWhenMinimized
    >
      <iframe
        title={art.title}
        srcDoc={injectOpaqueOriginStorageShim(art.html)}
        sandbox={ARTIFACT_IFRAME_SANDBOX}
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </ManagedWindow>
  );
}

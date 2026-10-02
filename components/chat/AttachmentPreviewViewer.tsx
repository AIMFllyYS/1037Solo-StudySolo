"use client";

import { useCallback, useMemo, useState } from "react";
import clsx from "clsx";
import { Download, Globe, GlobeLock, Presentation } from "lucide-react";
import ManagedWindow from "@/components/window/ManagedWindow";
import FileTypeIcon from "@/components/icons/file-types/FileTypeIcon";
import PdfDocumentPane from "@/components/window/PdfDocumentPane";
import DocxDocumentPane from "@/components/window/DocxDocumentPane";
import PptxDocumentPane from "@/components/window/PptxDocumentPane";
import DocumentWorkspace from "@/components/window/DocumentWorkspace";
import { attachmentPreviewKind, isOpenXmlPptx } from "@/lib/chat/attachmentPreviewKind";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import type { AttachmentPreviewData } from "@/lib/stores/windowManager";
import { MessageContent } from "@/components/chat/MessageContent";
import { ARTIFACT_IFRAME_SANDBOX, injectOpaqueOriginStorageShim } from "@/lib/sandbox/opaqueOriginStorageShim";
import { downloadHtmlFile } from "@/lib/utils/downloadHtml";
import { openHtmlInNewTab } from "@/lib/utils/openHtmlInNewTab";
import { useT } from "@/lib/i18n";
import {useObjectUrl} from '@/lib/resources/useObjectUrl';


/**
 * 默认（锁网）：脚本能跑，但一个远程请求都发不出去。
 *
 * 上传的 HTML 附件既可能是纯静态页，也可能是脚本驱动的交互页，
 * 所以 script-src 必须放开；「仅本地」的承诺改由「不给任何远程来源」来兑现，
 * 而不是像以前那样把脚本一起掐掉（那样页面只剩一个不会动的壳）。
 */
const HTML_CSP_OFFLINE =
  "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; media-src data: blob:; connect-src data: blob:; " +
  "worker-src blob:; form-action 'none'; base-uri 'none'";

/** 只有这几个指令需要远程来源；form-action / base-uri 即使联网也不放行。 */
const REMOTE_SOURCE_DIRECTIVES = ["script-src", "style-src", "img-src", "font-src", "media-src", "connect-src"];

/** 允许联网：在同一套策略上把远程来源放行，避免开关顺手放宽别的能力。 */
export function htmlPreviewCsp(network: boolean): string {
  if (!network) return HTML_CSP_OFFLINE;
  return HTML_CSP_OFFLINE.split("; ")
    .map((directive) => {
      const name = directive.slice(0, directive.indexOf(" "));
      return REMOTE_SOURCE_DIRECTIVES.includes(name) ? `${directive} https: http:` : directive;
    })
    .join("; ");
}

function insertAfterHeadOpen(source: string, markup: string): string {
  const head = /<head(?=[\s>])/i.exec(source);
  if (head) {
    const at = source.indexOf(">", head.index) + 1;
    return source.slice(0, at) + markup + source.slice(at);
  }
  const root = /<html(?=[\s>])/i.exec(source);
  if (root) {
    const at = source.indexOf(">", root.index) + 1;
    return `${source.slice(0, at)}<head>${markup}</head>${source.slice(at)}`;
  }
  return `<head>${markup}</head>${source}`;
}

/**
 * 预览前的注入：CSP meta + opaque origin 的 storage shim。
 *
 * 两者都必须落在页面自己的脚本之前，所以统一插到 <head> 开头；
 * 且都要幂等——切换联网开关会让同一个 srcDoc 再走一次注入。
 */
function previewCspTag(network: boolean): string {
  return `<meta http-equiv="Content-Security-Policy" content="${htmlPreviewCsp(network)}">`;
}

const CSP_META_RE = /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*>/gi;

export function prepareHtmlPreview(html: string, options: { network: boolean }): string {
  // 先装 shim 再插 CSP：这样 CSP meta 一定排在 shim 之前，策略先于任何脚本被解析到。
  // 幂等：联网开关切换会让同一 srcDoc 再走一次注入——按完整内容认出我们上次注入
  // 的那条摘掉再按当前 network 重插；文档自带的 CSP meta 不动，多条 CSP 取交集
  // 收紧，附件自带的宽松策略不能用来绕过「仅本地」的联网限制。
  const shimmed = injectOpaqueOriginStorageShim(html ?? "");
  const ours = new Set([previewCspTag(true), previewCspTag(false)]);
  const withoutOurs = shimmed.replace(CSP_META_RE, (tag) => (ours.has(tag) ? "" : tag));
  return insertAfterHeadOpen(withoutOurs, previewCspTag(options.network));
}

export default function AttachmentPreviewViewer() {
  const hasPreview = useWindowManager((state) => state.windows.some((win) => win.type === "attachment-preview"));
  if (!hasPreview) return null;
  return <AttachmentPreviewWindows />;
}

function AttachmentPreviewWindows() {
  const windows = useWindowManager((state) => state.windows);
  const ids: string[] = [];
  for (const win of windows) {
    if (win.type === "attachment-preview") ids.push(win.id);
  }
  return <>{ids.map((id) => <AttachmentPreviewWindow key={id} windowId={id} />)}</>;
}

function AttachmentPreviewWindow({ windowId }: { windowId: string }) {
  const managed = useWindowManager((state) => state.windows.find((win) => win.id === windowId));
  const closeWindow = useWindowManager((state) => state.closeWindow);
  const handleClose = useCallback(() => closeWindow(windowId), [closeWindow, windowId]);
  const t = useT();
  const data = managed?.data as AttachmentPreviewData | undefined;
  const kind = data ? attachmentPreviewKind(data) : "text";
  // content 里的 blob: URL 归 composer 所有、随时会被回收；预览窗拿到原始 File 时
  // 自建 object URL，窗口卸载即释放——不再借用上游 URL（借据模型，修 object URL 泄漏）。
  const rawContent = data?.content ?? "";
  const file = data?.file;
  const needsOwnedUrl=!!file&&rawContent.startsWith('blob:');
  const ownedUrl=useObjectUrl(needsOwnedUrl?file:null,needsOwnedUrl);
  const content = needsOwnedUrl?(ownedUrl??''):rawContent;
  // 联网开关放在窗口这一层：最小化会卸载 children，状态留在子组件里就会被重置回「仅本地」。
  const [network, setNetwork] = useState(false);
  const localHtml = useMemo(
    () => (kind === "html" && content ? prepareHtmlPreview(content, { network }) : ""),
    [kind, content, network],
  );

  if (!managed || !data) return null;

  return (
    <ManagedWindow
      windowId={windowId}
      title={data.name}
      icon={<FileTypeIcon kind={kind === "ppt" ? "ppt" : undefined} mimeType={data.mimeType} name={data.name} size={17} />}
      onClose={handleClose}
      fullscreenTarget="notes"
      minSize={{ minW: 360, minH: 280 }}
      className="attachment-preview-window"
      testId="attachment-preview-window"
      externalLink={kind === "html" ? { onOpen: () => openHtmlInNewTab(data.content), label: t("window.attachment.newTab") } : undefined}
      /**
       * 只有 HTML 附件有真正的窗口动作，其余格式传 undefined。
       *
       * WindowChrome 里 showHeader = !dockSurface || Boolean(actions) || Boolean(externalLink)，
       * 所以「没有动作」就等于「dock 里不出现那一条标题栏」。
       * 以前每种附件都挂一个「仅本地」徽标，等于给 PDF/PPTX/Word/图片白加一行空标题栏。
       * 联网状态改由开关自身的图标与配色表达，不再单独占一个徽标。
       */
      actions={
        kind === "html" ? (
          <>
            <button
              type="button"
              data-no-drag
              onClick={() => setNetwork((value) => !value)}
              aria-pressed={network}
              title={network ? t("window.attachment.networkOn") : t("window.attachment.networkOff")}
              className={clsx(
                "press flex h-7 w-7 items-center justify-center rounded-lg",
                network
                  ? "text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)]"
                  : "text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-variant)]",
              )}
            >
              {network ? <GlobeLock size={15} /> : <Globe size={15} />}
            </button>
            <button
              type="button"
              data-no-drag
              onClick={() => downloadHtmlFile(data.content, data.name)}
              title={t("window.common.downloadHtml")}
              className="press flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-variant)]"
            >
              <Download size={15} />
            </button>
          </>
        ) : undefined
      }
      bodyClassName="flex min-h-0 flex-1 overflow-hidden bg-[var(--bg-panel)]"
      unmountWhenMinimized
    >
      {needsOwnedUrl&&!ownedUrl?<div role="status" className="p-4 text-sm">正在准备本地预览…</div>:kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- local data URLs are intentionally kept out of remote loaders.
        <img src={content} alt={data.name} className="h-full w-full object-contain p-4" />
      ) : kind === "pdf" ? (
        <PdfDocumentPane src={content} name={data.name} />
      ) : kind === "docx" ? (
        <DocxDocumentPane src={content} name={data.name} />
      ) : kind === "html" ? (
        // key 跟着联网开关走：srcDoc 里的 CSP 只在文档加载时生效，切换策略必须重建 iframe。
        <iframe
          key={`${windowId}:${network ? "net" : "local"}`}
          srcDoc={localHtml}
          sandbox={ARTIFACT_IFRAME_SANDBOX}
          title={data.name}
          className="h-full w-full border-0 bg-white"
        />
      ) : kind === "markdown" ? (
        <MarkdownPreviewPane content={content} />
      ) : kind === "ppt" ? (
        isOpenXmlPptx(data) ? (
          <PptxDocumentPane src={content} name={data.name} />
        ) : (
          <div className="flex h-full min-h-52 flex-col items-center justify-center gap-3 px-6 text-center">
            <Presentation size={32} className="text-[var(--md-sys-color-primary)]" />
            <p className="text-[13px] font-semibold text-[var(--ink)]">{t("window.attachment.pptxTitle")}</p>
            <p className="max-w-md text-[12px] leading-6 text-[var(--ink-soft)]">
              {t("window.attachment.pptxLegacy")}
            </p>
          </div>
        )
      ) : (
        <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[12px] leading-6 text-[var(--ink)]">{content}</pre>
      )}
    </ManagedWindow>
  );
}

function markdownOutline(content: string, fallbackTitle: string) {
  const items = [...content.matchAll(/^(#{1,4})\s+(.+)$/gm)].map((match, index) => ({
    id: String(index + 1),
    title: match[2].trim(),
    meta: `H${match[1].length}`,
  }));
  return items.length ? items : [{ id: "1", title: fallbackTitle }];
}

function MarkdownPreviewPane({ content }: { content: string }) {
  const t = useT();
  const outline = useMemo(() => markdownOutline(content, t("window.attachment.bodyFallback")), [content, t]);
  const [activeId, setActiveId] = useState(outline[0]?.id ?? "1");
  return (
    <DocumentWorkspace outline={outline} activeId={activeId} onSelect={setActiveId} outlineLabel={t("window.attachment.markdownOutline")} layoutKey="markdown">
      <div className="h-full overflow-auto bg-[var(--bg-panel)] px-6 py-5 chat-prose">
        <MessageContent content={content} enableVisualizations={false} preserveLineBreaks={false} />
      </div>
    </DocumentWorkspace>
  );
}

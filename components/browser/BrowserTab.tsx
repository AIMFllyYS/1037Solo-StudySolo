"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Home, RotateCw, ArrowRight, ArrowLeft, ExternalLink, Globe, Search, Smartphone, Monitor } from "lucide-react";
import EmbedFallback from "@/components/browser/EmbedFallback";
import WebviewSite, { type WebviewEl } from "@/components/browser/WebviewSite";
import PageControls from "@/components/browser/PageControls";
import ZoomableSite from "@/components/browser/ZoomableSite";
import { safeHttpUrl } from "@/components/browser/safeUrl";
import { useBrowser, MOBILE_LOGICAL_WIDTH, type ViewMode } from "@/lib/hooks/useBrowser";
import { useEmbeddable } from "@/lib/hooks/useEmbeddable";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useT } from "@/lib/i18n";

/** 右侧面板内置浏览器：地址栏 + 自适应（手机视口模拟）iframe。本地使用，仅做基础 sandbox 安全。 */
export default function BrowserTab() {
  const isPhone = useIsMobile();
  const currentUrl = useBrowser((s) => s.currentUrl);
  const reloadNonce = useBrowser((s) => s.reloadNonce);
  const viewMode = useBrowser((s) => s.viewMode);
  const zoomPercent = useBrowser((s) => s.zoomPercent);
  const navigate = useBrowser((s) => s.navigate);
  const reload = useBrowser((s) => s.reload);
  const goHome = useBrowser((s) => s.goHome);
  const setViewMode = useBrowser((s) => s.setViewMode);
  const setZoomPercent = useBrowser((s) => s.setZoomPercent);
  const frameMode: ViewMode = isPhone ? "desktop" : viewMode;
  const t = useT();

  const [addr, setAddr] = useState(currentUrl);
  const [nativeUrl, setNativeUrl] = useState(currentUrl);
  const [prevUrl, setPrevUrl] = useState(currentUrl);
  if (currentUrl !== prevUrl) {
    setPrevUrl(currentUrl);
    setAddr(currentUrl);
    setNativeUrl(currentUrl);
  }

  // 桌面端（Electron）→ 用真实 <webview> 跑全站；网页/开发态 → 维持 iframe + 可嵌入预检。
  const isDesktop = useSyncExternalStore(
    () => () => {},
    () => !!(window as unknown as { desktop?: { isElectron?: boolean } }).desktop?.isElectron,
    () => false,
  );
  const webviewRef = useRef<WebviewEl | null>(null);
  // currentUrl 也可能来自 localStorage 持久化（未过 normalizeUrl），渲染前再过一遍白名单，
  // 防止脏数据变成 <a href> 或 iframe/webview 的可加载地址。
  const safeUrl = safeHttpUrl(currentUrl);
  // Native navigation can stay inside the guest without changing its requested src.
  // External-open follows that actual page, independently of address-bar edits.
  const safeExternalUrl = isDesktop ? safeHttpUrl(nativeUrl) : safeUrl;
  const handleNativeUrlChange = useCallback((url: string) => {
    setAddr(url);
    setNativeUrl(url);
  }, []);
  const { blocked, reason, forceEmbed } = useEmbeddable(isDesktop ? null : safeUrl || null);

  const go = () => {
    if (addr.trim()) navigate(addr);
  };

  const toggleView = () => setViewMode(viewMode === "mobile" ? "desktop" : "mobile");

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--bg-panel)]">
      {/* 工具栏 */}
      <div className="mobile-browser-toolbar flex shrink-0 items-center gap-1 border-b border-[var(--line)] px-2 py-1.5">
        <button
          onClick={goHome}
          title={t("window.browser.home")}
          className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
        >
          <Home size={15} />
        </button>
        {isDesktop && (
          <>
            <button
              onClick={() => webviewRef.current?.goBack()}
              title={t("window.browser.back")}
              disabled={!currentUrl}
              className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
            >
              <ArrowLeft size={15} />
            </button>
            <button
              onClick={() => webviewRef.current?.goForward()}
              title={t("window.browser.forward")}
              disabled={!currentUrl}
              className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
            >
              <ArrowRight size={15} />
            </button>
          </>
        )}
        <button
          onClick={reload}
          title={t("window.browser.refresh")}
          disabled={!currentUrl}
          className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
        >
          <RotateCw size={15} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-2.5 py-1.5 focus-within:border-[var(--accent)]">
          <Globe size={13} className="shrink-0 text-[var(--ink-faint)]" />
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
            }}
            placeholder={t("window.browser.addressPlaceholder")}
            aria-label={t("window.browser.addressPlaceholder")}
            className="w-0 min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
        </div>
        <button
          onClick={go}
          title={t("window.browser.go")}
          className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--accent-ink)] hover:bg-[var(--accent-weak)]"
        >
          <ArrowRight size={15} />
        </button>
        {!isPhone && !isDesktop && (
        <button
          onClick={toggleView}
          title={viewMode === "mobile" ? t("window.browser.viewMobileHint") : t("window.browser.viewDesktopHint")}
          className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
        >
          {viewMode === "mobile" ? <Smartphone size={15} /> : <Monitor size={15} />}
        </button>
        )}
        <PageControls zoomPercent={zoomPercent} onZoomChange={setZoomPercent} onReload={reload} canReload={!!safeUrl} />
        <a
          href={safeExternalUrl || undefined}
          target="_blank"
          rel="noopener noreferrer"
          title={t("window.browser.openInNewTabHint")}
          className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] aria-disabled:opacity-40"
          aria-disabled={!safeExternalUrl}
          onClick={(e) => {
            if (!safeExternalUrl) e.preventDefault();
          }}
        >
          <ExternalLink size={15} />
        </a>
      </div>

      {/* 内容区 */}
      <div className="min-h-0 flex-1">
        {safeUrl ? (
          isDesktop ? (
            <WebviewSite
              url={safeUrl}
              nonce={reloadNonce}
              zoomFactor={zoomPercent / 100}
              webviewRef={webviewRef}
              onUrlChange={handleNativeUrlChange}
            />
          ) : blocked ? (
            <EmbedFallback
              url={safeUrl}
              reason={reason}
              onForce={forceEmbed}
              title={t("window.browser.embedBlockedBySite")}
              actionLabel={t("window.browser.openInNewTab")}
            />
          ) : (
            <ZoomableSite url={safeUrl} nonce={reloadNonce} logicalWidth={frameMode === "mobile" ? MOBILE_LOGICAL_WIDTH : undefined} zoomPercent={zoomPercent} title={t("window.browser.builtInBrowser")} allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-read; clipboard-write" />
          )
        ) : (
          <BingStartPage onSearch={navigate} />
        )}
      </div>
    </div>
  );
}

/** 必应搜索起始页（浏览器标签的默认页）：本地深色搜索框 → 走 bing.com/search 结果页（可内嵌）。 */
function BingStartPage({ onSearch }: { onSearch: (q: string) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const submit = () => {
    if (q.trim()) onSearch(q.trim());
  };
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-weak)] text-[var(--accent-ink)]">
        <Search size={28} />
      </div>
      <p className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">{t("window.browser.bingTitle")}</p>
      <p className="mt-1 text-[12px] text-[var(--ink-soft)]">{t("window.browser.bingSubtitle")}</p>

      <div className="mt-5 flex w-full max-w-[360px] items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--bg-muted)] px-4 py-2.5 focus-within:border-[var(--accent)]">
        <Search size={15} className="shrink-0 text-[var(--ink-faint)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
          placeholder={t("window.browser.searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
        <button
          onClick={submit}
          disabled={!q.trim()}
          title={t("window.browser.search")}
          className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--md-sys-color-on-primary)] disabled:opacity-40"
        >
          <ArrowRight size={15} />
        </button>
      </div>

      <p className="mt-6 max-w-[300px] text-[11px] leading-relaxed text-[var(--ink-faint)]">
        {t("window.browser.bingFootnote")}
      </p>
    </div>
  );
}

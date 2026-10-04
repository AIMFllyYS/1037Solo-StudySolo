"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Home, RotateCw, ArrowRight, ArrowLeft, ExternalLink, Globe, Search, Smartphone, Monitor, MoreHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import EmbedFallback from "@/components/browser/EmbedFallback";
import WebviewSite, { type WebviewEl } from "@/components/browser/WebviewSite";
import AnchoredMenu from "@/components/ui/AnchoredMenu";
import { safeHttpUrl } from "@/components/browser/safeUrl";
import { useBrowser, MOBILE_LOGICAL_WIDTH, MAX_BROWSER_ZOOM_PERCENT, MIN_BROWSER_ZOOM_PERCENT, type ViewMode } from "@/lib/hooks/useBrowser";
import { useEmbeddable } from "@/lib/hooks/useEmbeddable";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { computeIframeZoomLayout } from "@/lib/browser/iframeZoom";
import { useT } from "@/lib/i18n";

/** 右侧面板内置浏览器：地址栏 + 自适应（手机视口模拟）iframe。本地使用，仅做基础 sandbox 安全。 */
export default function BrowserTab() {
  const zoomStep = 10;
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
  const [prevUrl, setPrevUrl] = useState(currentUrl);
  const pageControlsTriggerRef = useRef<HTMLButtonElement | null>(null);
  if (currentUrl !== prevUrl) {
    setPrevUrl(currentUrl);
    setAddr(currentUrl);
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
  const { blocked, reason, forceEmbed } = useEmbeddable(isDesktop ? null : safeUrl || null);

  const go = () => {
    if (addr.trim()) navigate(addr);
  };

  const toggleView = () => setViewMode(viewMode === "mobile" ? "desktop" : "mobile");

  return (
    <div className="flex h-full flex-col bg-[var(--bg-panel)]">
      {/* 工具栏 */}
      <div className="mobile-browser-toolbar flex shrink-0 items-center gap-1 border-b border-[var(--line)] px-2 py-1.5">
        <button
          onClick={goHome}
          title={t("window.browser.home")}
          className="press flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
        >
          <Home size={15} />
        </button>
        {isDesktop && (
          <>
            <button
              onClick={() => webviewRef.current?.goBack()}
              title={t("window.browser.back")}
              disabled={!currentUrl}
              className="press flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
            >
              <ArrowLeft size={15} />
            </button>
            <button
              onClick={() => webviewRef.current?.goForward()}
              title={t("window.browser.forward")}
              disabled={!currentUrl}
              className="press flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
            >
              <ArrowRight size={15} />
            </button>
          </>
        )}
        <button
          onClick={reload}
          title={t("window.browser.refresh")}
          disabled={!currentUrl}
          className="press flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
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
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
        </div>
        <button
          onClick={go}
          title={t("window.browser.go")}
          className="press flex h-8 w-8 items-center justify-center rounded-lg text-[var(--accent-ink)] hover:bg-[var(--accent-weak)]"
        >
          <ArrowRight size={15} />
        </button>
        {!isPhone && (
        <button
          onClick={toggleView}
          title={viewMode === "mobile" ? t("window.browser.viewMobileHint") : t("window.browser.viewDesktopHint")}
          className="press flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
        >
          {viewMode === "mobile" ? <Smartphone size={15} /> : <Monitor size={15} />}
        </button>
        )}
        <AnchoredMenu
          label={t("window.browser.pageControls")}
          width={210}
          placement="bottom"
          testId="browser-page-controls"
          triggerRef={pageControlsTriggerRef}
          className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
          trigger={<MoreHorizontal size={16} />}
        >
          {(close) => (
            <div className="flex flex-col gap-1 p-1">
              <button
                type="button"
                role="menuitem"
                disabled={zoomPercent <= MIN_BROWSER_ZOOM_PERCENT}
                onClick={() => { setZoomPercent(zoomPercent - zoomStep); close(); pageControlsTriggerRef.current?.focus({ preventScroll: true }); }}
                className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-left text-[12.5px] text-[var(--ink)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
                data-testid="browser-zoom-out"
              >
                <ZoomOut size={15} /> <span className="flex-1">{t("window.browser.zoomOut")}</span><span>{zoomPercent}%</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={zoomPercent >= MAX_BROWSER_ZOOM_PERCENT}
                onClick={() => { setZoomPercent(zoomPercent + zoomStep); close(); pageControlsTriggerRef.current?.focus({ preventScroll: true }); }}
                className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-left text-[12.5px] text-[var(--ink)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
                data-testid="browser-zoom-in"
              >
                <ZoomIn size={15} /> <span className="flex-1">{t("window.browser.zoomIn")}</span><span>{zoomPercent}%</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={zoomPercent === 100}
                onClick={() => { setZoomPercent(100); close(); pageControlsTriggerRef.current?.focus({ preventScroll: true }); }}
                className="flex min-h-9 items-center justify-between rounded-lg px-2 text-left text-[12.5px] text-[var(--ink)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
                data-testid="browser-zoom-reset"
              >
                <span>{t("window.browser.zoomReset")}</span><span>100%</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!currentUrl}
                onClick={() => { reload(); close(); pageControlsTriggerRef.current?.focus({ preventScroll: true }); }}
                className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-left text-[12.5px] text-[var(--ink)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
                data-testid="browser-menu-refresh"
              >
                <RotateCw size={15} /> {t("window.browser.refresh")}
              </button>
            </div>
          )}
        </AnchoredMenu>
        <a
          href={safeUrl || undefined}
          target="_blank"
          rel="noreferrer"
          title={t("window.browser.openInNewTabHint")}
          className="press flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] aria-disabled:opacity-40"
          aria-disabled={!safeUrl}
          onClick={(e) => {
            if (!safeUrl) e.preventDefault();
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
              onUrlChange={setAddr}
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
            <FramedSite url={safeUrl} nonce={reloadNonce} viewMode={frameMode} zoomPercent={zoomPercent} />
          )
        ) : (
          <BingStartPage onSearch={navigate} />
        )}
      </div>
    </div>
  );
}

/**
 * 自适应 iframe：手机视图下以固定逻辑视口宽（414px）渲染，再 transform 缩放贴合面板宽，
 * 让所有站点都拿到"手机视口"并完整放进右侧窄面板（无横向溢出）；桌面视图按面板原宽 1:1。
 */
function FramedSite({ url, nonce, viewMode, zoomPercent }: { url: string; nonce: number; viewMode: ViewMode; zoomPercent: number }) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const logicalW = viewMode === "mobile" ? MOBILE_LOGICAL_WIDTH : size.w;
  const frame = computeIframeZoomLayout({
    containerWidth: size.w,
    containerHeight: size.h,
    logicalWidth: logicalW,
    zoomFactor: zoomPercent / 100,
  });

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-white">
      {size.w > 0 && (
        <iframe
          key={`${url}:${nonce}:${viewMode}`}
          src={url}
          title={t("window.browser.builtInBrowser")}
          style={{
            position: "absolute",
            left: frame.offsetLeft,
            top: 0,
            width: frame.iframeWidth,
            height: frame.iframeHeight,
            transform: `scale(${frame.renderScale})`,
            transformOrigin: "top left",
            border: 0,
          }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads allow-modals"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-read; clipboard-write"
          referrerPolicy="no-referrer-when-downgrade"
        />
      )}
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

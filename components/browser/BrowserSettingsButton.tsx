"use client";

import { useRef, useState } from "react";
import { Bookmark, Trash2, Star, Home, Globe } from "lucide-react";
import AnchoredMenu from "@/components/ui/AnchoredMenu";
import { useBrowser } from "@/lib/hooks/useBrowser";
import { useT } from "@/lib/i18n";

/** 右侧 Tab 栏最右的「＋」功能按钮：新增收藏网址（生成固定 Tab）、管理收藏、设置主页。 */
export default function BrowserSettingsButton({ onAdded }: { onAdded?: () => void }) {
  const bookmarks = useBrowser((s) => s.bookmarks);
  const addBookmark = useBrowser((s) => s.addBookmark);
  const removeBookmark = useBrowser((s) => s.removeBookmark);
  const homeUrl = useBrowser((s) => s.homeUrl);
  const setHomeUrl = useBrowser((s) => s.setHomeUrl);
  const openBookmark = useBrowser((s) => s.openBookmark);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [home, setHome] = useState(homeUrl);
  const [prevHomeUrl, setPrevHomeUrl] = useState(homeUrl);
  if (homeUrl !== prevHomeUrl) {
    setPrevHomeUrl(homeUrl);
    setHome(homeUrl);
  }

  const btnRef = useRef<HTMLButtonElement>(null);
  const t = useT();
  const closeAndFocus = (close: () => void) => {
    close();
    btnRef.current?.focus({ preventScroll: true });
  };
  const submit = (close: () => void) => {
    if (!url.trim()) return;
    const id = addBookmark(name, url);
    if (id) {
      openBookmark(id);
      setName("");
      setUrl("");
      closeAndFocus(close);
      onAdded?.();
    }
  };

  const inputCls =
    "w-full min-w-0 rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]";

  return (
      <AnchoredMenu
        triggerRef={btnRef}
        label={t("window.browser.settingsTitle")}
        width={280}
        testId="browser-settings"
        trigger={<Bookmark size={15} />}
        className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
      >
        {(close) => (
          <div
            className="p-3"
            onKeyDown={(event) => {
              // Settings contain editable fields: keep typing/caret and natural Tab
              // behavior instead of the shared action menu's arrow/typeahead handling.
              if (event.key !== "Escape" && (event.target instanceof HTMLInputElement || event.key === "Tab")) event.stopPropagation();
            }}
          >
            {/* 新增收藏 */}
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">
              <Star size={12} /> {t("window.browser.newBookmark")}
            </div>
            <div className="flex flex-col gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("window.browser.namePlaceholder")}
                aria-label={t("window.browser.namePlaceholder")}
                className={inputCls}
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit(close);
                  }
                }}
                placeholder="https://…"
                aria-label={t("window.browser.newBookmark")}
                className={inputCls}
              />
              <button
                onClick={() => submit(close)}
                disabled={!url.trim()}
                className="press rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)] disabled:opacity-40"
              >
                {t("window.browser.addAsTab")}
              </button>
            </div>

            {/* 收藏管理 */}
            {bookmarks.length > 0 && (
              <div className="mt-3 border-t border-[var(--line)] pt-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">
                  {t("window.browser.myBookmarks")}
                </div>
                <div className="flex max-h-[160px] flex-col gap-0.5 overflow-y-auto">
                  {bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--bg-muted)]"
                    >
                      <Globe size={13} className="shrink-0 text-[var(--ink-faint)]" />
                      <button
                        onClick={() => {
                          openBookmark(bm.id);
                          closeAndFocus(close);
                          onAdded?.();
                        }}
                        className="min-w-0 flex-1 truncate text-left text-[12.5px] text-[var(--ink)]"
                        title={bm.url}
                      >
                        {bm.name}
                      </button>
                      <button
                        onClick={() => removeBookmark(bm.id)}
                        title={t("window.browser.deleteBookmark")}
                        aria-label={`${t("window.browser.deleteBookmark")}: ${bm.name}`}
                        className="shrink-0 rounded p-1 text-[var(--ink-faint)] hover:text-[var(--md-sys-color-error)]"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 主页设置 */}
            <div className="mt-3 border-t border-[var(--line)] pt-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">
                <Home size={12} /> {t("window.browser.homeLabel")}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={home}
                  onChange={(e) => setHome(e.target.value)}
                  placeholder={t("window.browser.homePlaceholder")}
                  aria-label={t("window.browser.homeLabel")}
                  className={inputCls}
                />
                <button
                  onClick={() => setHomeUrl(home)}
                  className="press shrink-0 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
                >
                  {t("window.browser.save")}
                </button>
              </div>
            </div>
          </div>
        )}
      </AnchoredMenu>
  );
}

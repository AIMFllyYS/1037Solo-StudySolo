"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { SPOTLIGHT_INPUT_CLASS, SPOTLIGHT_SEARCH_FIELD_CLASS } from "@/components/search/spotlightChrome";
import { openSourcePreview } from "@/lib/chat/openSourcePreview";
import { recordImport } from "@/lib/stores/assets/imports";
import { useT } from "@/lib/i18n";

export function parseOpenableUrl(raw: string): { href: string; hostname: string; isHtml: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return {
      href: parsed.toString(),
      hostname: parsed.hostname,
      isHtml: /\.html?(?:$|[?#])/i.test(parsed.pathname),
    };
  } catch {
    return null;
  }
}

/** 加号菜单最后一栏的内联网址栏：复用搜索 input class，不另开 Spotlight 页。 */
export default function OpenUrlField({ onOpened }: { onOpened?: () => void }) {
  const t = useT();
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const addUrl = () => {
    const parsed = parseOpenableUrl(url);
    if (!parsed) {
      setUrlError(t("panel.url.invalid"));
      return;
    }
    const title = `${parsed.isHtml ? "HTML" : t("panel.url.titleTag")} · ${parsed.hostname}`;
    openSourcePreview({ url: parsed.href, title });
    // 本地导入记录：我的资产 → 网址 里能再次打开它（只存链接，不存内容）。
    recordImport({
      kind: "url",
      name: parsed.hostname,
      title,
      url: parsed.href,
      source: "window-taskbar",
    });
    setUrl("");
    setUrlError(null);
    onOpened?.();
  };

  return (
    <div role="group" aria-label={t("panel.url.group")} data-menu-group="open-url">
      <div className="flex items-center gap-1.5">
        <div className={`min-w-0 flex-1 ${SPOTLIGHT_SEARCH_FIELD_CLASS}`}>
          <Link2 size={15} className="shrink-0 text-[var(--md-sys-color-primary)]" />
          <input
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setUrlError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") addUrl();
            }}
            placeholder={t("panel.url.placeholder")}
            aria-label={t("panel.url.field")}
            className={SPOTLIGHT_INPUT_CLASS}
          />
        </div>
        <button
          type="button"
          onClick={addUrl}
          className="h-8 shrink-0 rounded-xl bg-[var(--md-sys-color-primary)] px-2.5 text-[12px] font-medium text-[var(--md-sys-color-on-primary)]"
        >
          {t("panel.common.open")}
        </button>
      </div>
      {urlError ? (
        <p className="px-1 pt-1 text-[12px] text-[var(--md-sys-color-error)]">{urlError}</p>
      ) : null}
    </div>
  );
}

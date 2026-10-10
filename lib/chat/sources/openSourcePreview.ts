import { useWindowManager } from "@/lib/stores/workspace/windowManager";

export function sourcePreviewWindowId(url: string) {
  return `source-preview:${url}`;
}

export function sourceFaviconUrl(url: string): string {
  try {
    return new URL("/favicon.ico", url).toString();
  } catch {
    return "";
  }
}

export function openSourcePreview(source: { url: string; title?: string; iconUrl?: string }) {
  if (!source.url) return;
  let parsed: URL;
  try {
    parsed = new URL(source.url);
  } catch {
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
  const id = sourcePreviewWindowId(source.url);
  const title = source.title?.trim() || sourceHost(source.url);
  const iconUrl = source.iconUrl?.trim() || sourceFaviconUrl(source.url);
  const wm = useWindowManager.getState();
  const existing = wm.windows.find((win) => win.id === id);
  if (existing) {
    wm.updateWindow(id, { title, icon: iconUrl, data: { url: source.url, title, iconUrl } });
    if (existing.minimized) wm.restoreWindow(id);
    else wm.bringToFront(id);
    void hydrateSourceIcon(id, source.url, iconUrl);
    return;
  }
  const { pos, size } = sourcePreviewGeometry();
  wm.openWindow({
    id,
    type: "source-preview",
    title,
    icon: iconUrl,
    pos,
    size,
    data: { url: source.url, title, iconUrl },
  });
  void hydrateSourceIcon(id, source.url, iconUrl);
}

/** 尝试读取页面声明的 favicon；跨域或非 HTML 页面失败时保留 /favicon.ico。 */
async function resolveDeclaredSourceIcon(url: string, fallback: string): Promise<string> {
  if (typeof window === "undefined" || typeof fetch === "undefined" || typeof DOMParser === "undefined") return fallback;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, {
      credentials: "omit",
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) return fallback;
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/html|xml/i.test(contentType)) return fallback;
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const link = Array.from(doc.querySelectorAll("link[rel][href]")).find((node) => {
      const rel = node.getAttribute("rel")?.toLowerCase().split(/\s+/) ?? [];
      return rel.includes("icon") || rel.includes("shortcut") || rel.includes("apple-touch-icon");
    });
    const href = link?.getAttribute("href")?.trim();
    return href ? new URL(href, url).toString() : fallback;
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function hydrateSourceIcon(id: string, url: string, fallback: string) {
  if (!fallback) return;
  const iconUrl = await resolveDeclaredSourceIcon(url, fallback);
  const wm = useWindowManager.getState();
  const current = wm.windows.find((win) => win.id === id);
  if (!current || current.type !== "source-preview" || current.icon === iconUrl) return;
  const data = current.data as { url?: string; title?: string; iconUrl?: string };
  wm.updateWindow(id, {
    icon: iconUrl,
    data: { ...data, iconUrl },
  });
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function sourcePreviewGeometry() {
  if (typeof window === "undefined") {
    return { pos: { x: 72, y: 64 }, size: { width: 920, height: 720 } };
  }
  const openCount = useWindowManager
    .getState()
    .windows.filter((win) => win.type === "source-preview" && !win.minimized).length;
  const offset = openCount * 28;
  const width = Math.min(960, Math.floor(window.innerWidth * 0.78));
  const height = Math.min(820, Math.floor(window.innerHeight * 0.88));
  return {
    pos: {
      x: Math.max(16, Math.floor(window.innerWidth * 0.12) + offset),
      y: Math.max(16, Math.floor(window.innerHeight * 0.06) + offset),
    },
    size: { width, height },
  };
}

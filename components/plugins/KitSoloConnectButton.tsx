"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Badge from "@/components/ui/Badge";
import ActionButton from "@/components/ui/ActionButton";

type KitSoloStatus = "loading" | "connected" | "none" | "unavailable";

/** KitSolo 的账号关联：弹窗授权，成功后回写状态。`trailing` 与学习服务卡片一样把「详情」放进同一行。 */
export function KitSoloConnectButton({ english = false, compact = false, trailing }: { english?: boolean; compact?: boolean; trailing?: ReactNode }) {
  const [status, setStatus] = useState<KitSoloStatus>("loading"), [notice, setNotice] = useState("");
  const popup = useRef<Window | null>(null), timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const request = useRef<AbortController | null>(null);
  const check = useCallback(async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    try { const response = await fetch("/api/kitsolo/status/", { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error(); const data = await response.json(); if (!controller.signal.aborted) setStatus(data.connected ? "connected" : data.reason === "unavailable" ? "unavailable" : "none"); }
    catch { if (!controller.signal.aborted) setStatus("unavailable"); }
  }, []);
  useEffect(() => {
    const start = window.setTimeout(() => void check(), 0);
    const done = (event: MessageEvent) => { if (event.origin === window.location.origin && event.source === popup.current && event.data?.type === "kitsolo:connected") { void check(); setNotice(event.data.ok ? (english ? "KitSolo connected. Use it in your next Agent turn." : "KitSolo 已关联，下一轮 Agent 对话即可使用。") : (english ? "Connection was cancelled or expired. Try again." : "关联取消或已过期，请重新尝试。")); } };
    window.addEventListener("message", done);
    return () => { window.clearTimeout(start); request.current?.abort(); window.removeEventListener("message", done); if (timer.current) clearInterval(timer.current); };
  }, [check, english]);
  function connect() {
    setNotice("");
    popup.current = window.open("/api/kitsolo/connect/", "kitsolo-connect", "popup,width=640,height=780");
    if (!popup.current) { setNotice(english ? "Allow popups, or use the link below to connect in a new tab." : "浏览器阻止了弹窗，可允许弹窗或使用下方链接在新标签页关联。"); return; }
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => { if (popup.current?.closed) { if (timer.current) clearInterval(timer.current); timer.current = null; void check(); } }, 500);
  }
  const connected = status === "connected";
  const label = status === "loading" ? (english ? "Checking…" : "检查中…") : connected ? (english ? "Connected" : "已关联") : status === "unavailable" ? (english ? "Status unavailable" : "暂时无法查询关联状态") : (english ? "Not connected" : "未关联");
  return <div className="flex min-w-0 w-full flex-col gap-2 text-xs" data-testid="kitsolo-connect">
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      <Badge role="status" tone={connected ? "accent" : status === "unavailable" ? "warn" : "neutral"} dot>{label}</Badge>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {!compact && <ActionButton variant="ghost" size="sm" onClick={() => void check()}>{english ? "Refresh status" : "刷新状态"}</ActionButton>}
        <ActionButton variant={connected ? "secondary" : "primary"} size="sm" onClick={connect} disabled={status === "loading"}>{connected ? (english ? "Reconnect" : "重新连接") : english ? "Connect" : "连接"}</ActionButton>
        {trailing}
      </div>
    </div>
    {notice && <span className="w-full leading-relaxed text-[var(--ink-soft)]" role="status">{notice} <a href="/api/kitsolo/connect/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline underline-offset-2">{english ? "Open connection page" : "打开关联页面"}</a></span>}
  </div>;
}

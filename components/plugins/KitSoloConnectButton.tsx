"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export function KitSoloConnectButton({ english = false, compact = false }: { english?: boolean; compact?: boolean }) {
  const [status, setStatus] = useState<"loading" | "connected" | "none" | "unavailable">("loading"), [notice, setNotice] = useState("");
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
  return <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="kitsolo-connect">
    <button type="button" className="rounded-lg border border-current px-3 py-2" onClick={connect} disabled={status === "loading"}>{status === "connected" ? (english ? "Connected · Reconnect" : "已连接 · 重新连接") : english ? "Connect" : "连接"}</button>
    {!compact && <button type="button" className="rounded-lg px-2 py-2 opacity-70" onClick={() => void check()}>{english ? "Refresh status" : "刷新状态"}</button>}
    {status === "unavailable" && <span role="status">{english ? "Service unavailable" : "暂时无法查询关联状态"}</span>}
    {notice && <span className="w-full" role="status">{notice} <a href="/api/kitsolo/connect/" target="_blank" rel="noopener noreferrer" className="underline">{english ? "Open connection page" : "打开关联页面"}</a></span>}
  </div>;
}

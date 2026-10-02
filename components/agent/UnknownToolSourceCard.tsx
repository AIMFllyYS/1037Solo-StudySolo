"use client";

import { useEffect, useState } from "react";
import type { SummaryUnknownToolRef } from "@/lib/storage/sessionSummary";
import { loadTurnsBefore } from "@/lib/storage/chatStorage";
import { getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";

export default function UnknownToolSourceCard({ sessionId, item }: { sessionId: string; item: SummaryUnknownToolRef }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState<{ key: string; text: string } | null>(null);
  const [error, setError] = useState(false);
  const key = `${getStorageOwner()}:${getOwnerEpoch()}:${sessionId}:${item.messageId}:${item.partIndex}`;

  useEffect(() => {
    if (!open) return;
    let active = true;
    const owner = getStorageOwner(), epoch = getOwnerEpoch();
    void loadTurnsBefore(sessionId, item.turn + 1, 1).then((window) => {
      if (!active || getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
      const message = window?.messages[item.messageIndex - (window?.startIndex ?? 0)];
      const part = message?.id === item.messageId ? message.parts[item.partIndex] : null;
      if (!part || part.type !== item.type) { setError(true); return; }
      setRaw({ key, text: JSON.stringify(part, null, 2) });
      setError(false);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [open, sessionId, item, key]);

  return (
    <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] p-2.5">
      <button type="button" className="press text-left text-[13px] text-[var(--ink)]" aria-expanded={open} onClick={() => { if (open) setRaw(null); setOpen(!open); }}>
        {item.type} · 第 {item.turn + 1} 轮 {open ? "收起" : "查看原始记录"}
      </button>
      {open ? <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[var(--bg-muted)] p-2 text-[11px] text-[var(--ink-soft)]">
        {error ? "原始记录暂不可读取，请稍后重试。" : raw?.key === key ? raw.text : "正在读取原始记录…"}
      </pre> : null}
    </div>
  );
}

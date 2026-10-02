"use client";

import { useCallback, useState } from "react";
import { Share2 } from "lucide-react";
import ShareDialog from "@/components/share/ShareDialog";
import { useAuthSession } from "@/lib/hooks/useAuthSession";
import { loadArtifactFull } from "@/lib/stores/artifacts";
import { useChatHistory } from "@/lib/stores/chatHistory";
import { loadSessionMessages } from "@/lib/storage/chatStorage";
import { useToast } from "@/lib/stores/toast";
import { buildSharedSnapshot } from "@/lib/share/snapshot";
import type { SharedArtifact } from "@/lib/share/types";
import { useT } from "@/lib/i18n";

/** 从会话元信息 + 本机 artifacts 拼出要上传的快照。抽出来是因为它要读 store 的当前值。 */
async function collectArtifacts(artifactIds: string[]): Promise<SharedArtifact[]> {
  const artifacts = await Promise.all(artifactIds.map(loadArtifactFull));
  if (artifacts.some((artifact) => !artifact)) throw new Error("artifact_body_unavailable");
  return artifacts
    .filter((art): art is NonNullable<typeof art> => Boolean(art))
    .map((art) => ({ id: art.id, title: art.title, html: art.html, status: art.status }));
}

/**
 * Agent 对话页顶栏的「分享」入口（与 Perplexity 的 Share 同位置：全屏左侧，来源开关右侧）。
 *
 * 点它**不直接发请求**，而是先开确认弹窗：分享是不可逆的信息外流，得让用户看清楚会外流什么。
 * 未登录、空对话仍然在**开弹窗前**就拦掉 —— 弹一个按不动的确认框没有意义。
 */
export default function ShareButton() {
  const t = useT();
  const showToast = useToast((s) => s.show);
  const { status } = useAuthSession();
  const activeSessionId = useChatHistory((s) => s.activeSessionId);
  const sessionsMeta = useChatHistory((s) => s.sessionsMeta);
  const messagesById = useChatHistory((s) => s.messagesById);
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    if (status !== "signedIn") {
      showToast(t("share.loginRequired"));
      return;
    }
    const meta = sessionsMeta.find((item) => item.id === activeSessionId);
    // 窗口化后 messagesById 可能只是尾部窗口：空判看 manifest 的 messageCount。
    if (!meta || meta.messageCount === 0) {
      showToast(t("share.empty"));
      return;
    }
    setOpen(true);
  }, [activeSessionId, sessionsMeta, showToast, status, t]);

  /** 弹窗按下确认后才走到这里：打快照 → POST → 把 url 交回弹窗展示（复制在弹窗里做）。 */
  const createShare = useCallback(async (): Promise<string> => {
    const meta = sessionsMeta.find((item) => item.id === activeSessionId);
    // 分享快照必须是完整会话：窗口外轮次也要进快照，直接全量装配读。
    // 存储读不到时才退回内存窗口，且窗口必须覆盖 messageCount（证明不是尾部截断）。
    const stored = activeSessionId ? await loadSessionMessages(activeSessionId) : null;
    const windowMessages = (activeSessionId ? messagesById[activeSessionId] : undefined) ?? [];
    const messages = stored?.length
      ? stored
      : windowMessages.length >= (meta?.messageCount ?? 0)
        ? windowMessages
        : [];
    if (!meta || messages.length === 0) throw new Error("empty");
    // 顶层 title / sourceClientId 由 buildSharedSnapshot 从 meta 取，不另传入参。
    const payload = buildSharedSnapshot({
      meta,
      messages,
      artifacts: await collectArtifacts(meta.artifactIds),
    });
    const response = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceClientId: meta.id, title: meta.title, payload }),
    });
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as { url?: unknown };
    const url = typeof data.url === "string" ? data.url : "";
    if (!url) throw new Error("no-url");
    return url;
  }, [activeSessionId, messagesById, sessionsMeta]);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title={t("share.action")}
        aria-label={t("share.action")}
        data-testid="share-conversation"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
      >
        <Share2 size={18} />
      </button>
      {/* 打开时才挂载：弹窗状态（确认 / 生成中 / 已生成）天然每次都是干净的。 */}
      {open ? <ShareDialog onClose={() => setOpen(false)} onConfirm={createShare} /> : null}
    </>
  );
}

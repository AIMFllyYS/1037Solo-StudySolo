"use client";

import { use } from "react";
import Link from "next/link";
import AgentChatCenter from "@/components/agent/AgentChatCenter";
import { useOpenSessionById } from "@/lib/hooks/chat/useOpenSessionById";
import { useT } from "@/lib/i18n";

interface ChatDeepLinkPageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * `/c/<sessionId>`：一条对话的深链，落点就是 Agent 工作区里「这条对话」。
 *
 * 为什么整页是客户端组件：对话只存在本机（zustand + IndexedDB），云端只是同步副本，
 * 「把这条设为当前对话」在服务端无事可做。Next 16 的 `params` 是 Promise，
 * 客户端页面要用 `use()` 解（Next 的 ClientPageRoot 就是给客户端页面传 `Promise.resolve(params)`；
 * 仓库里另外两个动态路由是服务端页面，所以用的是 `await params`）。
 *
 * 外壳（顶栏 / 左栏 / 右侧工作区）由 `app/c/layout.tsx` 的 AgentShell 与顶层 AppShell 提供，
 * 这里只管「打开这条对话」这一个状态机：成功后渲染与 `/agent` 同一个 AgentChatCenter。
 * 注意客户端页面不能导出 `metadata`，站点标题沿用根布局。
 */
export default function ChatDeepLinkPage({ params }: ChatDeepLinkPageProps) {
  const { sessionId } = use(params);
  const t = useT();
  const { status } = useOpenSessionById(sessionId);

  if (status === "loading") {
    return (
      <section
        data-testid="chat-deep-link-loading"
        className="flex h-full min-h-0 items-center justify-center px-6 text-center"
      >
        <p className="text-[13px] text-[var(--ink-soft)]">{t("share.route.loading")}</p>
      </section>
    );
  }

  if (status === "notFound") {
    return (
      <section
        data-testid="chat-deep-link-not-found"
        className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p className="text-[13px] text-[var(--ink-soft)]">{t("share.route.notFound")}</p>
        <Link
          href="/agent"
          className="press rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2 text-[13px] font-medium text-[var(--md-sys-color-on-primary)]"
        >
          {t("share.route.backToAgent")}
        </Link>
      </section>
    );
  }

  return <AgentChatCenter />;
}

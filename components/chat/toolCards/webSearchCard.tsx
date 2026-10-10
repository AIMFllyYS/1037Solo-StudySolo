"use client";

import WebSourceFold from "@/components/chat/trace/WebSourceFold";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";
import { webSearchProviderChips } from "@/lib/chat/sources/webSearchDisplay";

/**
 * 联网搜索卡：把工具 part 的全部状态映射到来源折板。
 * - 运行中 / preliminary 部分结果 → live 卡（供应商脉冲点 + 骨架来源卡）
 * - output-available → 来源走马灯 + 可展开清单
 * - output-error → 灰态卡 + 失败原因
 * - denied → 不渲染（同意流里用户明确拒绝了）
 */
export default function WebSearchResultCard({ part }: ResultCardProps<"webSearch">) {
  if (part.state === "output-denied") return null;
  if (part.state === "approval-responded" && !part.approval.approved) return null;
  const output = part.state === "output-available" ? part.output : null;
  const errorText = part.state === "output-error" ? String(part.errorText ?? "") : undefined;
  // output-error 是终态：不算 live（不转「正在搜索」/骨架），走灰态失败卡。
  const live = part.state !== "output-error" && (part.state !== "output-available" || Boolean(part.preliminary));
  const sources = output?.sources ?? [];
  if (!live && !sources.length && !errorText) return null;
  return (
    <WebSourceFold
      sources={sources}
      cacheHit={output?.cacheHit}
      live={live}
      errorText={errorText}
      chips={webSearchProviderChips({ input: part.input, output, running: live, errorText })}
    />
  );
}

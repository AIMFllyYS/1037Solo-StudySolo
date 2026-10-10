// 联网搜索**展示层**的纯函数助手：host 提取、favicon 解析、供应商状态点。
//
// 与 `lib/ai/search/`（数据层，并行开发中）分工：这里只消费工具 part 的
// input/output 形状，不依赖服务端能力；planned 推断与 policy.planSearchProviders
// 同序，但客户端拿不到各家 key 的可用性，所以只能给「计划态」，不是「已搜态」。

import { looksAcademic } from "@/lib/ai/search/policy";
import type { WebSearchProgress, WebSearchProvider } from "@/lib/ai/agent/tools/webSearch/types";

export { PROVIDER_LABELS as WEB_SEARCH_PROVIDER_LABELS } from "@/lib/ai/search/policy";

const PROVIDER_SET = new Set<string>(["kimi", "zhipu", "perplexity"]);

export function isWebSearchProvider(value: unknown): value is WebSearchProvider {
  return typeof value === "string" && PROVIDER_SET.has(value);
}

/**
 * 这次调用**预计**会搜哪些供应商（运行中占位脉冲态用）。
 * 顺序镜像 `lib/ai/search/policy.ts` 的 planSearchProviders：
 * 显式点名 > comprehensive 三家 > academic(PPLX+Kimi) > daily/auto(Kimi+智谱)。
 * 差别只在 `available`：服务端按已配置 key 过滤，客户端拿不到，这里给全量计划。
 */
export function plannedWebSearchProviders(input?: {
  query?: string;
  mode?: string;
  providers?: readonly (string | undefined | null)[] | null;
} | null): WebSearchProvider[] {
  const explicit = (input?.providers ?? []).filter(isWebSearchProvider);
  if (explicit.length) return explicit;
  const mode = input?.mode;
  if (mode === "comprehensive") return ["kimi", "zhipu", "perplexity"];
  if (mode === "academic") return ["perplexity", "kimi"];
  if (mode === "daily") return ["kimi", "zhipu"];
  // auto / 缺省：与策略同一套信号词猜测，日常问题走便宜通道。
  return input?.query && looksAcademic(input.query) ? ["perplexity", "kimi"] : ["kimi", "zhipu"];
}

/** 网页来源的展示域名：剥 www.，解析失败返回空串（调用方决定兜底文案）。 */
export function webSourceHost(url?: string | null): string {
  try {
    return new URL(url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** http(s) 以外的 scheme 不进 <img>/href——搜索结果里的脏 URL 不得变成加载入口。 */
function safeHttpUrlValue(url?: string | null): string {
  const trimmed = (url ?? "").trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

/**
 * 来源 favicon：优先供应商给的 icon（智谱自带），否则按域名走 Google s2 服务；
 * 拉取失败由组件层换成首字母占位。
 */
export function webSourceFavicon(source: { icon?: string }, host: string): string {
  const icon = safeHttpUrlValue(source.icon);
  if (icon) return icon;
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : "";
}

// ── 供应商状态点 ─────────────────────────────────────────────

export type ProviderChipState = "running" | "done" | "skipped";

export interface ProviderChip {
  provider: WebSearchProvider;
  state: ProviderChipState;
  /** skipped 时的原因（上游报错 / 未配置 / 模式未选用），进 title。 */
  reason?: string;
}

interface WebSearchOutputLike {
  providers?: WebSearchProvider[];
  skipped?: { provider: WebSearchProvider; reason: string }[];
  /** 数据层渐进状态（preliminary/最终结果都带），优先于 providers/skipped 字段。 */
  progress?: WebSearchProgress;
}

/** 数据层实态 → 展示层点态；stage=done 后残留的 pending 按未返回处理。 */
function progressChipState(state: "pending" | "done" | "error", finished: boolean): ProviderChipState {
  if (state === "done") return "done";
  if (state === "error") return "skipped";
  return finished ? "skipped" : "running";
}

/**
 * 解析一次 webSearch 调用该显示哪些供应商点。
 *
 * - `running`（含 preliminary 部分结果）：计划源 = 脉冲；若数据层已回执
 *   `output.providers`/`skipped`，已完成源转勾、失败源转灰——渐进事件接上即亮起。
 * - 完成且无回执：不显示（不拿「计划」冒充「已搜」）。
 * - `errorText`（整次调用失败）：计划源全部灰态 + 原因。
 */
export function webSearchProviderChips(args: {
  input?: { query?: string; mode?: string; providers?: readonly (string | undefined | null)[] | null } | null;
  output?: WebSearchOutputLike | null;
  running: boolean;
  errorText?: string;
}): ProviderChip[] {
  const planned = plannedWebSearchProviders(args.input);
  if (args.errorText != null) {
    return planned.map((provider) => ({ provider, state: "skipped", reason: args.errorText }));
  }
  const progressProviders = args.output?.progress?.providers;
  if (progressProviders?.length) {
    const finished = !args.running || args.output?.progress?.stage === "done";
    return progressProviders
      .filter((item) => isWebSearchProvider(item.id))
      .map((item) => ({
        provider: item.id as WebSearchProvider,
        state: progressChipState(item.state, finished),
      }));
  }
  const used = (args.output?.providers ?? []).filter(isWebSearchProvider);
  const skipped = args.output?.skipped ?? [];
  if (args.running) {
    const doneSet = new Set(used);
    const reasonOf = new Map(skipped.map((item) => [item.provider, item.reason]));
    return planned.map((provider) =>
      reasonOf.has(provider)
        ? { provider, state: "skipped", reason: reasonOf.get(provider) }
        : doneSet.has(provider)
          ? { provider, state: "done" }
          : { provider, state: "running" },
    );
  }
  if (!used.length && !skipped.length) return [];
  const usedSet = new Set(used);
  return [
    ...used.map((provider): ProviderChip => ({ provider, state: "done" })),
    ...skipped
      .filter((item) => isWebSearchProvider(item.provider) && !usedSet.has(item.provider))
      .map((item): ProviderChip => ({ provider: item.provider, state: "skipped", reason: item.reason })),
  ];
}

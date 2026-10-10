import { selectCustomApiGroupsForRequest } from "@/lib/ai/models";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useRecordPreviews } from "@/lib/stores/learning/recordPreviews";
import { useSettings } from "@/lib/stores/settings";
import { getSubject, getCategory, getContentItem } from "@/lib/content-data";
import { isSubjectId } from "@/lib/types/content";
import { parseSseJsonEvents } from "@/lib/utils/sseEvents";
import type { ReviewCardContext, RecordCardAI, RecordMode } from "@/lib/review/types";

// 「记录」编排：所有入口（划词 / 右键消息 / 复习板内划词）统一走这里。
//   1. startRecord：先把原文落库为 saved 卡（绝不丢）+ 弹出预览浮窗；
//   2. 用户在浮窗选择模式后调 processRecord → SSE 流式处理（思考 + 内容）→ finalize / markError；
//   3. reviseRecord：对已生成卡片按用户指令流式优化，失败回滚旧内容。

const MAX_CHARS = 6000;

function clamp(text: string): string {
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}

function aiRequestExtras() {
  // 摘录功能使用独立的 recordModelId（默认中转站 DeepSeek V4 Flash），
  // 不再跟随主对话的 selectedModelId —— 避免右侧切换自定义模型时
  // 摘录因密钥/协议不匹配而报错。只发 recordModelId 所属的那一个分组。
  const settings = useSettings.getState();
  return {
    modelId: settings.recordModelId,
    customApiGroups: selectCustomApiGroupsForRequest(settings.customApiGroups, settings.recordModelId),
  };
}

function ctxNames(ctx: ReviewCardContext) {
  const sid = isSubjectId(ctx.subjectId) ? ctx.subjectId : null;
  const subjectName = sid ? getSubject(sid)?.name ?? "" : "";
  const categoryName = sid && ctx.categoryId ? getCategory(sid, ctx.categoryId)?.name ?? "" : "";
  const itemLabel =
    sid && ctx.categoryId && ctx.itemId
      ? getContentItem(sid, ctx.categoryId, ctx.itemId)?.title ?? ""
      : "";
  return { subjectName, categoryName, itemLabel };
}

interface RecordSseEvent {
  type?: string;
  delta?: string;
  card?: RecordCardAI;
  model?: string;
  message?: string;
}

export interface ProcessCallbacks {
  onReasoning?: (delta: string) => void;
  onContent?: (delta: string) => void;
}

/**
 * 流式处理一张卡片：标记 processing → SSE 请求 /api/record → 逐 delta 回调 → finalize / markError。
 * options.currentCard 存在时为「优化」模式（revise），否则为「新建」模式。
 */
export async function processRecord(
  cardId: string,
  mode: RecordMode,
  options?: { userInstruction?: string; currentCard?: RecordCardAI },
  callbacks?: ProcessCallbacks,
  signal?: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  const card = useReviewCards.getState().byId[cardId];
  if (!card) return { ok: false, error: "卡片不存在" };

  const store = useReviewCards.getState();
  store.markProcessing(cardId, mode);

  const { subjectName, categoryName, itemLabel } = ctxNames(card);

  try {
    const resp = await fetch("/api/record", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        text: clamp(card.originalText),
        userInstruction: options?.userInstruction,
        currentCard: options?.currentCard,
        subjectName,
        categoryName,
        itemLabel,
        ...aiRequestExtras(),
      }),
    });

    if (!resp.ok || !resp.body) {
      const errorText = await resp.text().catch(() => "");
      let msg = `成卡失败（${resp.status}）`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.error) msg = parsed.error;
      } catch { /* not JSON */ }
      store.markError(cardId, msg);
      return { ok: false, error: msg };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let resultCard: RecordCardAI | null = null;
    let resultModel = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSseJsonEvents<RecordSseEvent>(buffer);
      buffer = remaining;

      for (const event of events) {
        switch (event.type) {
          case "reasoning":
            callbacks?.onReasoning?.(event.delta || "");
            break;
          case "content":
            callbacks?.onContent?.(event.delta || "");
            break;
          case "result":
            if (event.card) resultCard = event.card;
            if (event.model) resultModel = event.model;
            break;
          case "error":
            store.markError(cardId, event.message || "成卡失败");
            return { ok: false, error: event.message || "成卡失败" };
          case "done":
            break;
        }
      }
    }

    if (resultCard) {
      store.finalize(cardId, resultCard, resultModel);
      return { ok: true };
    }
    store.markError(cardId, "成卡结果为空");
    return { ok: false, error: "成卡结果为空" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: err.message || "aborted" };
    }
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: err.message || "aborted" };
    }
    const message = err instanceof Error ? err.message : "网络异常，成卡失败";
    store.markError(cardId, message);
    return { ok: false, error: message };
  }
}

/** 发起一次「记录」：落库原文 → 开预览窗（不触发 AI，等用户选模式）。返回卡片 id。 */
export function startRecord(
  text: string,
  ctx: ReviewCardContext,
  anchor: { x: number; y: number },
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const cardId = useReviewCards.getState().addSaved(trimmed, ctx);
  useRecordPreviews.getState().open(cardId, anchor);
  return cardId;
}

/** 重试成卡（预览窗「重做」按钮调用）：用卡片已有的模式重新处理。 */
export async function retryRecord(
  cardId: string,
  callbacks?: ProcessCallbacks,
  signal?: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  const card = useReviewCards.getState().byId[cardId];
  if (!card) return { ok: false, error: "卡片不存在" };
  const mode = card.mode || "excerpt";
  return processRecord(cardId, mode, {}, callbacks, signal);
}

/**
 * 按用户指令让 AI 优化一张已生成的卡片（流式）。
 * 关键：先暂存当前卡内容，优化失败时回滚为 ready（绝不把已好的卡变成 error 丢失内容）。
 */
export async function reviseRecord(
  cardId: string,
  instruction: string,
  callbacks?: ProcessCallbacks,
  signal?: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = instruction.trim();
  const card = useReviewCards.getState().byId[cardId];
  if (!card) return { ok: false, error: "卡片不存在" };
  if (!trimmed) return { ok: false, error: "请先输入优化要求" };
  if (card.status !== "ready") return { ok: false, error: "请等卡片就绪后再优化" };

  const mode = card.mode || "excerpt";

  const prevAi: RecordCardAI = {
    mode,
    cardType: card.cardType,
    front: card.front,
    back: card.back,
    blanks: card.blanks,
    explanation: card.explanation,
  };
  const prevModel = card.model || "";

  const result = await processRecord(
    cardId,
    mode,
    { userInstruction: trimmed, currentCard: prevAi },
    callbacks,
    signal,
  );

  if (!result.ok) {
    useReviewCards.getState().finalize(cardId, prevAi, prevModel);
    return result;
  }
  return { ok: true };
}

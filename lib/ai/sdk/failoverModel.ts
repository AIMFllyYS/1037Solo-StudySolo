import { recordModelFailure } from './diagnostics.server';
// endpoints 链容灾：把多个 LanguageModelV4 串成一个模型，主端点在「尚未产出任何 chunk」
// 时失败（可恢复的 5xx / 特定 400 code / 首字节超时）则切到下一个；一旦开始流式输出就不再切换，
// 避免把两个端点的半截回答拼在一起。
//
// 也承载生图模式「文本模型不可用 → 降级到备用文本模型」的场景（链就是 [primary, fallback]）。

import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { APICallError } from "@ai-sdk/provider";
import { CreditAdmissionError } from "@/lib/billing/centralCredits";
import {isUncertainProviderOutcome} from '@/lib/billing/providerOutcome';
import { isRecoverableUpstreamFailure, parseUpstreamErrorBody, isFetchAbortError } from "@/lib/ai/upstream";

export interface FailoverCandidate {
  model: LanguageModelV4;
  /** 供 onFailover 回调展示（如 apiModelId）。 */
  label: string;
}

export interface FailoverOptions {
  /** 切换到下一候选时触发；index 为新候选在链中的下标。 */
  onFailover?: (next: FailoverCandidate, index: number, error: unknown) => void;
  /** 某候选真正开始产出（doGenerate 返回 / doStream 首个非 error chunk）时触发。 */
  onLanded?: (landed: FailoverCandidate, index: number) => void;
  /** 自定义可恢复判定；默认按 upstream.ts 的规则。 */
  isRecoverable?: (error: unknown) => boolean;
  /**
   * 首字节超时（毫秒）：doStream 在该时间内未拿到首个 chunk（doGenerate 未返回）视为端点不可用，
   * 切到下一候选。与用户主动取消区分：只有本模型内部触发的超时才算可恢复。
   */
  firstChunkTimeoutMs?: number;
  /**
   * 每一跳发出前改写 callOptions。用于按该候选的思考方言替换冻在 Agent 上的
   * providerOptions；不传则每跳复用同一份 callOptions（旧行为）。
   */
  prepareCall?: (index: number, callOptions: LanguageModelV4CallOptions) => LanguageModelV4CallOptions;
}

/** 默认判定：上游 502/503/504、智谱/SF 的可恢复 400 code、以及网络层错误。 */
export function defaultIsRecoverable(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 0;
    const code = error.responseBody ? parseUpstreamErrorBody(error.responseBody).errorCode : undefined;
    return isRecoverableUpstreamFailure(status, code);
  }
  if (error instanceof Error && /fetch failed|ECONNRESET|ENOTFOUND|ECONNREFUSED/i.test(error.message)) {
    return true;
  }
  return false;
}

interface Attempt {
  signal: AbortSignal | undefined;
  timedOut: () => boolean;
  clear: () => void;
}

function startAttempt(userSignal: AbortSignal | undefined, timeoutMs: number | undefined): Attempt {
  if (!timeoutMs) return { signal: userSignal, timedOut: () => false, clear: () => {} };
  const ctrl = new AbortController();
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
    ctrl.abort(new DOMException("首字节超时", "TimeoutError"));
  }, timeoutMs);
  return {
    signal: userSignal ? AbortSignal.any([userSignal, ctrl.signal]) : ctrl.signal,
    timedOut: () => fired,
    clear: () => clearTimeout(timer),
  };
}

export function createFailoverLanguageModel(
  candidates: FailoverCandidate[],
  options: FailoverOptions = {},
): LanguageModelV4 {
  if (candidates.length === 0) throw new Error("createFailoverLanguageModel: 至少需要一个候选模型");
  if (candidates.length === 1 && !options.firstChunkTimeoutMs) return candidates[0].model;

  const primary = candidates[0].model;
  const isRecoverable = options.isRecoverable ?? defaultIsRecoverable;

  // 用户主动取消不触发切换；本模型内部的首字节超时或可恢复的上游错误才切换。
  const shouldFailover = (error: unknown, attempt: Attempt, userSignal: AbortSignal | undefined, index: number) => {
    if(isUncertainProviderOutcome(error))return false;
    if (error instanceof CreditAdmissionError) return false;
    if (index >= candidates.length - 1) return false;
    if (userSignal?.aborted) return false;
    if (attempt.timedOut()) return true;
    if (isFetchAbortError(error)) return false;
    return isRecoverable(error);
  };

  const hopOptions = (index: number, callOptions: LanguageModelV4CallOptions, signal: AbortSignal | undefined) => {
    const prepared = options.prepareCall?.(index, callOptions) ?? callOptions;
    return { ...prepared, abortSignal: signal };
  };

  return {
    specificationVersion: "v4",
    provider: primary.provider,
    modelId: primary.modelId,
    supportedUrls: primary.supportedUrls,

    async doGenerate(callOptions: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
      let lastError: unknown;
      for (let i = 0; i < candidates.length; i++) {
        const attempt = startAttempt(callOptions.abortSignal, options.firstChunkTimeoutMs);
        try {
          const result = await candidates[i].model.doGenerate(hopOptions(i, callOptions, attempt.signal));
          options.onLanded?.(candidates[i], i);
          return result;
        } catch (err) {
          recordModelFailure(candidates[i].label,'generate',err);
          lastError = err;
          if (!shouldFailover(err, attempt, callOptions.abortSignal, i)) throw err;
          options.onFailover?.(candidates[i + 1], i + 1, err);
        } finally {
          attempt.clear();
        }
      }
      throw lastError;
    },

    async doStream(callOptions: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
      let lastError: unknown;
      for (let i = 0; i < candidates.length; i++) {
        const attempt = startAttempt(callOptions.abortSignal, options.firstChunkTimeoutMs);
        let result: LanguageModelV4StreamResult;
        let first: ReadableStreamReadResult<LanguageModelV4StreamPart>;
        let reader: ReadableStreamDefaultReader<LanguageModelV4StreamPart> | undefined;
        const prelude: LanguageModelV4StreamPart[] = [];
        try {
          result = await candidates[i].model.doStream(hopOptions(i, callOptions, attempt.signal));
          // doStream 成功返回并不代表上游已开始输出：部分 provider 把 HTTP 错误延后成流内 error part，
          // 因此窥探首个 chunk（首字节超时也覆盖到这里）。
          reader = result.stream.getReader();
          // SDK stream-start is synthetic: it does not prove upstream activity.
          // Keep the deadline through framing/metadata, and race even streams
          // which ignore abort. Cancellation must never block the next attempt.
          for (;;) {
            const activeReader = reader;
            const signal = attempt.signal;
            let unbind = () => {};
            try {
              first = await Promise.race([
                activeReader.read(),
                new Promise<never>((_, reject) => {
                  if (!signal) return;
                  const abort = () => reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
                  if (signal.aborted) abort();
                  else { signal.addEventListener('abort', abort, { once: true }); unbind = () => signal.removeEventListener('abort', abort); }
                }),
              ]);
            } finally { unbind(); }
            if (first.done) throw new Error('模型流已结束，但尚未产生有效响应，原对话保留。');
            if (first.value.type === 'error') throw first.value.error;
            if (['tool-call', 'tool-input-start', 'finish'].includes(first.value.type) || (['text-delta','reasoning-delta','tool-input-delta'].includes(first.value.type)&&'delta' in first.value&&typeof first.value.delta==='string'&&first.value.delta.length>0)) break;
            if (prelude.length >= 32) throw new Error('模型响应包含过多控制事件，未开始有效输出。');
            prelude.push(first.value);
          }
        } catch (err) {
          recordModelFailure(candidates[i].label,'stream',err);
          attempt.clear();
          void reader?.cancel(err).catch(() => {});
          lastError = err;
          if (!shouldFailover(err, attempt, callOptions.abortSignal, i)) throw err;
          options.onFailover?.(candidates[i + 1], i + 1, err);
          continue;
        }
        attempt.clear();

        options.onLanded?.(candidates[i], i);

        // 把窥探过的首个 chunk 放回流头。
        const replayed = new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of prelude) controller.enqueue(part);
            if (!first.done) controller.enqueue(first.value);
            else controller.close();
          },
          async pull(controller) {
            const { done, value } = await reader!.read();
            if (done) controller.close();
            else { if(value.type==='error')recordModelFailure(candidates[i].label,'stream',value.error);controller.enqueue(value); }
          },
          cancel(reason) {
            return reader!.cancel(reason);
          },
        });
        return { ...result, stream: replayed };
      }
      throw lastError;
    },
  };
}

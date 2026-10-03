// Agent 生命周期 JSONL 日志：用 AI SDK 钩子落盘，只做密钥剥离，并在 End 钩子上叠加分段耗时。
// 服务端 → 仓库 log/；Electron 子进程 → userData/logs（由主进程注入 ELECTRON_USER_DATA）。

import fs from "node:fs";
import path from "node:path";
import type { LanguageModelMiddleware, TelemetryOptions } from "ai";

export const AGENT_LOG_FILENAME = "agent-lifecycle.jsonl";

const SECRET_ENV_NAMES = [
  "RELAY_API_KEY",
  "AI_API_KEY",
  "MIMO_API_KEY",
  "ZHIPU_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

const SECRET_KEY =
  /^(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|passwd|bearer|x-api-key|x-auth-token|token)$/i;

/** 超过该耗时的工具在日志里标 `slow: true`，便于按字段筛慢工具。 */
export const SLOW_TOOL_MS = 1_000;

export type AgentLogWriter = (hook: string, data: unknown) => void;
export type AgentLogClock = () => number;

export interface AgentLogRecord {
  ts: string;
  hook: string;
  data: unknown;
}

export function resolveAgentLogPath(
  env: Partial<NodeJS.ProcessEnv> = process.env,
  cwd: string = process.cwd(),
): string {
  const override = env.AGENT_LOG_PATH?.trim();
  if (override) return override;
  const userData = env.ELECTRON_USER_DATA?.trim();
  if (userData) return path.join(userData, "logs", AGENT_LOG_FILENAME);
  return path.join(cwd, "log", AGENT_LOG_FILENAME);
}

export function collectEnvSecrets(env: Partial<NodeJS.ProcessEnv> = process.env): string[] {
  const secrets: string[] = [];
  for (const name of SECRET_ENV_NAMES) {
    const value = env[name]?.trim();
    if (value && value.length >= 8) secrets.push(value);
  }
  return secrets;
}

export function toJsonSafe(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const walk = (node: unknown): unknown => {
    if (node == null) return node;
    if (typeof node === "string" || typeof node === "boolean") return node;
    if (typeof node === "number") return Number.isFinite(node) ? node : String(node);
    if (typeof node === "bigint") return node.toString();
    if (typeof node === "function" || typeof node === "symbol" || typeof node === "undefined") {
      return undefined;
    }
    if (node instanceof Date) return node.toISOString();
    if (node instanceof Error) {
      return { name: node.name, message: node.message, stack: node.stack };
    }
    if (typeof Headers !== "undefined" && node instanceof Headers) {
      return Object.fromEntries(node.entries());
    }
    if (typeof node === "object") {
      if (seen.has(node)) return "[Circular]";
      seen.add(node);
      if (Array.isArray(node)) return node.map(walk);
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
        const next = walk(val);
        if (next !== undefined) out[key] = next;
      }
      return out;
    }
    return String(node);
  };
  return walk(value);
}

function redactString(value: string, secrets: string[]): string {
  let text = value;
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[REDACTED]");
  }
  return text
    .replace(/\bBearer\s+[^\s,"'\]}]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/([?&](?:api[_-]?key|key|token)=)[^&\s]+/gi, "$1[REDACTED]");
}

export function redactSecrets(value: unknown, extraSecrets: string[] = []): unknown {
  const secrets = [...collectEnvSecrets(), ...extraSecrets.filter((s) => s && s.length >= 8)];
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return redactString(node, secrets);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
        out[key] = SECRET_KEY.test(key) ? "[REDACTED]" : walk(val);
      }
      return out;
    }
    return node;
  };
  return walk(value);
}

// ── 异步批量落盘 ──
// 热路径（step/tool/llm 每轮 ~10+ 次）不再逐条同步 appendFileSync：
// 先排入内存队列，25ms 内合批后一次异步写；进程退出前把残余同步补落。

const pendingLines: { filePath: string; line: string }[] = [];
const dirsReady = new Set<string>();
let flushTimer: NodeJS.Timeout | null = null;
let writing = false;
let exitHookBound = false;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, 25);
  flushTimer.unref?.();
}

async function flushQueue(): Promise<void> {
  if (writing) {
    scheduleFlush();
    return;
  }
  writing = true;
  try {
    while (pendingLines.length) {
      const batch = pendingLines.splice(0, pendingLines.length);
      const byPath = new Map<string, string[]>();
      for (const item of batch) {
        const arr = byPath.get(item.filePath) ?? [];
        arr.push(item.line);
        byPath.set(item.filePath, arr);
      }
      for (const [filePath, lines] of byPath) {
        const dir = path.dirname(filePath);
        if (!dirsReady.has(dir)) {
          await fs.promises.mkdir(dir, { recursive: true });
          dirsReady.add(dir);
        }
        await fs.promises.appendFile(filePath, lines.join(""), "utf8");
      }
    }
  } catch {
    // 日志失败不得打断对话
  } finally {
    writing = false;
    if (pendingLines.length) scheduleFlush();
  }
}

/** 测试/关闭路径：立即排空队列（等异步写真正落盘）。 */
export function flushAgentLogQueue(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return flushQueue();
}

function bindExitFlush(): void {
  if (exitHookBound) return;
  exitHookBound = true;
  process.on("beforeExit", () => {
    for (const { filePath, line } of pendingLines.splice(0)) {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.appendFileSync(filePath, line, "utf8");
      } catch {
        // 退出期尽力而为
      }
    }
  });
}

export function appendAgentLog(hook: string, data: unknown, filePath = resolveAgentLogPath()): void {
  const record: AgentLogRecord = {
    ts: new Date().toISOString(),
    hook,
    data: redactSecrets(toJsonSafe(data)),
  };
  bindExitFlush();
  pendingLines.push({ filePath, line: `${JSON.stringify(record)}\n` });
  scheduleFlush();
}

function defaultWrite(hook: string, data: unknown): void {
  if (process.env.NODE_TEST_CONTEXT && !process.env.AGENT_LOG_PATH) return;
  appendAgentLog(hook, data);
}

/** 卫星路由上游失败：原始错误只落 JSONL，不回给前端。 */
export function logSatelliteError(route: string, error: unknown): void {
  defaultWrite("satelliteError", { route, error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPath(value: unknown, keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function elapsedMs(startedAt: number | undefined, now: AgentLogClock): number | undefined {
  if (startedAt == null) return undefined;
  return Math.max(0, now() - startedAt);
}

function mergeEvent(event: unknown, extra: Record<string, unknown>): unknown {
  if (isRecord(event)) return { ...event, ...extra };
  return { payload: event, ...extra };
}

function extractCallId(event: unknown): string | undefined {
  return asNonEmptyString(getPath(event, ["callId"]));
}

function extractStepNumber(event: unknown): number | undefined {
  return asFiniteNumber(getPath(event, ["stepNumber"]));
}

function extractToolName(event: unknown): string | undefined {
  return (
    asNonEmptyString(getPath(event, ["toolName"])) ??
    asNonEmptyString(getPath(event, ["toolCall", "toolName"]))
  );
}

function extractToolCallId(event: unknown): string | undefined {
  return (
    asNonEmptyString(getPath(event, ["toolCallId"])) ??
    asNonEmptyString(getPath(event, ["toolCall", "toolCallId"]))
  );
}

function extractResponseTimeMs(event: unknown): number | undefined {
  return (
    asFiniteNumber(getPath(event, ["performance", "responseTimeMs"])) ??
    asFiniteNumber(getPath(event, ["responseTimeMs"]))
  );
}

function extractStepTimeMs(event: unknown): number | undefined {
  return (
    asFiniteNumber(getPath(event, ["performance", "stepTimeMs"])) ??
    asFiniteNumber(getPath(event, ["stepTimeMs"]))
  );
}

function extractToolExecutionMs(event: unknown): number | undefined {
  return asFiniteNumber(getPath(event, ["toolExecutionMs"]));
}

function extractReasoningTokens(event: unknown): number | undefined {
  return (
    asFiniteNumber(getPath(event, ["usage", "outputTokens", "reasoning"])) ??
    asFiniteNumber(getPath(event, ["usage", "outputTokenDetails", "reasoningTokens"]))
  );
}

function extractOutputTokens(event: unknown): number | undefined {
  const nested = asFiniteNumber(getPath(event, ["usage", "outputTokens", "total"]));
  if (nested != null) return nested;
  const flat = getPath(event, ["usage", "outputTokens"]);
  if (typeof flat === "number") return asFiniteNumber(flat);
  return asFiniteNumber(getPath(event, ["usage", "outputTokens"]));
}

function contentHasReasoning(event: unknown): boolean {
  const content = getPath(event, ["content"]);
  if (Array.isArray(content) && content.some((part) => isRecord(part) && part.type === "reasoning")) {
    return true;
  }
  const reasoning = getPath(event, ["reasoning"]);
  if (typeof reasoning === "string" && reasoning.trim()) return true;
  if (Array.isArray(reasoning) && reasoning.length > 0) return true;
  return Boolean(asNonEmptyString(getPath(event, ["reasoningText"])));
}

function deriveThinkingMs(event: unknown, llmDurationMs: number | undefined): number | undefined {
  const responseTimeMs = extractResponseTimeMs(event) ?? llmDurationMs;
  if (responseTimeMs == null) return undefined;
  const reasoningTokens = extractReasoningTokens(event);
  const outputTokens = extractOutputTokens(event);
  if (reasoningTokens != null && reasoningTokens > 0 && outputTokens != null && outputTokens > 0) {
    return Math.round(responseTimeMs * (reasoningTokens / outputTokens));
  }
  if (contentHasReasoning(event) || (reasoningTokens != null && reasoningTokens > 0)) {
    return responseTimeMs;
  }
  return undefined;
}

export function createAgentLifecycleHooks(options?: {
  write?: AgentLogWriter;
  now?: AgentLogClock;
  slowToolMs?: number;
  /** Connected private content must not be copied into diagnostic logs. */
  metadataOnly?: boolean;
}): {
  onStepStart: (event: unknown) => void;
  onStepEnd: (event: unknown) => void;
  onStepFinish: (event: unknown) => void;
  onToolExecutionStart: (event: unknown) => void;
  onToolExecutionEnd: (event: unknown) => void;
  telemetry: TelemetryOptions;
  /** 观察 SDK `reasoning-start` / `reasoning-end`，给 thinking 段真实墙钟耗时。 */
  modelMiddleware: LanguageModelMiddleware;
} {
  const write = options?.write ?? defaultWrite;
  const now = options?.now ?? Date.now;
  const slowToolMs = options?.slowToolMs ?? SLOW_TOOL_MS;
  const llmStartedAt = new Map<string, number>();
  const toolStartedAt = new Map<string, number>();
  const stepStartedAt = new Map<number, number>();
  let thinkingWrittenThisCall = false;

  const safeWrite = (hook: string, data: unknown): void => {
    try {
      if (options?.metadataOnly && isRecord(data)) {
        const numericOnly = (value: unknown): unknown => typeof value === "number" || typeof value === "boolean" ? value : isRecord(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, numericOnly(item)]).filter(([, item]) => item !== undefined)) : undefined;
        const metadata = Object.fromEntries(["stepNumber", "durationMs", "responseTimeMs", "stepTimeMs", "toolExecutionMs", "slow", "success", "reasoningTokens"].filter(key => typeof data[key] === "number" || typeof data[key] === "boolean").map(key => [key, data[key]]));
        const toolName = extractToolName(data), toolCallId = extractToolCallId(data), callId = extractCallId(data);
        write(hook, { ...metadata, ...(toolName ? { toolName } : {}), ...(toolCallId ? { toolCallId } : {}), ...(callId ? { callId } : {}), ...(data.usage ? { usage: numericOnly(data.usage) } : {}) });
      } else write(hook, data);
    } catch {
      // 日志失败不得打断对话
    }
  };

  const writeThinking = (data: Record<string, unknown>): void => {
    thinkingWrittenThisCall = true;
    safeWrite("thinking", { event: "thinking", ...data });
  };

  const onStepStart = (event: unknown): void => {
    const stepNumber = extractStepNumber(event);
    if (stepNumber != null) stepStartedAt.set(stepNumber, now());
    safeWrite("onStepStart", event);
  };

  const onStepEnd = (event: unknown): void => {
    const stepNumber = extractStepNumber(event);
    const wall = elapsedMs(stepNumber != null ? stepStartedAt.get(stepNumber) : undefined, now);
    if (stepNumber != null) stepStartedAt.delete(stepNumber);
    const stepTimeMs = extractStepTimeMs(event);
    const durationMs = stepTimeMs ?? wall;
    safeWrite(
      "onStepEnd",
      mergeEvent(event, {
        ...(durationMs != null ? { durationMs } : {}),
        ...(stepTimeMs != null ? { stepTimeMs } : {}),
      }),
    );
  };

  const onToolExecutionStart = (event: unknown): void => {
    const id = extractToolCallId(event) ?? extractToolName(event) ?? "tool";
    toolStartedAt.set(id, now());
    safeWrite("onToolExecutionStart", event);
  };

  const onToolExecutionEnd = (event: unknown): void => {
    const toolName = extractToolName(event);
    const toolCallId = extractToolCallId(event);
    const id = toolCallId ?? toolName ?? "tool";
    const wall = elapsedMs(toolStartedAt.get(id), now);
    toolStartedAt.delete(id);
    const toolExecutionMs = extractToolExecutionMs(event);
    const durationMs = toolExecutionMs ?? wall ?? 0;
    safeWrite(
      "onToolExecutionEnd",
      mergeEvent(event, {
        event: "tool",
        durationMs,
        ...(toolName ? { toolName } : {}),
        ...(toolCallId ? { toolCallId } : {}),
        ...(toolExecutionMs != null ? { toolExecutionMs } : {}),
        slow: durationMs >= slowToolMs,
      }),
    );
  };

  const onLanguageModelCallStart = (event: unknown): void => {
    const callId = extractCallId(event) ?? "lm";
    llmStartedAt.set(callId, now());
    thinkingWrittenThisCall = false;
    safeWrite("onLanguageModelCallStart", event);
  };

  const onLanguageModelCallEnd = (event: unknown): void => {
    const callId = extractCallId(event) ?? "lm";
    const wall = elapsedMs(llmStartedAt.get(callId), now);
    llmStartedAt.delete(callId);
    const responseTimeMs = extractResponseTimeMs(event);
    const durationMs = responseTimeMs ?? wall ?? 0;
    safeWrite(
      "onLanguageModelCallEnd",
      mergeEvent(event, {
        event: "llm",
        durationMs,
        ...(responseTimeMs != null ? { responseTimeMs } : {}),
      }),
    );
    if (thinkingWrittenThisCall) return;
    const thinkingMs = deriveThinkingMs(event, durationMs);
    if (thinkingMs == null) return;
    writeThinking({
      durationMs: thinkingMs,
      callId,
      source: "usage",
      ...(extractReasoningTokens(event) != null ? { reasoningTokens: extractReasoningTokens(event) } : {}),
    });
  };

  const modelMiddleware: LanguageModelMiddleware = {
    specificationVersion: "v4",
    wrapStream: async ({ doStream }) => {
      const result = await doStream();
      const startedAt = new Map<string, number>();
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              controller.enqueue(chunk);
              if (!isRecord(chunk)) return;
              if (chunk.type === "reasoning-start") {
                startedAt.set(asNonEmptyString(chunk.id) ?? "default", now());
                return;
              }
              if (chunk.type === "reasoning-end") {
                const id = asNonEmptyString(chunk.id) ?? "default";
                const durationMs = elapsedMs(startedAt.get(id), now) ?? 0;
                startedAt.delete(id);
                writeThinking({
                  durationMs,
                  reasoningId: id,
                  source: "reasoning-stream",
                });
              }
            },
          }),
        ),
      };
    },
  };

  return {
    onStepStart,
    onStepEnd,
    // SDK 仍接受该别名；构造时优先 onStepEnd，避免同一步写两行
    onStepFinish: onStepEnd,
    onToolExecutionStart,
    onToolExecutionEnd,
    modelMiddleware,
    telemetry: {
      isEnabled: true,
      ...(options?.metadataOnly ? { recordInputs: false, recordOutputs: false } : {}),
      functionId: "study-tutor",
      integrations: [
        {
          onLanguageModelCallStart,
          onLanguageModelCallEnd,
        },
      ],
    },
  };
}

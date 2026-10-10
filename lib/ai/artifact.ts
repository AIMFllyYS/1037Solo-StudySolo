// 交互式 HTML 产物生成：用一次独立的 LLM 流式调用产出一个自包含 HTML 文档。
// 本模块只负责把上游 HTML delta 转换成 artifact 事件，由 /api/artifact 独立 SSE 路由消费。
import type { LanguageModel } from "ai";
import type { ResolvedProvider } from "@/lib/ai/provider";
import { buildCustomModelRegistryId } from "@/lib/ai/models";
import { resolveLanguageModel, type ThinkingCallSettings } from "@/lib/ai/sdk/languageModel";
import { toChatErrorMessage } from "@/lib/ai/sdk/errorMessage";
import { streamRouteText } from "@/lib/ai/sdk/routeGeneration";
import { logSatelliteError } from "@/lib/ai/observability/agentLog";
import { settleUsage } from "@/lib/billing/ledger/usageLedger";

export const ARTIFACT_SYSTEM = `你是交互式教学演示生成专家。你的唯一任务是输出一个完整、自包含的 HTML 文档。

## 严格输出规则（违反将导致渲染失败）
- 只输出 HTML 代码本身。不要输出任何解释、说明、注释、问候或总结文字。
- 不要使用 \`\`\` 代码围栏包裹输出。
- 第一个字符必须是 <!DOCTYPE html>，最后一个字符应是 </html>。
- 思考过程里不要写 HTML 正文；完整文档必须出现在最终输出里。
- 如果你输出了 HTML 以外的任何内容，系统将无法渲染演示，用户将看到空白。

## HTML 结构要求
- 必须以 <!DOCTYPE html> 开头，包含 <html lang="zh"><head><body>。
- 自写的 CSS 与 JavaScript 内联在 <style> 和 <script> 标签中。
- **允许引用常用 CDN 库**（运行环境可联网）：优先用 cdnjs / jsdelivr / unpkg 的 <script src=...> 或 <link href=...>，例如 Chart.js、D3、Three.js、ECharts、KaTeX/MathJax、GSAP、Tailwind Play CDN 等。需要图表/3D/数学排版/复杂动画时**应当**引库，不必再纯手写。
- 仅引你真正用到的库，给 <script src> 标明完整可用的 CDN 地址（带版本号）；纯 JS/SVG/Canvas 能轻松搞定的简单图形则不必引库。

## 交互与设计要求
- 面向学习者，做成可交互的（滑块/按钮/拖拽即时改变可视化），帮助直观理解给定知识点。
- **配色默认浅色系**（浅底深字，如 body 背景 #f7f8fa、正文 #1f2328）；仅当用户明确要求深色 / 暗色 / 夜间时才用深色。
- 布局自适应（width:100%）、中文文案。演示会显示在一个可缩放的浮窗里：铺满整帧的演示（canvas 动画、3D 场景）请自行改用 \`height:100vh; overflow:hidden\`，不必迁就骨架里的 padding。
- 代码精简优先：核心交互优先，避免冗余装饰；但不要为了短而砍掉演示效果，复杂演示可放心展开（约 32000 字符以内）。

## 运行环境限制
页面运行在 sandbox iframe 中，以下能力**不可用**，请勿使用，也不要围绕它们设计交互：
- 顶层导航（\`window.top.location\`、\`target="_top"\` 跳转）。
- 指针锁定 Pointer Lock（Three.js 的 \`PointerLockControls\` 这类第一人称视角控制会失效，改用 \`OrbitControls\` 等基于拖拽的控制器）。
- Presentation API。
- 持久化存储（\`localStorage\` / \`sessionStorage\` / IndexedDB）：刷新即丢，交互状态请用内存变量。
- 相对路径或同源 \`fetch\`（如 \`fetch('/api/...')\`、\`fetch('./data.json')\`）：会失败。数据请内联在 HTML / JS 里。

可正常使用（这些能力没有被砍，请放心做丰富演示）：CDN 引库、Canvas / SVG / WebGL、CSS 与 JS 动画、\`alert\`/\`confirm\`、表单、弹窗、下载。需要图表 / 3D / 数学排版 / 复杂动画时应当引 CDN 库。

## 骨架模板（可在此基础上填充）
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- 需要图表 / 3D / 数学排版 / 复杂动画时在此引 CDN，例如： -->
<!-- <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script> -->
<style>
  body { background:#f7f8fa; color:#1f2328; font-family:system-ui,sans-serif; margin:0; padding:16px; }
  /* 在此添加样式 */
</style>
</head>
<body>
  <!-- 在此添加 HTML 结构 -->
  <script>
    // 在此添加交互逻辑
  </script>
</body>
</html>`;

/** 交互 HTML 生成：深度思考常要数分钟，滑动超时 / 首字节超时都按这个量级。 */
export const ARTIFACT_IDLE_TIMEOUT_MS = 12 * 60 * 1000;
export const ARTIFACT_MAX_OUTPUT_TOKENS = 32_768;
export const ARTIFACT_THINKING_MAX_OUTPUT_TOKENS = 49_152;

export function stripFences(s: string): string {
  let t = s.trim();
  // 去掉可能的 ```html ... ``` 围栏
  t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "");
  return t.trim();
}

function looksLikeHtmlFragment(s: string): boolean {
  return /<!doctype\s+html/i.test(s) || /<html[\s>]/i.test(s) || /<body[\s>]/i.test(s);
}

function htmlStartIndex(s: string): number {
  const doctype = s.search(/<!DOCTYPE\s+html/i);
  const htmlTag = s.search(/<html[\s>]/i);
  if (doctype < 0) return htmlTag;
  if (htmlTag < 0) return doctype;
  return Math.min(doctype, htmlTag);
}

/** 取出混在解释文字里的 ```html 围栏；截断时允许围栏未闭合。 */
function extractFencedHtml(raw: string): string | undefined {
  const re = /```(?:html|htm|xml)?\s*([\s\S]*?)```/gi;
  let best: string | undefined;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const body = match[1].trim();
    if (looksLikeHtmlFragment(body) && (!best || body.length > best.length)) best = body;
  }
  if (best) return best;
  const open = raw.match(/```(?:html|htm|xml)?\s*([\s\S]*)$/i);
  if (open) {
    const body = open[1].replace(/```\s*$/, "").trim();
    if (looksLikeHtmlFragment(body)) return body;
  }
  return undefined;
}

function completeDocument(src: string): string | undefined {
  const full = src.match(/<!DOCTYPE\s+html\b[\s\S]*<\/html>/i);
  if (full) return full[0].trim();
  const html = src.match(/<html\b[\s\S]*<\/html>/i);
  if (html) return html[0].trim();
  return undefined;
}

/**
 * 从原始输出中提取 HTML 文档部分。
 * 完整文档优先；截断时从第一个 <!DOCTYPE html> / <html> 截到末尾，并识别围栏内的 HTML。
 */
export function extractHtml(raw: string): string {
  if (!raw) return raw;
  const fenced = extractFencedHtml(raw);
  for (const src of fenced ? [fenced, raw] : [raw]) {
    const complete = completeDocument(src);
    if (complete) return complete;
  }
  const from = fenced ?? raw;
  const start = htmlStartIndex(from);
  if (start >= 0) return from.slice(start).trim();
  return stripFences(raw);
}

/**
 * 收尾并“尽量修复”生成的 HTML：提取 + 去围栏 + 对被截断（达到 max_tokens 而中途停止）的文档做补救，
 * 避免未闭合的 <script>/<body>/<html> 导致 iframe 渲染整段空白。
 */
export function finalizeHtml(raw: string, truncated: boolean): string {
  let html = stripFences(extractHtml(raw));
  if (!html) return html;

  // 截断时，若停在某个标签中途（最后一个 '<' 之后没有匹配的 '>'），丢弃这半截标签。
  if (truncated) {
    const lt = html.lastIndexOf("<");
    const gt = html.lastIndexOf(">");
    if (lt > gt) html = html.slice(0, lt);
  }

  let lower = html.toLowerCase();

  // 平衡 <script>：未闭合会把后续内容全部当脚本吞掉。
  const openScript = (lower.match(/<script\b/g) || []).length;
  const closeScript = (lower.match(/<\/script>/g) || []).length;
  for (let i = 0; i < openScript - closeScript; i++) html += "\n</script>";

  lower = html.toLowerCase();
  if (!/<html[\s>]/i.test(html) && (/<!doctype\s+html/i.test(html) || /<body[\s>]/i.test(html))) {
    const doctype = html.match(/<!DOCTYPE\s+html[^>]*>/i);
    html = doctype
      ? html.replace(doctype[0], `${doctype[0]}\n<html lang="zh">`)
      : `<html lang="zh">\n${html}`;
  }

  lower = html.toLowerCase();
  if (lower.includes("<body") && !lower.includes("</body>")) html += "\n</body>";
  if (/<html[\s>]/i.test(html) && !/<\/html>/i.test(html)) html += "\n</html>";

  return html;
}

/** True when the string looks like an HTML document rather than leftover prose. */
export function looksLikeHtmlDocument(s: string): boolean {
  if (!s?.trim()) return false;
  const t = s.trim().toLowerCase();
  if (t.startsWith("<!doctype html") || t.startsWith("<html")) return true;
  if (/<!doctype\s+html/i.test(s) || /<html[\s>]/i.test(s)) return true;
  return /<body[\s>]/i.test(s) && /<(?:style|script|div|svg|canvas|input|button)[\s>]/i.test(s);
}

export type ArtifactStreamEvent =
  | { type: "artifact"; id: string; status: "start"; title: string }
  | { type: "artifact"; id: string; status: "reasoning"; delta: string }
  | { type: "artifact"; id: string; status: "delta"; delta: string }
  | { type: "artifact"; id: string; status: "done"; html: string }
  | { type: "artifact"; id: string; status: "error"; message: string };

interface StreamInteractiveArtifactOptions {
  send: (event: ArtifactStreamEvent) => void;
  artifactId: string;
  args: { title?: string; prompt?: string };
  provider: ResolvedProvider;
  /** The route passes its resolved model so endpoint failover remains intact. */
  model?: LanguageModel;
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * thinkingRequired 模型必须带上思考参数，否则上游可能空转/拒请；
   * 思考 delta 通过 reasoning 事件交给前端，避免卡片长时间 0 字符像挂死。
   */
  thinking?: ThinkingCallSettings;
}

/**
 * 流式生成交互式 HTML 产物。
 * 调用方负责把 send() 发出的事件编码为 SSE 或其他传输格式。
 */
export async function streamInteractiveArtifact(
  options: StreamInteractiveArtifactOptions,
): Promise<void> {
  const { send, artifactId, args, provider, signal, timeoutMs = provider.timeoutMs } = options;
  const title = (args.title || "交互演示").slice(0, 60);
  const prompt = (args.prompt || args.title || "").trim();

  send({ type: "artifact", id: artifactId, status: "start", title });

  if (!prompt) {
    send({ type: "artifact", id: artifactId, status: "error", message: "缺少演示描述" });
    return;
  }

  try {
    // Preserve the helper's older provider-only callers, including explicit
    // Anthropic endpoints, without resolving their credentials a second time.
    const model = options.model ?? resolveLanguageModel(
      buildCustomModelRegistryId("artifact", provider.apiModelId),
      [{
        id: "artifact", name: "Artifact", baseUrl: provider.baseUrl, apiKey: provider.apiKey,
        models: [{ id: provider.apiModelId, apiProtocol: provider.apiProtocol, thinking: false }],
      }],
    ).model;
    const thinking = options.thinking ?? {};
    const thinkingOn = !!thinking.providerOptions;
    let reasoning = "";
    const result = await streamRouteText({
      model,
      instructions: ARTIFACT_SYSTEM,
      prompt: `知识点 / 需求：${prompt}\n标题：${title}`,
      temperature: 0.4,
      // 思考 delta 会计入 max_tokens；给足额度，避免想完后正文被截成空串。
      maxOutputTokens: Math.max(
        thinkingOn ? ARTIFACT_THINKING_MAX_OUTPUT_TOKENS : ARTIFACT_MAX_OUTPUT_TOKENS,
        thinking.maxOutputTokens ?? 0,
      ),
      ...(thinking.providerOptions ? { providerOptions: thinking.providerOptions } : {}),
      abortSignal: signal,
      idleTimeoutMs: timeoutMs,
      onText: (delta) => send({ type: "artifact", id: artifactId, status: "delta", delta }),
      onReasoning: (delta) => {
        reasoning += delta;
        send({ type: "artifact", id: artifactId, status: "reasoning", delta });
      },
    });
    await settleUsage({
      rawUsage: result.usage,
      route: "/api/artifact",
      kind: "llm",
      meta: { source: "artifact", truncated: result.finishReason === "length" },
    });

    // finish_reason === "length" 表示达到 max_tokens 被截断 → 收尾时补救闭合标签。
    const truncated = result.finishReason === "length";
    const sources = [result.text, reasoning, `${reasoning}\n${result.text}`];
    let html = "";
    for (const src of sources) {
      const candidate = finalizeHtml(src, truncated);
      if (looksLikeHtmlDocument(candidate)) {
        html = candidate;
        break;
      }
    }
    if (!looksLikeHtmlDocument(html)) {
      send({
        type: "artifact",
        id: artifactId,
        status: "error",
        message: truncated ? "生成被截断且未得到完整 HTML，请重试" : "模型未输出可渲染的 HTML，请重试",
      });
      return;
    }
    send({ type: "artifact", id: artifactId, status: "done", html });
  } catch (e) {
    logSatelliteError("/api/artifact", e);
    const isAbort = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
    send({
      type: "artifact",
      id: artifactId,
      status: "error",
      message: isAbort ? "生成超时，请重试" : toChatErrorMessage(e, [provider.apiKey].filter(Boolean)),
    });
  }
}

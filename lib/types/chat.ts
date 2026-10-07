// AI 对话完整类型定义。消息主体采用 AI SDK 的 UIMessage（有序 parts），
// 在其上附加本项目的持久化字段（timestamp / attachments / followUpQuestions）。

import type { FinishReason, UIMessage, UIMessagePart } from 'ai';
import type { StudyTools } from '@/lib/ai/agent/toolTypes';

export interface WebSearchSource {
  title: string;
  url: string;
  snippet: string;
  icon?: string;
  media?: string;
  /** imageSearch 专用：Unsplash 图片描述（对应 ImageSearchResult.alt）。 */
  alt?: string;
  /** imageSearch 专用：摄影师名与主页链接（Unsplash 署名要求）。 */
  author?: string;
  authorUrl?: string;
  /** 本轮回答里的 [n] 编号；旧消息没有。 */
  citeIndex?: number;
}

/** 单次请求的 token 用量（跨工具轮次已累加）。 */
export interface UsageSummary {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
  /** 实际落地的上游模型；缺省时客户端按所选模型计价。 */
  actualModelId?: string;
}

/** 服务端经 UI Message Stream 下发的自定义 data parts。 */
export type StudyDataParts = {
  'context-compaction': { phase: 'running' | 'done'; summary?: string; coveredIds?: string[]; cloudFileIds?: string[]; createdAt?: number };
  /** 瞬时提示（如端点切换），不落库。 */
  info: { message: string };
  'context-breakdown': ContextBreakdown;
  usage: UsageSummary;
  followup: { questions: string[] };
  'answer-complete': { durationMs: number };
};

/** UIMessage.metadata：本条消息的运行元信息。 */
export interface StudyMessageMetadata {
  thinkingEnabled?: boolean;
  searchEnabled?: boolean;
  /** 上游 prefix cache 是否命中（cachedTokens > 0），不是本地 pageId hash。 */
  cacheHit?: boolean;
  /** 发起本条回复时选中的模型 id。 */
  modelId?: string;
  usage?: UsageSummary;
  /** 从发送到流结束的耗时，供思考链头部展示「已思考 N 秒」。 */
  durationMs?: number;
  /**
   * 客户端实际观察到的各推理/工具步骤耗时，key 与 buildTrace 的 step id 一致。
   * 旧消息没有这份数据时 UI 不显示步骤耗时，不使用总耗时反推。
   */
  stepDurationsMs?: Record<string, number>;
  /** 本轮生成结束原因。步数触顶时为 tool-calls。 */
  finishReason?: FinishReason;
}

export type ChatMessagePart = UIMessagePart<StudyDataParts, StudyTools>;

/** 上下文分项 token 统计（服务端按真实拼装精确计算，经 SSE 回传给上下文看板）。 */
export interface ContextBreakdown {
  /** 系统提示词：global+学科 prompt + 全局补充上下文 + 工具定义 JSON。 */
  tools: number;
  /** 技能：可调用菜单 + 固定开启全文 + 被调用的技能工具结果。 */
  skills: number;
  /** 对话：user/assistant 文本及其余工具结果。 */
  conversation: number;
  /** 笔记页面：定位+参考材料 + 读页/检索类工具结果。 */
  pages: number;
  /** 联网搜索：webSearch/imageSearch 工具结果。 */
  webSearch: number;
  /** 未垫高的实际占用。软上限判定必须用这个值。 */
  total: number;
  /** 环显示用，截断态可垫到客户端估算以免假降。 */
  displayTotal?: number;
  /** 当前请求是否因 80% 软上限而走滚动摘要 / 分级裁剪。 */
  truncated?: boolean;
  /** 上游 usage 的 cachedTokens。看板「上下文缓存」绑这个，不再绑本地 pageId hash 槽。 */
  cachedTokens?: number;
  /** 上游 prefix cache 是否命中（cachedTokens > 0）。不是本地全文 MD5 单槽。 */
  cacheHit?: boolean;
  /** 给 UI 持续展示的上下文警示。 */
  warning?: string;
}

export interface ChatImageAttachment {
  cloudFileId?: string;
  type: 'image';
  mimeType: string;
  /** data:image/png;base64,... 完整 data-url */
  base64: string;
  name?: string;
  size?: number;
}

/**
 * 对话文档的规范 MIME。源代码与没有专用 MIME 的配置文件统一使用
 * text/plain；真正允许进入文本读取链路的范围仍由扩展名白名单控制。
 */
export type ChatDocumentMimeType =
  | 'text/plain'
  | 'text/markdown'
  | 'text/html'
  | 'text/csv'
  | 'text/tab-separated-values'
  | 'text/css'
  | 'text/javascript'
  | 'text/typescript'
  | 'application/json'
  | 'application/x-ndjson'
  | 'application/xml'
  | 'application/yaml'
  | 'application/sql'
  | 'application/toml'
  | 'application/x-sh'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface ChatDocumentAttachment {
  cloudFileId?: string;
  type: 'document';
  mimeType: ChatDocumentMimeType;
  name: string;
  /** 已验证并提取出的 UTF-8 正文；DOCX 同样在进入附件列表前完成提取。 */
  text: string;
  size: number;
  characterCount: number;
}

/** 仅保存在本机、不会进入 AI 请求正文的原始文件。目前用于 PDF 本地预览。 */
export interface ChatLocalFileAttachment {
  cloudFileId?: string;
  type: 'local-file';
  mimeType: 'application/pdf' | 'application/vnd.ms-powerpoint' | 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  /** 浏览器本地读取的 data URL；持久化后正文移入 IndexedDB blob 槽。 */
  dataUrl: string;
  name: string;
  size: number;
}

export type ChatAttachment = ChatImageAttachment | ChatDocumentAttachment | ChatLocalFileAttachment;

/** Storage v2：附件正文存 chat-blob:{id}，消息内仅保留引用。 */
export interface ChatAttachmentRef {
  cloudFileId?: string;
  type: ChatAttachment['type'];
  mimeType: string;
  id: string;
  name?: string;
  size?: number;
  characterCount?: number;
}

export type StoredChatAttachment = ChatAttachment | ChatAttachmentRef;

export function isAttachmentRef(a: StoredChatAttachment): a is ChatAttachmentRef {
  return 'id' in a && !('base64' in a);
}

/**
 * 会话消息 = AI SDK UIMessage（id / role / parts / metadata）+ 本项目持久化字段。
 * 思考、工具调用、正文都按时间顺序存在 parts 里，渲染层据此生成思考链。
 */
export interface ChatMessage extends UIMessage<StudyMessageMetadata, StudyDataParts, StudyTools> {
  timestamp: number;
  followUpQuestions?: string[];
  attachments?: StoredChatAttachment[];
}

export interface ChatContext {
  subjectId: string;
  categoryId: string;
  itemId: string;
  currentTopic: string;
  /** 当前 UI 学年。智能体默认检索范围；可经工具 crossYear 放开。 */
  academicYear?: string;
}

/**
 * 上下文是否绑定在「某一页」（分类 + 内容项齐全）。
 *
 * Agent 的通用对话只带科目与学年、不绑定当前章节：这时定位行、当前页正文、
 * 页级参考材料都不该注入——上下文一律由用户显式注入（引用笔记 / 附件 / 技能）。
 * 定位行与参考材料的判定必须共用这一个函数，否则两边会各自漂移。
 */
export function isPageBoundContext(ctx: Pick<ChatContext, 'categoryId' | 'itemId'>): boolean {
  return Boolean(ctx.categoryId && ctx.itemId);
}

export interface ChatOptions {
  enableThinking?: boolean;
  enableSearch?: boolean;
  thinkingEffort?: 'low' | 'medium' | 'high' | 'max';
  contextMode?: 'full' | 'semantic';
}

export interface ParsedBlock {
  type: 'markdown' | 'component';
  content?: string;
  tagName?: string;
  props?: Record<string, unknown>;
  childrenText?: string;
}

// 长文档撰写：工具输入（DocumentSpec）、分节生成状态与 /api/document 的事件契约。
// 客户端安全：不导入任何服务端模块。
//
// 设计：文档不在一次 LLM 输出里生成（会被 max_tokens 截断），而是
//   1. outline 阶段：模型给出章节列表（或直接采用工具参数里的 outline）；
//   2. section 阶段：前端逐节请求，每节独立流式生成，服务端对被截断的节自动续写；
//   3. 所有节完成后拼成一篇 Markdown（单一真相源）。查看器目前只提供 Markdown 下载。

export type DocumentFormat = "markdown" | "docx" | "pdf";
export type DocumentGenre = "article" | "paper" | "report" | "review-notes" | "essay";
export type DocumentLanguage = "zh" | "en";

export const DOCUMENT_FORMATS: readonly DocumentFormat[] = ["markdown", "docx", "pdf"];
export const DOCUMENT_GENRES: readonly DocumentGenre[] = ["article", "paper", "report", "review-notes", "essay"];

export const DOCUMENT_GENRE_LABELS: Record<DocumentGenre, string> = {
  article: "长文章",
  paper: "论文",
  report: "报告",
  "review-notes": "复习讲义",
  essay: "随笔/短评",
};

/** writeDocument 工具参数（模型填写）。 */
export interface DocumentSpec {
  title: string;
  /**
   * 目标交付格式。**当前只交付 Markdown**：查看器只提供 .md 下载，
   * `validateDocumentSpec` 会把历史的 docx / pdf 归一化成 markdown。
   * 枚举保留是为了读出旧的 IndexedDB 文档。
   */
  format: DocumentFormat;
  genre: DocumentGenre;
  /** 写作要求：主题、受众、论点、风格、篇幅要求、需要覆盖的知识点等。 */
  brief: string;
  /** 章节标题列表；省略时由 outline 阶段生成。 */
  outline?: string[];
  /** 参考材料（模型从笔记 / 检索整理的要点与引用），写作时据此引用而非臆造。 */
  references?: string;
  /** 目标总字数（中文按字、英文按词），默认按体裁估算。 */
  targetWords?: number;
  language?: DocumentLanguage;
}

export interface DocumentSection {
  title: string;
  /** outline 阶段生成的一句话写作要点，供 section 阶段对齐。 */
  brief?: string;
  markdown?: string;
  status: "pending" | "streaming" | "done" | "error";
  error?: string;
}

export type DocumentStatus = "idle" | "outlining" | "writing" | "done" | "error";

/** IndexedDB 持久化的文档（useDocuments）。 */
export interface StoredDocument {
  id: string;
  spec: DocumentSpec;
  sections: DocumentSection[];
  status: DocumentStatus;
  error?: string;
  modelId?: string;
  createdAt: number;
  updatedAt: number;
  /** Sections with Markdown are durably stored in a separate owner-scoped key. */
  bodyRef?: true;
}

// ─── /api/document 请求 / 事件契约 ────────────────────────────────────────

export interface DocumentApiRequestBase {
  id: string;
  spec: DocumentSpec;
  modelId?: string;
  customApiGroups?: unknown[];
  customProvider?: unknown;
}

export interface DocumentOutlineRequest extends DocumentApiRequestBase {
  phase: "outline";
}

export interface DocumentSectionRequest extends DocumentApiRequestBase {
  phase: "section";
  outline: Pick<DocumentSection, "title" | "brief">[];
  sectionIndex: number;
  /** 已完成的前文（服务端只取尾部若干字符作为衔接上下文）。 */
  previousMarkdown: string;
}

export type DocumentApiRequest = DocumentOutlineRequest | DocumentSectionRequest;

export type DocumentApiEvent =
  | { type: "ping"; t?: number }
  | { type: "document"; id: string; status: "start"; phase: "outline" | "section"; sectionIndex?: number }
  | { type: "document"; id: string; status: "reasoning"; delta: string }
  | { type: "document"; id: string; status: "delta"; delta: string }
  | { type: "document"; id: string; status: "outline"; outline: Pick<DocumentSection, "title" | "brief">[] }
  | { type: "document"; id: string; status: "section-done"; sectionIndex: number; markdown: string; continued: number }
  | { type: "document"; id: string; status: "error"; message: string };

/** 把已完成的节拼成整篇 Markdown（标题为一级标题，节标题为二级）。 */
export function assembleDocumentMarkdown(doc: Pick<StoredDocument, "spec" | "sections">): string {
  const parts: string[] = [`# ${doc.spec.title.trim()}`];
  for (const section of doc.sections) {
    if (!section.markdown?.trim()) continue;
    parts.push(section.markdown.trim());
  }
  return parts.join("\n\n") + "\n";
}

export const DEFAULT_TARGET_WORDS: Record<DocumentGenre, number> = {
  article: 3000,
  paper: 5000,
  report: 3000,
  "review-notes": 2500,
  essay: 1200,
};

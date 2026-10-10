
import { type AcademicYearId } from "@/lib/constants/academic-year";

import type { LectureMaterialRole } from "@/lib/content/lectures/roles";
export interface UnifiedContent {
  /** 材料的受控格式（课堂材料以生成目录为准，旧内容以传入 renderType 为准）。 */
  format: "text" | "markdown" | "html";
  raw: string;
  /** 仅课堂材料存在。 */
  materialRole?: LectureMaterialRole;
}

export interface ExampleListItem {
  id: string;
  title: string;
}

export interface ExampleDetail extends ExampleListItem {
  content: string;
}

/** @deprecated 使用 ExampleListItem / ExampleDetail */
export type ExampleMeta = ExampleDetail;

export type ContentSearchScope = AcademicYearId | "all";

/** 解析复合路径或小节 ID 为统一的内容定位。 */
export interface ResolvedPath {
  subjectId: string;
  categoryId: string;
  itemId: string;
  title: string;
  found: boolean;
}

/** 多科全分类搜索结果。 */
export interface MultiSearchHit {
  subjectId: string;
  subjectName: string;
  categoryId: string;
  itemId: string;
  title: string;
  snippet: string;
  /** 可直接传给 getSection 的复合路径 */
  path: string;
}

export interface SearchAllContentOptions {
  limit?: number;
  /** 默认 all：跨学年。智能体默认传入当前学年；crossYear 时传 all。 */
  academicYear?: ContentSearchScope;
  /** 硬过滤到某一科目（如 histology）。 */
  subjectId?: string;
  /** 当前正在阅读的科目：先在该科目内搜，不足 3 条再放开学年。 */
  preferSubjectId?: string;
  /** 当前页面标题，供短查询向量扩展。 */
  queryContext?: string;
  /**
   * 索引未命中时是否回退全库子串扫描。默认跟 substringSearchAllowed()。
   * 测试可显式设为 false，证明 hybrid/BM25 索引本身能检索大二教材。
   */
  allowSubstring?: boolean;
  signal?: AbortSignal;
  onDiagnostics?: (diagnostics: import("@/lib/ai/search/hybridSearch").SearchDiagnostics) => void;
}

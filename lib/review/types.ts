// 记忆系统 —— 复习卡片数据模型（单一真相源）。
//
// 用户在正文 / AI 输出处划词或右键「记录」→ 先把原文落库（status=saved，绝不丢），
// 弹窗显示原文 + 4 个模式按钮，用户选择后流式 AI 处理（status=processing）：
//   - excerpt 摘录 → 保证全文完整，背面附记忆提示
//   - cloze   挖空 → 合理挖空，特殊处理外语场景
//   - quiz    出题 → 把所有信息融入一道综合题
//   - custom  自定义 → 按用户指令处理
// 处理完成 status=ready，可在弹窗中优化或重选模式。
// 卡片携带章节出处（subject/category/item/sourceLabel）以便复习时溯源。

export type RecordMode = "excerpt" | "cloze" | "quiz" | "custom";

// 向后兼容：旧数据可能含 "qa"；"parsing" 为旧状态，新代码用 saved/processing。
export type CardType = "excerpt" | "cloze" | "quiz" | "custom" | "qa";
export type CardStatus = "saved" | "processing" | "ready" | "error" | "parsing";

/** 记录发起时由前端从当前活动路由（或复习板自带科目）采集的上下文。 */
export interface ReviewCardContext {
  subjectId: string;
  categoryId?: string;
  itemId?: string;
  /** 人类可读出处，如「大学物理 / 详解 / 1.1 质点运动学」。 */
  sourceLabel: string;
}

/** /api/record 返回的成卡结果（不含出处，由前端合并）。 */
export interface RecordCardAI {
  mode: RecordMode;
  cardType: CardType;
  front: string;
  back: string;
  /** cloze 卡被挖去的答案片段（按出现顺序），便于后续做交互式填空。 */
  blanks?: string[];
  explanation?: string;
}

/** 一张复习卡片（IndexedDB 持久化）。 */
export interface ReviewCard extends ReviewCardContext {
  id: string;
  originalText: string;
  /** 用户选择的处理模式（旧数据可能无此字段）。 */
  mode?: RecordMode;
  cardType: CardType;
  front: string;
  back: string;
  blanks?: string[];
  explanation?: string;
  status: CardStatus;
  /** status=error 时的原因。 */
  error?: string;
  /** 实际成卡所用模型 id。 */
  model?: string;
  createdAt: number;
  /**
   * 本机最后修改时间（epoch ms）。
   *
   * 同步引擎用它判断本机与云端谁更新。现网旧卡没有这个字段，`cardVersion`
   * 会退回 `createdAt`，所以不需要迁移数据。任何本机改动都必须推进它，否则
   * 本机永远赢不了别处（如 Platform Wiki）写下的版本。
   */
  updatedAt?: number;
}

/** 下载导出的容器结构（本科目或全部）。 */
export interface ReviewExport {
  app: "gailvlun";
  kind: "review-cards";
  version: 1;
  exportedAt: number;
  scope: "subject" | "all";
  subjectId?: string;
  count: number;
  cards: ReviewCard[];
}

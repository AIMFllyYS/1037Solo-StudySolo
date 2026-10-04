import type { ComponentType } from "react";
import type { ToolUIPart } from "ai";
import type { ChatMessage } from "@/lib/types/chat";
import type { StudyToolName, StudyTools } from "@/lib/ai/agent/tools/names";
// 只借字面量联合类型做 key 校验（type-only，不进任何运行时 bundle）。
import type { I18nKey } from "@/lib/i18n";

export type ToolIconKind = "search" | "file" | "image" | "gallery" | "skill" | "terminal" | "quiz" | "document";

/**
 * 工具的用户可见文案一律存**词典 key**，不存中文字面量：
 * 展示元数据跟着工具定义走，语言却由 i18n 决定，两边解耦后设置面板与思考链共用同一份词条。
 * 消费方用 `t(presentation.labelKey)` 取词；key 打错会在 typecheck 阶段被 I18nKey 拦下。
 */
export interface ToolPresentation {
  /** 思考链步骤标题（动词短语）。 */
  labelKey: I18nKey;
  /** 设置面板开关名。 */
  settingsLabelKey: I18nKey;
  /** 设置面板描述。 */
  descriptionKey: I18nKey;
  icon: ToolIconKind;
  /** 是否在设置面板中提供开关；imageSearch 随「联网搜索」开关，useSkill 随技能库。 */
  toggleable: boolean;
}

export type ToolPart<N extends StudyToolName> = Extract<ToolUIPart<StudyTools>, { type: `tool-${N}` }>;

export interface ResultCardContext {
  isStreaming: boolean;
}

export interface ResultCardProps<N extends StudyToolName = StudyToolName> {
  part: ToolPart<N>;
  message: ChatMessage;
  isStreaming: boolean;
  ctx: ResultCardContext;
  /** Persist follow-up server facts on the original tool part, shared by trace and history. */
  onOutputChange?: (output: StudyTools[N]['output']) => void;
}

export interface ToolModule<N extends StudyToolName = StudyToolName> {
  name: N;
  presentation: ToolPresentation;
  /** 客户端：把该工具 output-available 的 parts 渲染为结果卡片。缺省表示该工具无卡片。 */
  ResultCard?: ComponentType<ResultCardProps<N>>;
  /** Native tool row expansion, using the same registry and message fact lifecycle. */
  StepDetail?: ComponentType<ResultCardProps<N>>;
  /** 结果卡片去重键（renderInteractive / generateImage 按 artifactId / imageGenId 去重）。 */
  resultKey?: (part: ToolPart<N>) => string | null;
  /** 卡片渲染条件（如 hits.length > 0）。缺省 = output-available && !preliminary */
  shouldRender?: (part: ToolPart<N>) => boolean;
  /** 同名工具多次调用合成一张卡（searchNotes / webSearch / 图片检索）。 */
  aggregate?: boolean;
  /** 聚合条目去重键（path / url）。空键放行，避免误丢无 id 条目。 */
  itemKey?: (item: unknown) => string | null;
  /** 从一次调用取出待合并条目。 */
  itemsOf?: (part: ToolPart<N>) => readonly unknown[];
  /** 把去重后的条目写回第一张卡使用的 part。 */
  withItems?: (part: ToolPart<N>, items: readonly unknown[]) => ToolPart<N>;
  /**
   * Agent 中间栏不渲染这张结果卡（来源折叠、图片条等已迁到右上参考列 / 图片页签）。
   * 需要副作用的产物卡（出题自动开窗、演示生成）不要用这个开关，在卡片内部自己藏 UI。
   */
  hideInAgentChat?: boolean;
  /**
   * 运行中也渲染这张卡：流式期间把「非最终态」的 part（输入中 / preliminary 部分结果 /
   * output-error）同样送进 ResultCard，由卡片内部按 part.state 分活（如 webSearch 的
   * live 来源条）。聚合卡会把进行中的 part 与已完成 part 合成一张 live 卡。
   */
  liveWhileRunning?: boolean;
}

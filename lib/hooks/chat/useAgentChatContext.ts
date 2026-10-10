"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/stores/ui";
import { useAcademicYear } from "@/lib/stores/academicYear";
import type { ChatContext } from "@/lib/types/chat";

/**
 * Agent 工作区统一的对话上下文（左栏与各子页面共用同一份）。
 *
 * Agent 是通用型助手：上下文靠**注入**（引用笔记 / 附件 / 技能），不把「当前打开的那一章」默认当成它的上下文——
 * 否则每开一个新对话都绑死在同一节，换科目还会悄悄改写在聊的这个对话。
 * 所以这里只带科目与学年：定位行、当前页正文、页级参考材料都不注入（见 isPageBoundContext）。
 */
export function useAgentChatContext(): ChatContext {
  const activeSubjectId = useStore((s) => s.activeSubjectId);
  const academicYear = useAcademicYear((s) => s.year);
  return useMemo(
    () => ({
      subjectId: activeSubjectId,
      categoryId: "",
      itemId: "",
      currentTopic: "",
      academicYear,
    }),
    [activeSubjectId, academicYear],
  );
}

import { z } from "zod";

import { REQUEST_LIMITS } from "./limits";
function issuePath(issue: z.core.$ZodIssue): string {
  return issue.path.map(String).join(".");
}

function formatZodIssue(issue: z.core.$ZodIssue): string {
  const path = issuePath(issue);
  if (issue.code === "invalid_value" && /(^|\.)role$/.test(path)) {
    return "不支持的消息角色，仅允许 user 或 assistant。";
  }
  if (issue.code === "too_big") {
    if (path === "messages") return `消息数量超过上限（最多 ${REQUEST_LIMITS.messages} 条）。`;
    if (path === "globalContext") return `全局背景过长（最多 ${REQUEST_LIMITS.globalContextChars} 字）。`;
    if (path === "skills") return `技能数量超过上限（最多 ${REQUEST_LIMITS.skills} 个）。`;
    if (path.includes("skills") && path.endsWith("content")) {
      return `单个技能正文过长（最多 ${REQUEST_LIMITS.skillContentChars} 字）。`;
    }
    if (path === "customApiGroups") {
      return `自定义 API 分组超过上限（最多 ${REQUEST_LIMITS.customApiGroups} 个）。`;
    }
    if (path.endsWith("parts")) return `单条消息的内容块超过上限（最多 ${REQUEST_LIMITS.parts} 个）。`;
    if (path === "prompt" || path === "instruction" || path === "text" || path === "title") {
      return `内容过长（最多 ${REQUEST_LIMITS.satellitePromptChars} 字）。`;
    }
    if (path === "previousMarkdown") {
      return `文档前文过长（最多 ${REQUEST_LIMITS.documentPreviousMarkdownChars} 字）。`;
    }
    if (issue.origin === "string") return "字段过长，请缩短后重试。";
    if (issue.origin === "array") return "列表数量超过上限，请减少后重试。";
  }
  if (issue.message && !/^(Too (big|small)|Invalid |Invalid input|expected )/i.test(issue.message)) {
    return issue.message;
  }
  return "请求体不合法，请检查字段后重试。";
}

/** 把 ZodError 收成一句可读中文；绝不回传 issue.input 或裸 JSON dump。 */
export function formatRequestError(error: unknown): string {
  if (error instanceof RequestTooLargeError) return error.message;
  if (error instanceof z.ZodError) {
    const parts = [...new Set(error.issues.map(formatZodIssue).filter(Boolean))];
    const detail = parts.slice(0, 3).join("；");
    if (detail) return detail.startsWith("请求体") ? detail : `请求体不合法：${detail}`;
  }
  return "请求体不合法，请检查后重试。";
}

export function collectRequestSecrets(body: {
  customApiGroups?: { apiKey?: string }[] | null;
  customProvider?: { apiKey?: string } | null;
}): string[] {
  const secrets: string[] = [];
  if (body.customProvider?.apiKey) secrets.push(body.customProvider.apiKey);
  for (const group of body.customApiGroups ?? []) {
    if (group?.apiKey) secrets.push(group.apiKey);
  }
  return secrets;
}

export class RequestTooLargeError extends Error {
  constructor(message = "这次对话上下文过大，已保留本机。请少带历史图或开新会话。") {
    super(message);
    this.name = "RequestTooLargeError";
  }
}
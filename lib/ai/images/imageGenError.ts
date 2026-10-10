export type ImageGenErrorBody = {
  error?: string;
  code?: string;
};

/** 把生图 HTTP 错误收成可区分的中文：未登录 / 未配置 / 端点不对 / 上游拒绝。 */
export function formatImageGenError(status: number, body: ImageGenErrorBody | null | undefined): string {
  if (status === 401) return "未登录，请先登录后再生成图片";
  const code = body?.code;
  const message = typeof body?.error === "string" && body.error.trim() ? body.error.trim() : "";
  if (code === "quota_exhausted" || /额度已用完/.test(message) || /可改用 BYOK/.test(message)) {
    return message || "平台额度已用完。可改用 BYOK 继续使用。";
  }
  if (code === "unconfigured" || /未配置/.test(message)) {
    return message || "生图 API 未配置";
  }
  if (code === "bad_endpoint" || status === 404) {
    return message || "生图端点不对，请检查设置中的 Base URL";
  }
  if (code === "upstream_auth" || code === "upstream") {
    return message || "生图上游拒绝访问，请检查端点与密钥";
  }
  return message || `生图请求失败（${status}）`;
}

/** 错误主标题：401 不得写成「生图失败」。 */
export function imageGenErrorHeading(message: string | undefined): string {
  if (message && message.includes("未登录")) return "未登录";
  if (message && (/额度/.test(message) || /BYOK/.test(message))) return "额度已用完";
  if (message && (/端点不对/.test(message) || /未配置/.test(message))) return "生图端点不对";
  if (message && message.includes("上游拒绝")) return "上游拒绝";
  return "生图失败";
}

/** 未登录调用付费 AI 时给对话区的操作说明（左下角设置 → 登录 → 邮箱验证码）。 */
export const AI_LOGIN_REQUIRED_MESSAGE =
  "未鉴权：请点击页面左下角「设置」，打开登录弹窗，用邮箱验证码或密码登录后即可使用 AI 服务。";

export function isLoginRequiredError(message: string): boolean {
  if (/模型服务拒绝认证/.test(message)) return false;
  const text = message.trim();
  if (/^unauthorized$/i.test(text)) return true;
  if (text.includes("未鉴权")) return true;
  if (/API 请求失败:\s*401\b/i.test(text)) return true;
  if (/\b401\s+unauthorized\b/i.test(text) && !/密钥|api key/i.test(text)) return true;
  return false;
}

export function formatLoginRequiredError(message: string): string {
  return isLoginRequiredError(message) ? AI_LOGIN_REQUIRED_MESSAGE : message;
}

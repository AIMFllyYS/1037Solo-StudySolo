/** Public error text only: never serialize provider request bodies, headers or raw responses. */
export function toChatErrorMessage(error: unknown, secrets: string[] = []): string {
  const chain: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current) && chain.length < 8) {
    seen.add(current);
    const item = current as Record<string, unknown>;
    chain.push(item);
    current = item.lastError ?? item.cause ?? (Array.isArray(item.errors) ? item.errors.at(-1) : undefined);
  }
  const messages = chain.map((item) => typeof item.message === 'string' ? item.message : '').join(' ');
  const code = chain.map((item) => item.code).find((value) => typeof value === 'string')
    ?? messages.match(/\b(EACCES|EPERM|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR_\w*TIMEOUT)\b/)?.[1];

  if (chain.some((item) => item.code === 'CUSTOM_PROVIDER_NETWORK_UNSAFE')) return '自定义模型地址未通过公网连接校验，请检查 API 地址、DNS 或使用正式网站连接。';

  if (code === 'EACCES' || code === 'EPERM') {
    return `无法连接模型服务（${code}）：网络访问被系统或启动环境拒绝。请检查开发服务的网络权限与代理，或在普通终端重新启动 pnpm dev。`;
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return '无法解析模型服务地址，请检查 API 地址、DNS 和代理连接。';
  }
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    return '模型服务连接被拒绝或中断，请检查 API 地址、服务状态和代理后重试。';
  }
  if (code === 'ETIMEDOUT' || (typeof code === 'string' && /^UND_ERR_\w*TIMEOUT$/.test(code)) || chain.some((item) => item.name === 'TimeoutError')) {
    return '连接模型服务超时，请检查网络或稍后重试。';
  }
  if (chain.some((item) => item.name === 'AbortError')) return '生成已取消。';
  const status = chain.map((item) => item.statusCode).find((value): value is number => typeof value === 'number');
  if (status === 401 || status === 403) return `模型服务拒绝认证（HTTP ${status}），请检查 API 密钥和模型访问权限。`;
  if (status === 429) return '模型请求受限（HTTP 429），请检查服务额度或稍后重试。';
  if (status && status >= 500) return `模型服务暂不可用（HTTP ${status}），原对话已保留，请稍后重试。`;
  if (chain.some((item) => /TypeValidationError/.test(String(item.name)))) return '本次模型响应无法完整解析：响应字段校验失败，可能是服务临时异常或字段变化。原对话已保留，请重试；持续失败时请反馈请求编号。';
  if (chain.some((item) => /JSONParseError/.test(String(item.name)))) return '本次模型响应无法完整解析：响应内容解析失败。原对话已保留，请重试；持续失败时请反馈请求编号。';

  const leaf = [...chain].reverse().find((item) => typeof item.message === 'string' && item.message.trim());
  let detail = typeof leaf?.message === 'string' ? leaf.message : typeof error === 'string' ? error : '';
  if (status === 400 || status === 404 || status === 422) {
    for (const item of [...chain].reverse()) {
      if (typeof item.responseBody !== 'string' || item.responseBody.length > 64_000) continue;
      try {
        const body = JSON.parse(item.responseBody);
        const reason = body?.error?.message ?? body?.message;
        if (typeof reason === 'string' && reason.trim()) { detail = reason; break; }
      } catch { /* Never display an unparsed response or HTML error page. */ }
    }
  }
  for (const secret of secrets.filter(Boolean)) detail = detail.split(secret).join('[已隐藏]');
  detail = detail
    .replace(/https?:\/\/[^\s"<>]+/gi, '[API 地址]')
    .replace(/\bBearer\s+[^\s,"'\]}]+/gi, 'Bearer [已隐藏]')
    .replace(/\bsk-[a-zA-Z0-9_-]+/g, '[已隐藏]')
    .replace(/(["']?(?:api[-_]?key|authorization|token|password)["']?\s*[:=]\s*)["']?[^\s,"'\]}]+["']?/gi, '$1[已隐藏]')
    .split(/\r?\n/)[0].trim().slice(0, 240);
  if (/^AI_?APICallError$/i.test(detail)) detail = '';
  if (status === 404 && /not (?:available|supported).*group|configured account/i.test(detail)) {
    return `当前中转凭证分组未开通此模型（HTTP 404）：${detail}`;
  }
  if (status === 404 && !detail) return '模型接口不存在（HTTP 404），请检查 API 地址和模型名称。';
  if (status) return `模型接口请求失败（HTTP ${status}）${detail ? `：${detail}` : '，请检查该模型接受的参数或稍后重试。'}`;
  if (!detail || /^(An error occurred\.?|fetch failed)$/i.test(detail)) {
    return '模型请求失败，请检查 API 配置与网络连接后重试。';
  }
  return detail;
}

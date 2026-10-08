import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toChatErrorMessage } from './errorMessage';

test('network permissions survive wrapped SDK retry/API errors without exposing request data', () => {
  const error = { name: 'AI_RetryError', message: 'Failed after 3 attempts', lastError: {
    name: 'AI_APICallError', message: 'Cannot connect to API', requestBodyValues: { password: 'never serialize' },
    cause: { code: 'EACCES', message: 'connect EACCES 198.18.0.220:443' },
  } };
  const text = toChatErrorMessage(error);
  assert.match(text, /EACCES.*网络访问.*拒绝/);
  assert.doesNotMatch(text, /198\.18|password|never serialize|3 attempts/);
});

test('public errors explain auth/DNS/protocol failures, not provider payloads', () => {
  assert.match(toChatErrorMessage({ statusCode: 401, message: 'secret API key sk-not-public', responseBody: 'private' }), /HTTP 401.*密钥/);
  assert.doesNotMatch(toChatErrorMessage({ statusCode: 403, message: 'private' }), /private/);
  assert.match(toChatErrorMessage({ cause: { code: 'ENOTFOUND' } }), /DNS/);
  assert.match(toChatErrorMessage({ name: 'AI_TypeValidationError', message: 'private payload' }), /响应.*解析/);
  assert.doesNotMatch(toChatErrorMessage({ name: 'AI_JSONParseError', message: 'private payload' }), /协议|Anthropic|private payload/);
  assert.match(toChatErrorMessage(new DOMException('aborted', 'AbortError')), /取消/);
});

test('fallback messages redact credentials and URLs and handle cyclic causes', () => {
  const error = Object.assign(new Error('bad custom-secret-value api_key=another-secret https://api.invalid/?key=secret Bearer token123'), { cause: null as unknown });
  error.cause = error;
  const text = toChatErrorMessage(error, ['custom-secret-value']);
  assert.doesNotMatch(text, /custom-secret-value|another-secret|api\.invalid|token123/);
  assert.match(text, /已隐藏/);
  assert.notEqual(toChatErrorMessage(undefined), 'An error occurred.');
});

test('undici socket タイムアウトは生の "Headers Timeout Error" を出さず汎用超时メッセージへ', () => {
  for (const code of ['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT']) {
    const text = toChatErrorMessage({ name: 'HeadersTimeoutError', message: 'Headers Timeout Error', code });
    assert.match(text, /超时|稍后重试/, code);
    assert.doesNotMatch(text, /Headers Timeout/, code);
  }
});

test('HTTP 400 exposes the bounded upstream parameter reason, not the SDK class name or credentials', () => {
  const text = toChatErrorMessage({ name: 'AI_APICallError', message: 'AI_APICallError', statusCode: 400,
    responseBody: JSON.stringify({ error: { message: 'Temperature invalid, only 1 allowed. token=private' }, request: { password: 'never-display' } }) });
  assert.match(text, /Temperature invalid, only 1/);
  assert.doesNotMatch(text, /AI_APICallError|never-display|private/);
});

test('gateway account availability is distinguished from an incorrect endpoint', () => {
  const text = toChatErrorMessage({ statusCode: 404, message: 'AI_APICallError', responseBody: JSON.stringify({ error: { message: 'Model "gpt-5.6-sol" is not supported by any configured account in this group' } }) });
  assert.match(text, /凭证分组未开通.*404/);
  assert.match(text, /gpt-5.6-sol/);
});

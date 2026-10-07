import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitChatRequest, isPayloadTooLargeError, requestPayloadBytes, REQUEST_TOO_LARGE_MESSAGE } from './requestBudget';
test('request pressure is explicit and preserves all conversation and attachment data', () => {
 const messages = [{ id: 'old', role: 'user' as const, parts: [{ type: 'text' as const, text: 'old'.repeat(300) }, { type: 'file' as const, mediaType: 'image/png', url: 'data:image/png;base64,abc' }] }];
 const body = { projectSlices: [{ text: '完整项目正文'.repeat(300) }] };
 const original = JSON.stringify({ messages, body });
 assert.throws(() => fitChatRequest(messages, body, 100), new Error(REQUEST_TOO_LARGE_MESSAGE));
 assert.equal(JSON.stringify({ messages, body }), original);
});
test('a small request is returned intact including project slices and photos', () => {
 const messages = [{ id: 'new', role: 'user' as const, parts: [{ type: 'text' as const, text: '提问' }] }];
 const body = { projectSlices: [{ text: '项目正文' }] };
 const result = fitChatRequest(messages, body);
 assert.equal(result.messages, messages); assert.equal(result.body, body); assert.equal(result.truncated, false);
 assert.ok(requestPayloadBytes(messages, body) > 0);
});
test('413 responses remain recognizable', () => {
 assert.equal(isPayloadTooLargeError(new Error('413 Request Entity Too Large nginx')), true);
 assert.equal(isPayloadTooLargeError(new Error('上游返回错误')), false);
});

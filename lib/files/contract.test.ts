import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFileSize, MAX_FILE_BYTES, fileReference, referencedFileId, collectCloudFileIds, countComposerAttachments } from './contract';
import { buildRequestMessages } from '@/lib/chat/buildRequestMessages';
import { fitChatRequest } from '@/lib/chat/requestBudget';
import { sanitizeChatMessages } from '@/lib/sync/payload';
import { checkpointMessages } from '@/lib/context/compactChatSession';
import type { ChatMessage } from '@/lib/types/chat';
import { parseChatRequest } from '@/lib/ai/agent/requestSchema';
const id = '11111111-1111-4111-8111-111111111111';
test('25MB boundary is shared by photographs and other files', () => {
  assert.doesNotThrow(() => assertFileSize(MAX_FILE_BYTES));
  assert.throws(() => assertFileSize(MAX_FILE_BYTES + 1), /25MB/);
  assert.equal(referencedFileId(fileReference(id)), id);
  assert.equal(referencedFileId('https://attacker.invalid/image.png'), null);
});
test('nine files per user message survive successive uploads, cloud sync, and later turns', () => {
  const messages: ChatMessage[] = [0,1].map(index => ({ id: `u${index}`, role: 'user', timestamp: index, parts: [{ type: 'text', text: '阅读这些附件' }], attachments: Array.from({ length: 9 }, (_, i) => ({ id: `blob-${index}-${i}`, cloudFileId: id, type: 'image' as const, mimeType: 'image/png', name: `${i}.png`, size: MAX_FILE_BYTES })) }));
  const synced = sanitizeChatMessages(messages);
  assert.equal(synced[0]?.attachments?.[0]?.cloudFileId, id);
  const built = buildRequestMessages(synced);
  assert.equal(built.messages.flatMap(message => message.parts.filter(part => part.type === 'file')).length, 18);
  assert.equal(fitChatRequest(built.messages, {}).truncated, false);
  assert.doesNotThrow(() => parseChatRequest({ messages: built.messages }));
  assert.throws(() => parseChatRequest({ messages: [{ ...built.messages[0], parts: Array.from({ length: 10 }, () => ({ type: 'file', mediaType: 'image/png', url: fileReference(id) })) }] }), /9 个附件/);
});
test('transport pressure cannot silently remove old turns, current photos, or project text', () => {
  const messages = [{ id: 'old', role: 'user' as const, parts: [{ type: 'text' as const, text: 'old'.repeat(300) }] }];
  const before = JSON.stringify(messages);
  assert.throws(() => fitChatRequest(messages, { projectSlices: [{ text: 'project'.repeat(300) }] }, 100));
  assert.equal(JSON.stringify(messages), before);
});
test('an AI checkpoint changes model context without deleting the source transcript', () => {
  const messages: ChatMessage[] = ['old','recent'].map((id, index) => ({ id, role: 'user', timestamp: index, parts: [{ type: 'text', text: id }] }));
  const before = JSON.stringify(messages);
  const checkpoint = { summary: 'AI 已整理的目标、事实与待办', coveredIds: ['old'], cloudFileIds: [id], createdAt: 10 };
  const model = checkpointMessages(messages, checkpoint);
  assert.equal(JSON.stringify(messages), before);
  assert.equal(model.at(-1)?.id, 'recent');
  assert.match(JSON.stringify(model[0]), /AI 已整理/);
  assert.equal(checkpointMessages(messages, { ...checkpoint, coveredIds: ['missing'] }), messages);
});
test('asset text citations and attachment references share one durable collector and batch count', () => {
  const other = '11111111-1111-4111-8111-111111111112';
  assert.deepEqual(collectCloudFileIds([{ role: 'user', parts: [{ type: 'text', text: fileReference(id) }, { type: 'file', url: fileReference(other) }], attachments: [{ cloudFileId: id }] }]), [id, other]);
  assert.equal(countComposerAttachments(Array.from({ length: 9 }, () => ({ cloudFileId: id })), 0, fileReference(id)), 9);
  assert.equal(countComposerAttachments(Array.from({ length: 9 }, () => ({ cloudFileId: id })), 0, fileReference(other)), 10);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FullContextManager } from './fullContext.ts';

const page = { subjectId: 'probability', categoryId: 'detail', itemId: '1.4', currentTopic: '古典概型' };

test('FullContextManager：参考材料不含用户提问，同页不同问题上下文逐字节相同', async () => {
  const manager = new FullContextManager();
  const first = await manager.buildContext(page, '什么是条件概率？');
  const second = await manager.buildContext(page, '它和联合概率有什么关系？');
  assert.doesNotMatch(first.context, /用户提问：/);
  assert.doesNotMatch(first.context, /什么是条件概率/);
  assert.doesNotMatch(first.context, /联合概率/);
  assert.match(first.context, /以上是参考材料/);
  assert.equal(first.context, second.context);
  assert.equal(first.tokenCount, second.tokenCount);
});

test('FullContextManager：未绑定页面的 Agent 对话不预注入目录或章节正文（让它自己调工具查）', async () => {
  const manager = new FullContextManager();
  const agent = { subjectId: 'probability', categoryId: '', itemId: '', currentTopic: '' };
  const result = await manager.buildContext(agent, '帮我把这周的笔记整理成提纲');
  assert.equal(result.context, '');
  assert.doesNotMatch(result.context, /## 课程目录/);
  assert.doesNotMatch(result.context, /## 当前内容：/);
  assert.deepEqual(result.sources, []);
  // 与科目、问法无关：永远为空
  const other = await manager.buildContext({ ...agent, subjectId: 'histology' }, '其它问题');
  assert.equal(result.context, other.context);
});

test('FullContextManager：compact 时用目录+摘要而不是全文', async () => {
  const manager = new FullContextManager();
  const full = await manager.buildContext(page, 'q');
  const compact = await manager.buildContext(page, 'q', { compact: true });
  assert.equal(full.tier, 'full');
  assert.ok(compact.tier === 'summary' || compact.tier === 'outline');
  assert.match(compact.context, /课程目录|当前页摘要/);
  assert.ok(compact.tokenCount <= full.tokenCount);
  assert.doesNotMatch(compact.context, /用户提问：/);
});

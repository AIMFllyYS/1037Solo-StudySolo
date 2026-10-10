import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoRouteCandidates, decideAutomaticModels, prefersStrongModel, selectAutomaticModels } from './autoRoute';
import { getModelInfo } from './models';
import { relayModelConfig } from './endpoints/relayConfig';

const input = { hasImages: false, estimatedTokens: 100, text: '解释概念', thinking: false };

test('auto 的候选池只有「两个免费 + 快速 + GLM」，且都在可用时返回', () => {
  const ids = selectAutomaticModels(input, () => true);
  assert.equal(ids.length, 4);
  // 顺序：短问题默认免费优先，快速与强模型在后兜底。
  assert.deepEqual(ids.slice(0, 2), [
    'poolside/laguna-s-2.1-free',
    'inclusionai/ling-3.0-flash-sante:free',
  ]);
  assert.ok(ids.includes('deepseek/deepseek-v4.1-flash'));
  assert.ok(ids.includes('z-ai/glm-5.3-flash'));
  assert.ok(ids.every((id) => ['快速模型', '免费模型', '多模态'].includes(getModelInfo(id)!.group)));
  assert.ok(!ids.includes('Qwen/Qwen3.7-Flash'), '不在候选池里的模型永远不该出现');
  assert.deepEqual(selectAutomaticModels(input, () => false), []);
});

test('硬任务（做题 / 出题 / 讲解 / 检索…）一律先给能扛事的模型', () => {
  for (const text of [
    '帮我出 5 道题',
    '出5道题',
    '这道题怎么做',
    '仔细讲解一下细胞呼吸',
    '系统性梳理第三章',
    '查一下最新的资料',
    '写一篇关于糖酵解的综述',
  ]) {
    assert.equal(prefersStrongModel({ ...input, text }), true, text);
  }
  for (const text of ['你好', '什么是熵', '今天天气如何']) {
    assert.equal(prefersStrongModel({ ...input, text }), false, text);
  }
  // 免费池永远排在硬任务之后。
  const ids = selectAutomaticModels({ ...input, text: '帮我出 5 道题' }, () => true);
  assert.equal(ids[0], 'deepseek/deepseek-v4.1-flash');
  assert.ok(ids.indexOf('poolside/laguna-s-2.1-free') > 0);
});

test('带图 / 开思考 / 长文也走规则，不吃免费池', () => {
  const vision = selectAutomaticModels({ ...input, hasImages: true }, () => true);
  assert.deepEqual(vision, ['deepseek/deepseek-v4.1-flash', 'z-ai/glm-5.3-flash']);
  assert.deepEqual(selectAutomaticModels({ ...input, hasImages: true }, () => false), []);
  assert.deepEqual(selectAutomaticModels({ ...input, estimatedTokens: 2_000_000 }, () => true), []);
  assert.equal(selectAutomaticModels({ ...input, thinking: true }, () => true)[0], 'deepseek/deepseek-v4.1-flash');
  assert.equal(selectAutomaticModels({ ...input, text: 'x'.repeat(700) }, () => true)[0], 'deepseek/deepseek-v4.1-flash');
});

test('candidates 过滤只保留已配置、支持工具、且视觉/上下文达标的模型', () => {
  const noneAvailable = autoRouteCandidates(input, () => false);
  assert.deepEqual(noneAvailable, []);
  // 免费池不支持视觉 → 带图时被过滤掉。
  const visionIds = autoRouteCandidates({ ...input, hasImages: true }, () => true);
  assert.ok(visionIds.every((id) => getModelInfo(id)?.vision === true));
});

test('decideAutomaticModels：规则能定就不问模型（零额外延迟）', async () => {
  let asked = 0;
  const route = async () => {
    asked += 1;
    return { modelId: 'poolside/laguna-s-2.1-free', elapsedMs: 1, raw: '{"m":"laguna"}' };
  };
  for (const probe of [
    { ...input, text: '帮我出 5 道题' },
    { ...input, hasImages: true },
    { ...input, thinking: true },
  ]) {
    const decision = await decideAutomaticModels(probe, { available: () => true, route });
    assert.equal(decision.source, 'rules');
  }
  assert.equal(asked, 0, '规则能定的情况不该调用路由器');
});

test('decideAutomaticModels：短问题让路由器兜底，选中的排第一', async () => {
  const decision = await decideAutomaticModels(input, {
    available: () => true,
    route: async () => ({ modelId: 'deepseek/deepseek-v4.1-flash', elapsedMs: 800, raw: '{"m":"ds"}' }),
  });
  assert.equal(decision.source, 'router');
  assert.equal(decision.models[0], 'deepseek/deepseek-v4.1-flash');
  assert.equal(new Set(decision.models).size, decision.models.length, '首选不能重复出现');
  // 其余候选按规则次序排在后面，继续做端点级降级。
  assert.ok(decision.models.includes('poolside/laguna-s-2.1-free'));
});

test('decideAutomaticModels：路由器失败 / 超时 / 不选都回落到规则', async () => {
  const fallback = await decideAutomaticModels(input, {
    available: () => true,
    route: async () => ({ modelId: null, elapsedMs: 0, raw: '' }),
  });
  assert.equal(fallback.source, 'rules');
  assert.equal(fallback.models[0], 'poolside/laguna-s-2.1-free');

  const thrown = await decideAutomaticModels(input, {
    available: () => true,
    route: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(thrown.source, 'rules');

  const empty = await decideAutomaticModels(input, { available: () => false });
  assert.deepEqual(empty.models, []);
  assert.equal(empty.note, 'no-candidate');
});

test('relay preserves exact IDs and has explicit, validated protocol overrides', () => {
  assert.equal(relayModelConfig('deepseek', '').thinkingRequestStyle, 'openai-reasoning-effort');
  assert.deepEqual(relayModelConfig('deepseek', JSON.stringify({ deepseek: { apiModelId: 'DeepSeek V4.1 flash', thinkingRequestStyle: 'none', enabled: false } })), {
    apiModelId: 'DeepSeek V4.1 flash', thinkingRequestStyle: 'none', enabled: false,
  });
  assert.throws(() => relayModelConfig('x', '{oops'), /配置格式/);
});

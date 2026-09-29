import { test, mockPaidFetch } from "@/tests/helpers/paidAiFixture";
import assert from 'node:assert/strict';
import { before, } from 'node:test';
import { generateText } from 'ai';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { buildCustomModelRegistryId, normalizeRegistryId, type CustomApiGroup } from '@/lib/ai/models';

let resolve: typeof import('@/lib/ai/sdk/languageModel')['resolveLanguageModel'];
before(async () => {
  process.env.RELAY_BASE_URL = 'https://gateway.invalid/v1';
  process.env.RELAY_API_KEY = 'gateway-test-only';
  ({ resolveLanguageModel: resolve } = await import('@/lib/ai/sdk/languageModel'));
});

for (const id of ['deepseek/deepseek-v4.1-flash', 'kimi-k3', 'mimo-v2.5']) {
  test(`gateway wire contract: ${id}`, async (t) => {
    let body: Record<string, unknown> = {};
    mockPaidFetch(t, async (input: unknown, init?: RequestInit) => {
      assert.equal(String(input), 'https://gateway.invalid/v1/chat/completions');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer gateway-test-only');
      body = JSON.parse(String(init?.body));
      return Response.json({ id: 'test', object: 'chat.completion', created: 1, model: id,
        choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    });
    const model = resolve(id);
    await generateText({ model: model.model, prompt: 'Hi', temperature: 0.2, topP: 0.5, maxRetries: 0, ...model.thinkingSettings('max') });
    assert.equal(body.model, normalizeRegistryId(id));
    assert.equal(body.temperature, id === 'kimi-k3' ? 1 : undefined);
    assert.equal(body.top_p, undefined);
    for (const field of ['thinking', 'thinking_level', 'thinking_budget', 'enable_thinking']) assert.equal(body[field], undefined);
    if (id === 'kimi-k3') assert.equal(body.reasoning_effort, undefined);
  });
}

test('DeepSeek thinking replaces unsupported named choice with a single-tool auto inventory', async (t) => {
  let body: Record<string, unknown> = {};
  mockPaidFetch(t, async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}, choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] });
  });
  const model = resolve('deepseek/deepseek-v4.1-flash');
  await model.model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
    tools: ['requested', 'unrelated'].map((name) => ({ type: 'function' as const, name, inputSchema: { type: 'object', properties: {} } })), toolChoice: { type: 'tool', toolName: 'requested' } });
  assert.equal(body.tool_choice, 'auto');
  assert.deepEqual((body.tools as Array<{ function: { name: string } }>).map((tool) => tool.function.name), ['requested']);
});

for (const mode of ['generate', 'stream'] as const) {
  test(`gateway ${mode} repairs legacy malformed Unicode across prompt and tools without mutating input`, async (t) => {
    let body: Record<string, unknown> = {};
    mockPaidFetch(t, async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      if (mode === 'stream') return new Response(
        'data: {"id":"test","object":"chat.completion.chunk","created":1,"model":"deepseek/deepseek-v4.1-flash","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
      return Response.json({ usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}, choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] });
    });
    const options: LanguageModelV4CallOptions = {
      prompt: [
        { role: 'system', content: '旧摘要\ud83d' },
        { role: 'user', content: [{ type: 'text', text: '中文📖\udc00' }] },
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'lookup', input: '{"query":"old\\ud83d"}' }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'lookup', output: { type: 'json', value: { text: '结果\ud83d' } } }] },
      ],
      tools: [{ type: 'function', name: 'lookup', description: '说明\ud83d', inputSchema: { type: 'object', properties: { query: { type: 'string', description: '内容\udc00' } } } }],
    };
    const original = structuredClone(options);
    const { model } = resolve('deepseek/deepseek-v4.1-flash');
    if (mode === 'stream') {
      const result = await model.doStream(options);
      const reader = result.stream.getReader();
      while (!(await reader.read()).done) { /* consume stream */ }
    } else await model.doGenerate(options);
    const messages = body.messages as Array<{ content: unknown }>;
    assert.equal(messages[0].content, '旧摘要�');
    assert.equal(messages[1].content, '中文📖�');
    assert.deepEqual(JSON.parse(messages[3].content as string), { text: '结果�' });
    assert.match(JSON.stringify(body.tools), /说明�/);
    assert.match(JSON.stringify(body.tools), /内容�/);
    assert.deepEqual(options, original);
  });
}

test('custom native Anthropic uses the same Unicode boundary without changing protocol or credentials', async (t) => {
  let body: Record<string, unknown> = {};
  mockPaidFetch(t, async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), 'https://anthropic.invalid/v1/messages');
    assert.equal(new Headers(init?.headers).get('x-api-key'), 'custom-test-only');
    body = JSON.parse(String(init?.body));
    return Response.json({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-test',
      content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 } });
  });
  const groups: CustomApiGroup[] = [{ id: 'native', name: 'Native', baseUrl: 'https://anthropic.invalid', apiKey: 'custom-test-only',
    models: [{ id: 'claude-test', apiProtocol: 'anthropic', thinking: false }] }];
  const { model } = resolve(buildCustomModelRegistryId('native', 'claude-test'), groups);
  const result = await generateText({ model, system: '旧摘要\ud83d', prompt: '中文📖\udc00', maxRetries: 0 });
  assert.equal(result.text, 'OK');
  assert.match(JSON.stringify(body.system), /旧摘要�/);
  assert.match(JSON.stringify(body.messages), /中文📖�/);
  assert.equal(groups[0].apiKey, 'custom-test-only');
});

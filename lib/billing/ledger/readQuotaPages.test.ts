import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readQuotaPages } from './readQuotaPages';
test('quota aggregation reads every page beyond the default 1000-row limit', async () => {
  const source = Array.from({ length: 1201 }, (_, i) => i);
  const rows = await readQuotaPages(async (from, to) => source.slice(from, to + 1));
  assert.deepEqual(rows, source);
});
test('a failed later page rejects rather than returning a partial balance', async () => {
  await assert.rejects(readQuotaPages(async (from) => {
    if (from) throw new Error('unavailable');
    return Array.from({ length: 500 }, () => 1);
  }), /unavailable/);
});

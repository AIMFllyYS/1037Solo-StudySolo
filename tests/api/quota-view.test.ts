import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { GET } from '@/app/api/quota/route';
import { setQuotaGateTestDeps } from '@/lib/billing/quota/quotaGate';
import { quotaViewSchema } from '@/lib/billing/quota/quotaView';

afterEach(() => setQuotaGateTestDeps(null));
test('quota view requires authentication, ignores supplied user IDs and never caches publicly', async () => {
  setQuotaGateTestDeps({ resolveUserId: async () => null });
  const result = await GET(new Request('https://app.invalid/api/quota?userId=other'));
  assert.equal(result.status, 401);
  assert.match(result.headers.get('cache-control')!, /private, no-store/);
});
test('quota view returns the same authoritative dual pools as the gate', async () => {
  const now = new Date('2026-09-13T00:00:00Z');
  setQuotaGateTestDeps({ resolveUserId: async () => 'own', now: () => now, store: {
    getUser: async (id) => { assert.equal(id, 'own'); return { id, tier: 'plus', period_start: '2026-09-01T00:00:00Z', period_end: '2026-10-01T00:00:00Z' }; },
    savePeriod: async () => {}, listGrants: async () => [],
    listLedger: async () => [{ pool: 'platform', kind: 'llm', cost_cny: 2 }, { pool: 'byok', kind: 'embedding', cost_cny: 1 }],
  } });
  const response = await GET(new Request('https://app.invalid/api/quota?userId=other'));
  const data = quotaViewSchema.parse(await response.json());
  assert.equal(data.userId, 'own'); assert.equal(data.tier, 'plus');
  assert.equal(data.platform.remaining, 68); assert.equal(data.byok.remaining, 69);
});
test('missing account and unavailable quota services never look like zero or unlimited balance', async () => {
  setQuotaGateTestDeps({ resolveUserId: async () => 'own', store: {
    getUser: async () => null, savePeriod: async () => {}, listGrants: async () => [], listLedger: async () => [],
  } });
  assert.equal((await GET(new Request('https://app.invalid/api/quota'))).status, 503);
});

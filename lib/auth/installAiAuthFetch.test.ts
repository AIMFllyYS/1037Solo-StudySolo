import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installAiAuthFetch, isAuthenticatedAppUrl } from './installAiAuthFetch';

test('AI, quota, ledger, redemption and review progress receive the current first-party token', async () => {
  const seen: Array<{ auth: string | null; extra: string | null }> = [];
  let token = 'initial';
  const restore = installAiAuthFetch(async () => token, async (_input, init) => {
    const headers = new Headers(init?.headers);
    seen.push({ auth: headers.get('authorization'), extra: headers.get('x-test') });
    return new Response('ok');
  }, 'https://study.example');
  try {
    for (const path of ['/api/chat', '/api/quota', '/api/usage', '/api/redeem', '/api/profile', '/api/review/progress']) await fetch(path);
    token = 'refreshed';
    await fetch(new Request('https://study.example/api/chat', { headers: { 'x-test': 'preserved' } }));
    await fetch(new Request('https://study.example/api/chat', { headers: { authorization: 'Bearer explicit' } }));
    assert.deepEqual(seen.map((item) => item.auth), ['Bearer initial', 'Bearer initial', 'Bearer initial', 'Bearer initial', 'Bearer initial', 'Bearer initial', 'Bearer refreshed', 'Bearer explicit']);
    assert.equal(seen[6].extra, 'preserved');
  } finally { restore(); }
});
test('matching third-party URLs and protocol-relative URLs never receive the app token', async () => {
  assert.equal(isAuthenticatedAppUrl('/api/quota?x=1', 'https://study.example'), true);
  assert.equal(isAuthenticatedAppUrl('/api/profile', 'https://study.example'), true);
  assert.equal(isAuthenticatedAppUrl('/api/review/progress?view=summary', 'https://study.example'), true);
  assert.equal(isAuthenticatedAppUrl('/api/review/progress/other', 'https://study.example'), false);
  for (const url of ['https://elsewhere.example/api/chat', '//elsewhere.example/api/quota', 'https://study.example.evil/api/chat', '/api/can-embed']) {
    assert.equal(isAuthenticatedAppUrl(url, 'https://study.example'), false);
  }
  let tokenReads = 0;
  const restore = installAiAuthFetch(async () => { tokenReads++; return 'private'; }, async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), null); return new Response();
  }, 'https://study.example');
  try { await fetch('https://elsewhere.example/api/chat'); assert.equal(tokenReads, 0); } finally { restore(); }
});


test('owner switch while renewing a token cannot send the previous request as the new owner', async () => {
  const { activateStorageOwner } = await import('../storage/ownerScope');
  activateStorageOwner('owner-a');
  let resolveToken!: (token: string) => void;
  let calls = 0;
  const restore = installAiAuthFetch(() => new Promise(resolve => { resolveToken = resolve; }), async () => { calls++; return new Response(); }, 'https://study.example');
  try {
    const pending = fetch('/api/chat', { method: 'POST', body: 'private-a' });
    activateStorageOwner('owner-b');
    resolveToken('token-b');
    await assert.rejects(pending, /账号已切换/);
    assert.equal(calls, 0);
  } finally { restore(); activateStorageOwner(null); }
});

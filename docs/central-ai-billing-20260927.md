# StudySolo shared AI billing integration

> Status: implemented locally, pending coordinated migration/configuration and live acceptance · 2026-09-27.

## Authority and flow

`credit_accounts` / `credit_operations` / `credit_ledger` in RootSolo are the only spending authority. The default quota and redemption paths no longer read/write standalone `app_users`, `quota_grants`, `redemption_codes` or local balance counters. Historical grant/period utilities and injectable fixtures remain for archive interpretation/tests, not production permission to spend.

The eight existing AI POST endpoints (chat, chat-title, artifact, document, canvas-revise, follow-ups, image-gen, record) now run inside `withPaidRequest`. It obtains the canonical signed-in user (including MFA enforcement through the shared auth helper), validates an optional Idempotency-Key, and establishes per-request context. It does not trust x-studyreview-user-id as proof. Sibling-owned browser auth transport now stamps stable request keys. Requests without a supplied key receive a server-generated key; transport retries should reuse the original client key.

Every actual SDK candidate is wrapped by `withProviderAdmission`, including failovers. Raw embedding, rerank, search, image generation and fast-model transports use `billableJsonFetch`. Cached results do not call the provider and do not incur a new charge.

1. Compute a bounded reservation from trusted server pricing, conservative serialized prompt bytes/context ceiling, and an enforced output limit.
2. Call central `ensure_period_credits` and create a unique `ss_ai_admissions` guard before `credit_apply(...reserve...)` (driver is sibling-owned `centralCredits.ts`). An existing guard does not authorize calling the provider again.
3. Only after a successful reservation invoke the provider. New SDK calls get stable `<requestId>:<sequence>` keys.
4. On complete, trustworthy usage, settle exactly once through the shared ledger. SDK streams settle on their finish usage before delivering that finish event.
5. Known HTTP rejection (400/401/403/404/413/422/429), or cancellation known to occur before provider invocation, releases the reservation. Transport timeouts, midstream disconnects, malformed/missing usage, ambiguous 5xx and uncertain settlement results keep funds held for reconciliation. There is no blind timer refund.

One credit = 1 CNY accounting unit by the coordinator's chosen product policy; one credit = 1,000,000 microcredits. Token pricing uses exact bigint arithmetic, sums input/cache-write/cache-read/output before upward rounding once. The currency/credit factor is explicitly configurable by `ECOSYSTEM_CREDITS_PER_CNY` (default 1), not a live exchange-rate assertion. Provider USD conversions must be configured by the operator, not guessed from model names.

Default maximum across all worst-case reservations in a logical request is **20 CNY**, configured by `ECOSYSTEM_MAX_REQUEST_CNY`; this is a ceiling, not a flat reservation or flat charge. SDK output default is 4096 tokens when unspecified, maximum allowed **65536** (configurable `ECOSYSTEM_MAX_OUTPUT_TOKENS`, hard upper 131072). The 65536 default preserves the existing max-thinking mode of 32000 reasoning + 4096 output. Raw LLM/search chat-completion transports cap output at 32768 and set a default bound when missing. Requests exceeding their bounds fail before inference.

Configured BYOK text/embedding uses the existing server-owned 0.5 CNY/million-token infrastructure rate. Browser-supplied custom model prices never control ecosystem billing. Platform credentials are never silently treated as BYOK.

## Required service pricing

Built-in text/image models use their existing server catalog. `ECOSYSTEM_MODEL_PRICES_JSON` may explicitly override or supply noncatalog token prices as `{input,cachedInput,output,cacheWrite?}`, CNY per million. Unknown pricing fails closed before network access.

Observed noncatalog model identifiers in the current local config (names only):
- `doubao-seed-2.0-mini` (fast classifier/title helper)
- `BAAI/bge-m3` (embedding)
- `embedding-3` (embedding fallback)

Unit-billed tools require explicit `ECOSYSTEM_SERVICE_PRICES_JSON` entries (CNY per service request):
- `rerank:BAAI/bge-reranker-v2-m3`
- `rerank:rerank`
- `search:search_pro`
- `search:api.perplexity.ai` (structured search endpoint)
- `search:sonar`
- `search:kimi-k2.6`
- `image-search:unsplash` (can be explicitly 0 if the actual service policy is free)

BYOK service policy may use `byok:search:*`, `byok:rerank:*`, `byok:image-search:*`, `byok:image:*`, or a specific model key. No fallback to a free price is inferred. All these values must be checked/configured by the coordinator before live feature acceptance. No environment file was edited in this subtask.

Catalog image generation reserves requested image count × trusted per-image price, then settles normalized actual delivered image count. Raw JSON transports retain original response bodies for existing callers; billable token APIs must return verifiable usage. A missing-usage success is not silently free.

## Quota, detail and redemption

Quota view calls `ensure_period_credits(uuid)`, `credit_account_summary(uuid)` and `ecosystem_entitlements(uuid)`. Both historical platform/byok response slots refer to the same shared wallet, marked `sharedWallet:true`; the UI renders one bar plus held credits. It uses the actual rolling allowance period returned by the shared RPC. Displayed cap is available + held + lifetime charged (excluding refunded), not a second local monthly allowance. Canonical pro/pro_plus/ultra tiers are preserved.

Migration `202609270003_usage_detail.sql` creates `ss_usage_ledger`, with auth.users ownership, RLS, own-user SELECT and service-only INSERT. This holds provider detail/historical evidence; inserting any detail cost does not change a wallet. Existing post-use detail insertion is deliberately not the debit mechanism. Its calculated legacy cost fields must not be used to infer authoritative balance.

Redeem uses only `redeem_membership_code(uuid,text)`. It preserves statuses `redeemed`, `already_redeemed`, `higher_tier_kept`, canonical tiers, student verification and lifetime infinity as `null` + `lifetime:true`. No retry or higher-tier response issues a second grant. Invalid codes stay generic, unavailable central service returns 503. No nontransactional app-local redemption fallback exists. Existing StudySolo codes require a reviewed migration into central code semantics; they are not automatically authoritative.

## Verification

- 64 targeted tests passed: billing precision/ordering/denial/stream finish/unknown outcome, raw transport with actual central driver sequence, quota fail-closed behavior, canonical redemption normalization, historical detail utilities, and 28 existing real AI SDK/failover/Anthropic/OpenAI-format regressions adapted to an explicitly admitted test context.
- Quota component React tests: 4 passed.
- TypeScript noEmit passed; targeted ESLint passed.
- Real PostgreSQL provider integration passed in dedicated local container `rootsolo-shared-ledger-test-20260927`; latest retained DB `studysolo_admission_1790452098443`. It exercised the actual SDK admission wrapper against actual shared SQL RPCs: correct 8-microcredit settlement, duplicate/insufficient-funds rejection before provider invocation, uncertain outcome retained as reserved, and detail-table ownership RLS/no financial side effects. Synthetic provider responses were used; no paid external model was invoked by the test.
- Local DBs and logs were retained. No remote database or real environment writes, no commit and no resource deletion by this subtask.

Classolo/class routes and centralCredits were implemented by the sibling and not edited here. Consolidated production build is coordinated with that agent after its dev server stops. RootSolo end-to-end model calls, service pricing review, production reconcilers, browser retries and full project regression remain coordinator acceptance work; local tests do not certify those outcomes.

# StudySolo / Classolo integration specification

Date: 2026-09-27. Status: stage approved for commit; local build/tests passed; production not deployed; release acceptance pending.

## Coordinating-agent verification update

The initial implementation below was committed as ea79583. Subsequent real RootSolo classroom API tests passed save/load, transcript retry deduplication, account-switch rejection, archival and retained storage accounting (769 synthetic bytes). Earlier network failures are retained evidence, no longer the current connectivity conclusion.

ASR is now explicitly configured in protected local and production environments: SiliconFlow `Qwen/Qwen3-ASR-1.7B`, with a verified free rate of 0. The earlier statements below about absent ASR configuration describe the initial handoff. Missing or invalid rates still disable the service; explicit zero uses the same identity/admission/idempotency path and settles zero credits.

A preserved 6.575-second built-in synthetic TTS recording was recognized correctly through the application in 7.361 seconds, and a repeated request was rejected with409. The ledger/admission record was settled with0 microcredits charged. A SenseVoice trial had excessive latency and is not the selected default. Its one uncertain timeout reservation was subsequently reconciled in an exact-operation transaction: explicit zero rate establishes zero financial liability even though the provider outcome remains unknown; no pending ASR test holds remain. No real classroom audio was used. Browser microphone capture, long-running/noisy/Chinese classroom use and production release remain unverified.

The auxiliary model catalog and pricing evidence are in the Ecosystem `migration-20260927/ai-provider-verification.md`. Current-rate source: [SiliconFlow pricing](https://siliconflow.cn/pricing); transport contract: [official transcription API](https://docs.siliconflow.cn/docs/api/audio-transcriptions-post).

## Target

Replace StudySolo `/class` placeholder with the existing Classolo transcript capture, note organizer, mindmap, render-module and classroom-chat capabilities inside the host shell. Preserve original Classolo working tree; copied code is namespaced under this repository and recorded with provenance. Heavy graph/render modules load only with Class mode, following vercel-react-best-practices.

## Boundaries

- Account remains the login/registration/recovery UI. Same-root deployments consume shared HttpOnly sessions; the retained external domain uses the official Supabase OAuth server with PKCE and its own host-only cookie transport. StudySolo validates issuer/user/email/MFA server-side. No independent old Supabase login fallback, custom token issuer or JavaScript cookie writer.
- Cloud classroom tables use ss_class_* and auth.users UUID ownership. Sessions own transcript/note/render/chat records via composite owner/session foreign keys. RLS denies other users, including cross-session writes.
- Original anonymous PGlite tenancy is not carried over. Repository interface is adapted to authenticated StudySolo APIs; offline cache and pending writes use the verified user UUID and are never replayed under a different account.
- Platform API/ASR/search keys stay server-side. Existing capture/resampling is reused; cloud ASR transport processes bounded audio chunks through authenticated server endpoints. UI labels chunk-based ASR as near-real-time, not true streaming.
- AI uses the central ecosystem credit reservation/settlement/cancellation RPC with idempotency. Never give the browser service credentials or let a request choose arbitrary upstream URLs. Unknown upstream outcomes remain reserved for reconciliation.
- Generic StudySolo business names become ss_* where project-specific. Identity, member rights and credit authority come from shared user_profiles/membership/credit APIs; old local grants are historical, not a second authoritative quota pool.
- Class outputs integrate with existing StudySolo notes/assets and shared asset_index. Source classroom records retain provenance. No file or source-data deletion.

## Implementation phases

1. Canonical Account session bridge and Supabase server verification; shared quota adapters.
2. Copy/adapt classroom feature modules and typed repository boundary; cloud schema and local owner-isolated pending persistence.
3. Recording/ASR, notes/mindmap, render modules and chat tool loops through authenticated billed server endpoints.
4. Session library/resume, persistence of all classroom outputs, asset export/index integration and host layout.
5. Unit/integration tests, schema RLS tests in an explicitly approved local fixture, typecheck/build, UI validation. Parent subsequently authorized backing up and configuring local/production environment files; provider administration and remote SQL remain coordinated by the parent.

## Acceptance evidence

Require real capture path and bounded ASR transport, actual AI model API path, save/reopen session, transcripts/notes/render/chat persistence, account-switch isolation, RLS cross-owner denial, quota admission failure preventing upstream calls, retry/settlement idempotency and host navigation. Local mocks prove contracts only; live provider and production acceptance remain explicit external gates.

Original source: ../1037Solo-Classolo/src (read-only; contains user-owned uncommitted work). Existing audit: ../1037Solo-Ecosystem/migration-20260927/studysolo-classolo-audit.md.

## Retained-domain OAuth deployment contract

Canonical production origin is `https://studysolo.1037solo.com`; `https://notebook1b.husteread.icu` remains a compatibility alias during migration. Local development is `http://localhost:35349`. Production and local callbacks are separately registered public PKCE clients with exact callback `/api/account/oauth/callback`. Configure `SUPABASE_OAUTH_CLIENT_ID`, `NEXT_PUBLIC_APP_URL`, `APP_ALLOWED_ORIGINS`, RootSolo `NEXT_PUBLIC_SUPABASE_URL` / publishable anon key and server-only service key. A client secret is unnecessary for these public clients. Do not put service/provider keys in `NEXT_PUBLIC_*` variables.

- `/api/account/oauth/start`: state and S256 PKCE, bounded local return path; only registered official authorize/token endpoints.
- `/api/account/oauth/callback`: exact state and code exchange; validates canonical identity and registered client. Incomplete required MFA becomes a pending local session, not an application login.
- `POST /api/account/session`, `/refresh`, `/logout` consistently use host-only **ss_access_token / ss_refresh_token / ss_remember_me** when the OAuth client is configured. They never fall back to Account's `access_token` / `refresh_token`. This also prevents collisions with Account on another localhost port. Explicit authenticated API Bearer calls remain supported.
- Pending MFA uses **ss_mfa_access_token / ss_mfa_refresh_token / ss_mfa_next**, HttpOnly, path `/api/account`, maximum 15 minutes. Pending sessions cannot authorize classroom or other protected business APIs. `/auth/challenge` loads owned verified TOTP factors through `/api/account/mfa` and submits challenge/verify with exact Origin checking.
- Supabase currently emits a fresh aal1 OAuth session even after aal2 Account consent. Official MFA verification produces aal2 without `client_id`; the BFF immediately performs official OAuth refresh and validates matching user, session_id, registered client_id and aal2 before writing formal cookies. The intermediate token is never an application session. Required MFA means enrolled factors or server-owned admin/super_admin role; ordinary users without MFA need not enroll to log in.
- Logout revokes this OAuth session using local scope and clears only StudySolo's own cookies; Account shared login remains intact. Same-root deployment without an OAuth client uses the Account bridge instead.

`.env.local` overrides `.env.production` in an ordinary Next build. Production builds must inject parsed `.env.production` variables into the child process environment before starting Next. Passing Node `--env-file` directly to Next fails its worker launch on the current toolchain; use a parent Node process with `util.parseEnv` and `spawnSync`, not that flag. Never print the parsed values. Environment backups are in the protected migration backup directory, outside Git.

## Storage, preservation and service configuration

Apply migrations `202609270001_classroom_cloud.sql`, `202609270002_studysolo_content.sql`, and billing companion `202609270003_usage_detail.sql` after the shared foundation and current central RPC migrations. No historical SQL was rewritten. Authenticated users have owner-filtered read access; business writes use verified server endpoints and central storage accounting in the same SQL transaction. Composite session/owner foreign keys prevent child records being attached to another user's classroom. Inactive users and incomplete required MFA cannot read classroom content via RLS.

Class cache keys are `ss-class:v1:<canonical UUID>`; host IndexedDB/localStorage keys are `ss-user:<canonical UUID>:<logical key>`. Original unscoped `gailvlun-db` / `keyval` content and old localStorage values remain where they were. They are intentionally not auto-assigned to the next signed-in user. Recovery requires identifying the original browser profile and legitimate account before explicit owner-scoped import. Original standalone Classolo/PGlite data and dirty source remain untouched.

Transcript and derived notes, renders and chat synchronize to the cloud; raw WAV chunks remain in that user's local IndexedDB and are exportable as a ZIP. Unsynchronized writes retain stable operation keys, and account switching aborts old-owner activity. Local storage capacity errors surface visibly and prevent silent overwrite; do not delete or prune user files to recover space.

Classroom text AI uses existing server model/provider configuration and known positive pricing. ASR additionally requires `CLASS_ASR_BASE_URL`, `CLASS_ASR_API_KEY`, `CLASS_ASR_MODEL`, `CLASS_ASR_CNY_PER_SECOND`; image search requires `CLASS_IMAGE_SEARCH_API_KEY` and `CLASS_IMAGE_SEARCH_CNY_PER_CALL`. Missing service or pricing configuration disables the capability/fails closed. Unknown upstream outcomes remain held for reconciliation, not automatically refunded and retried. See the companion central billing document for existing StudySolo AI routes.

## Verification record (in progress)

- TypeScript passed after the auth/Class/storage integration; full ESLint had 0 errors (19 warnings, including existing React Compiler/TanStack compatibility warnings).
- Local retained PostgreSQL database `rootsolo_studysolo_class_fixture_20260927`: classroom owner isolation, required MFA, server-only writes, cross-owner composite FK rejection, central storage accounting and quota failure rollback passed. Synthetic tests roll back their rows; the source template is unchanged.
- 44 existing local storage/lifecycle/navigation tests pass with owner-scoped fixtures; 2 sync adapter tests verify canonical reads and BFF writes. 19 auth/UI regression tests pass, including fixing stale initial session results overwriting a newer login.
- Full React suite: 182 files / 793 tests pass with four workers. 14 PKCE/cookie isolation tests, 5 local MFA lineage tests and 9 Class provider admission tests are included. A real SDK in-memory session test verifies authenticated quota/Agent transport without JavaScript cookie writes. An additional 9 canonical server auth tests pass, covering missing/inactive profiles, unconfirmed email, wrong issuer, metadata role distrust and required MFA.
- Browser verified signed-out Class mode inside the host shell. Authenticated cloud/classroom, actual microphone/ASR, real model billing and production-browser acceptance remain pending. Mock tests do not claim those paths have passed.
- Static prebuild checks pass: UTF-8, lecture/navigation registry, script ids, KaTeX, recording escapes, media links and SVG rules (94 existing registry warnings, no errors). Full code unit suite after test-only canonical auth/admission fixture migration: 1714 tests, 1713 pass, 0 fail, 1 existing opt-in PostgreSQL skip; real database tests were run separately. Logs remain in ignored `.local-archive`.
- Production environment Next 16.2.9 build passed, including TypeScript and 1406 generated routes/pages. Existing content KaTeX metrics and dynamic filesystem trace warnings remain; they did not fail the build. Dev service subsequently restored on 35349.
- Tracked and newly added files passed credential pattern scans. 318 production browser JavaScript assets were checked against 14 configured private provider/service credentials: no matches. Supabase's publishable anon key is intentionally included in the browser.
- Parent review tightened migrations to require an active profile and confirmed/nondeleted canonical user, removed service DELETE/TRUNCATE, made storage-reference rows service-read-only, and applied them to RootSolo. Parent's fresh all-migration fixture `studysolo_review_20260927092936` passed `tests/sql/canonical-read-gates.sql`; real API acceptance is being conducted separately.
- Latest live acceptance attempt: RootSolo REST connections from this machine failed with TLS `ECONNRESET`, including system curl; management API remained reachable. The real classroom API script failed while reading storage before any classroom mutation: **0 classroom writes**. This does not establish successful business acceptance. MainECS SSH connections were also being closed at this point. Keep the local 35349 development service running for retest when connectivity recovers.
- ASR remains unconfigured. Real browser OAuth consent/denial, local TOTP completion, authenticated classroom save/reopen and real provider billing remain explicit pending release gates; successful compilation or mock tests do not substitute for them.

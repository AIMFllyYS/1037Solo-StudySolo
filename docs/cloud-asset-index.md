# Ordinary synced product asset projection

`supabase/migrations/202609270004_sync_assets.sql` adds a transactional AFTER INSERT/UPDATE trigger on ss_sync_documents and performs an idempotent forward backfill. This migration awaits the coordinator's RootSolo review/application.

Only the product kinds already supported by AgentAssetDetail are included:

| Sync kind | Detail kind |
|---|---|
| user-note | note |
| review-card | flashcard |
| document | document |
| artifact | artifact |

Settings, skills, scheduler internals and conversation/project containers are excluded. StudySolo's current product semantics place conversations in the sidebar rather than the artifact catalog. Class sessions retain their independent class-session producer.

The source key is the globally unique ss_sync_documents row UUID, not client_id (which is only unique per user and kind). Existing asset-owner conflicts and source user/kind/client identity changes reject the whole transaction. The source payload is never copied to index metadata; metadata contains only kind. Deleted rows are archived, not physically removed.

The stable entry is `/agent/assets/open?kind=<detail kind>&id=<encoded client_id>`. Query data avoids treating dots or slashes in source IDs as route segments. The page parses supported kinds and passes the single-decoded ID to the existing owner-scoped local/synced asset detail. A different account cannot read another user's cloud data, and an unsynced device displays the existing unavailable/unrestored state rather than substituting another user's asset.

This producer never reserves/releases storage. Existing ss_account_row_storage remains authoritative; the backfill only writes asset_index and therefore cannot charge existing content twice. Archiving retains historical storage consumption.

The ecosystem's local `test-asset-producers.py` verifies different owners sharing a client_id, rename, tombstone archival, cross-owner rejection with rollback, internal-kind exclusion, UTF8 query round-trip (including slash, question mark and hash), unchanged storage totals on backfill, service RPC denial and RLS. No production data or credentials are included in fixtures.

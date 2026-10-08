import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const inactiveMeter = process.argv.includes('--inactive-meter');
const concurrencyGuards = process.argv.includes('--concurrency-guards');
const version = inactiveMeter ? '202610090002' : concurrencyGuards ? '202610090001' : '202610080002';
const project = 'zizaonaxfguvlzdcbxzw';
const sqlFile = inactiveMeter ? 'supabase/migrations/202610090002_inactive_asset_meter.sql' : concurrencyGuards ? 'supabase/migrations/202610090001_asset_concurrency_guards.sql' : 'supabase/migrations/202610080002_asset_versions.sql';
function managementToken() {
    if (process.env.SUPABASE_ACCESS_TOKEN)
        return process.env.SUPABASE_ACCESS_TOKEN;
    if (!process.argv.includes('--parent-mcp'))
        throw new Error('management_token_required');
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
    const config = JSON.parse(fs.readFileSync(resolve(common, '..', '..', '.mcp.json'), 'utf8'));
    const server = config.mcpServers?.supabase, args: string[] = server?.args ?? [], index = args.indexOf('--access-token');
    const token = index >= 0 ? args[index + 1] : server?.env?.SUPABASE_ACCESS_TOKEN;
    if (!token)
        throw new Error('parent_supabase_token_missing');
    return token;
}
const normalize = (value: string) => value.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
async function main() {
    const token = managementToken();
    const query = async (sql: string, readOnly = true) => {
        const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql, read_only: readOnly }), signal: AbortSignal.timeout(60000) });
        if (!response.ok)
            throw new Error(`management_http_${response.status}`);
        return response.json();
    };
    const history = await query(`select version,name from supabase_migrations.schema_migrations where version='${version}'`);
    const audit = await query(`SELECT
      (SELECT count(*) FROM public.storage_accounts a WHERE a.used_bytes<>(SELECT coalesce(sum(o.size_bytes),0) FROM public.storage_objects o WHERE o.user_id=a.user_id AND o.state='committed')) AS ledger_account_mismatches,
      (SELECT count(*) FROM public.ss_sync_documents d JOIN public.ss_data_storage_refs r ON r.table_name='ss_sync_documents' AND r.row_key=d.id::text JOIN public.storage_objects o ON o.user_id=r.user_id AND o.request_key=r.storage_request_key AND o.project_id='studysolo' WHERE d.deleted AND o.state='committed') AS deleted_inline_still_charged,
      (SELECT count(*) FROM public.ss_data_storage_refs r LEFT JOIN public.storage_objects o ON o.user_id=r.user_id AND o.request_key=r.storage_request_key AND o.project_id='studysolo' WHERE o.id IS NULL) AS unverifiable_row_refs`);
    fs.mkdirSync('.local-archive', { recursive: true });
    fs.writeFileSync('.local-archive/governance-quota-audit.json', JSON.stringify({ project, readOnly: true, entitlementChanges: false, audit }, null, 2));
    console.log(JSON.stringify({ quotaAudit: audit, adjusted: false }));
    if (history.length) {
        console.log(JSON.stringify({ applied: true, replayed: false, history }));
        return;
    }
    if (inactiveMeter) {
        for (const [name, file] of [['ss_account_row_storage', '202610080002_asset_versions.sql'], ['ss_sync_document_asset', '202610080002_asset_versions.sql'], ['ss_sync_commit', '202610090001_asset_concurrency_guards.sql'], ['ss_sync_archive', '202610090001_asset_concurrency_guards.sql']]) {
            const previous = fs.readFileSync('supabase/migrations/' + file, 'utf8'), start = previous.indexOf('FUNCTION public.' + name + '('), body = previous.slice(start, previous.indexOf('END $$;', start) + 'END $$;'.length).split('AS $$')[1].split('$$;')[0];
            const liveFunction = await query(`select prosrc from pg_proc where pronamespace='public'::regnamespace and proname='${name}'`);
            if (normalize(liveFunction[0]?.prosrc ?? '') !== normalize(body))
                throw new Error('inactive_meter_contract_drift_do_not_overwrite');
        }
        console.log(JSON.stringify({ inactiveMeterPreflight: true }));
    }
    else if (concurrencyGuards) {
        const previous = fs.readFileSync('supabase/migrations/202610080002_asset_versions.sql', 'utf8');
        for (const name of ['ss_sync_prepare', 'ss_sync_commit', 'ss_sync_archive']) {
            const start = previous.indexOf('CREATE FUNCTION public.' + name + '('), body = previous.slice(start, previous.indexOf('END $$;', start) + 'END $$;'.length).split('AS $$')[1].split('$$;')[0];
            const liveFunction = await query(`select prosrc from pg_proc where pronamespace='public'::regnamespace and proname='${name}'`);
            if (normalize(liveFunction[0]?.prosrc ?? '') !== normalize(body))
                throw new Error('asset_rpc_contract_drift_do_not_overwrite');
        }
        console.log(JSON.stringify({ concurrencyGuardsPreflight: true }));
    }
    else {
        const fixture = JSON.parse(fs.readFileSync('lib/files/fixtures/storage-foundation.json', 'utf8')).sql as string;
        const start = fixture.indexOf('CREATE FUNCTION public.storage_apply'), section = fixture.slice(start, fixture.indexOf('CREATE FUNCTION public.review_tool', start)), before = section.split('AS $$')[1].split('$$;')[0];
        const live = await query("select prosrc from pg_proc where oid=to_regprocedure('public.storage_apply(uuid,text,text,text,bigint,text,text,text)')");
        if (normalize(live[0]?.prosrc ?? '') !== normalize(before))
            throw new Error('central_storage_contract_drift_do_not_overwrite');
        const rowMigration = fs.readFileSync('supabase/migrations/202609270002_studysolo_content.sql', 'utf8');
        const rowStart = rowMigration.indexOf('CREATE OR REPLACE FUNCTION public.ss_account_row_storage()'), rowBefore = rowMigration.slice(rowStart, rowMigration.indexOf('REVOKE ALL ON FUNCTION public.ss_account_row_storage()', rowStart)).split('AS $$')[1].split('END $$;')[0] + 'END';
        const rowLive = await query("select prosrc from pg_proc where oid=to_regprocedure('public.ss_account_row_storage()')");
        fs.writeFileSync('.local-archive/row-meter-before.sql', rowLive[0]?.prosrc ?? '');
        if (normalize(rowLive[0]?.prosrc ?? '') !== normalize(rowBefore))
            throw new Error('row_meter_contract_drift_do_not_overwrite');
        const tables = await query("select to_regclass('public.ss_user_files') is not null as files_ready,to_regclass('public.ss_sync_documents') is not null as sync_ready,to_regclass('public.ss_class_sessions') is not null as class_ready,to_regclass('public.ss_sync_body_chunks') is not null as already_present");
        if (!tables[0].files_ready || !tables[0].sync_ready || !tables[0].class_ready || tables[0].already_present)
            throw new Error('schema_precondition_failed');
        fs.mkdirSync('.local-archive', { recursive: true });
        fs.writeFileSync('.local-archive/storage-contract-before.sql', live[0].prosrc);
        console.log(JSON.stringify({ preflight: tables, centralContractVerified: true }));
    }
    if (!process.argv.includes('--apply'))
        return;
    if (Number(audit[0].ledger_account_mismatches) !== 0 || Number(audit[0].unverifiable_row_refs) !== 0)
        throw new Error('quota_audit_requires_investigation');
    const source = fs.readFileSync(sqlFile, 'utf8'), tag = '$governance_' + version + '$';
    if (source.includes(tag) || !/COMMIT;\s*$/.test(source))
        throw new Error('migration_transaction_invalid');
    const registered = source.replace(/COMMIT;\s*$/, () => `INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${inactiveMeter ? 'inactive_asset_meter' : concurrencyGuards ? 'asset_concurrency_guards' : 'asset_versions'}',ARRAY[${tag}${source}${tag}]);\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n`);
    await query(registered, false);
    const verified = await query("select proname,prosecdef,has_function_privilege('anon',oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',oid,'EXECUTE') as user_execute,has_function_privilege('service_role',oid,'EXECUTE') as server_execute from pg_proc where pronamespace='public'::regnamespace and proname in ('ss_sync_prepare','ss_sync_commit','ss_sync_archive','ss_sync_cancel','ss_file_restore','ss_class_archive')");
    const bucket = await query("select id,public,file_size_limit from storage.buckets where id='ss-asset-bodies'");
    if (verified.length !== 6 || verified.some((rpc: {
        anon_execute: boolean;
        user_execute: boolean;
        server_execute: boolean;
    }) => rpc.anon_execute || rpc.user_execute || !rpc.server_execute) || bucket.length !== 1 || bucket[0].public || Number(bucket[0].file_size_limit) !== 8388608)
        throw new Error('post_migration_verification_failed');
    const receipt = { applied: true, project, version, sha256: createHash('sha256').update(source).digest('hex'), verified, bucket };
    fs.writeFileSync(inactiveMeter ? '.local-archive/governance-inactive-migration-receipt.json' : concurrencyGuards ? '.local-archive/governance-concurrency-migration-receipt.json' : '.local-archive/governance-migration-receipt.json', JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
}
void main().catch(error => { console.log(JSON.stringify({ available: false, error: error instanceof Error ? error.message : 'migration_failed' })); process.exitCode = 1; });

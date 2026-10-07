import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { resolveManagementAuthEnv, stripEnvValue } from '../../lib/auth/env';

// Do not log credentials, query responses containing user rows, or private bodies.
for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) process.env[match[1]!] = stripEnvValue(match[2]!);
  }
}
if (process.argv.includes('--parent-mcp')) {
  const config = JSON.parse(fs.readFileSync(resolve(process.cwd(), '..', '.mcp.json'), 'utf8'));
  const server = config.mcpServers?.supabase;
  const args: string[] = server?.args ?? [];
  const index = args.indexOf('--access-token');
  const token = index >= 0 ? args[index + 1] : args.find(arg => arg.startsWith('--access-token='))?.slice('--access-token='.length) ?? server?.env?.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('parent_supabase_access_token_missing');
  process.env.SUPABASE_ACCESS_TOKEN = token;
}
const env = resolveManagementAuthEnv();
if (env.projectRef !== 'zizaonaxfguvlzdcbxzw') throw new Error('wrong_project');
async function query(sql: string, readOnly = true) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${env.projectRef}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${env.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql, read_only: readOnly }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`management_http_${response.status}`);
  return response.json();
}
async function main() { try {
  const before = await query("select to_regclass('public.ss_user_files') is not null as file_table_exists, to_regprocedure('public.storage_apply(uuid,text,text,text,bigint,text,text,text)') is not null as unified_quota_exists, to_regclass('public.asset_index') is not null as asset_index_exists");
  console.log(JSON.stringify({ preflight: before }));
  const history = await query("select version,name from supabase_migrations.schema_migrations where version='202610080001'");
  console.log(JSON.stringify({ migrationHistory: history }));
  if (process.argv.includes('--apply')) {
    if (before[0]?.file_table_exists) throw new Error('already_present_do_not_replay');
    if (history.length) throw new Error('migration_version_already_present_do_not_replay');
    if (!before[0]?.unified_quota_exists || !before[0]?.asset_index_exists) throw new Error('required_shared_contract_missing');
    const sql = fs.readFileSync('supabase/migrations/202610080001_user_cloud_files.sql', 'utf8');
    const tag = '$ss_cloud_files_202610080001$';
    if (sql.includes(tag) || !/COMMIT;\s*$/.test(sql)) throw new Error('migration_transaction_contract_invalid');
    const registered = sql.replace(/COMMIT;\s*$/, `INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('202610080001','user_cloud_files',ARRAY[${tag}${sql}${tag}]);\nNOTIFY pgrst, 'reload schema';\nCOMMIT;\n`);
    await query(registered, false);
    console.log(JSON.stringify({ applied: true, sha256: createHash('sha256').update(sql).digest('hex') }));
  }
  const after = await query("select c.relrowsecurity as rls, has_table_privilege('anon',c.oid,'SELECT') as anon_read, has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_read, has_table_privilege('service_role',c.oid,'DELETE') as service_delete from pg_class c where c.oid=to_regclass('public.ss_user_files')");
  console.log(JSON.stringify({ verification: after }));
  if (before[0]?.file_table_exists || process.argv.includes('--apply')) {
    console.log(JSON.stringify({ rpcPermissions: await query("select proname,prosecdef as security_definer,has_function_privilege('anon',oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',oid,'EXECUTE') as authenticated_execute,has_function_privilege('service_role',oid,'EXECUTE') as service_execute from pg_proc where oid in (to_regprocedure('public.ss_file_prepare(uuid,uuid,text,text,bigint,text,bigint,text,text)'),to_regprocedure('public.ss_file_transition(uuid,uuid,text)'))"), bucket: await query("select id,public,file_size_limit from storage.buckets where id='ss-user-files'"), finalHistory: await query("select version,name from supabase_migrations.schema_migrations where version='202610080001'") }));
  }
} catch (error) { console.log(JSON.stringify({ available: false, error: error instanceof Error ? error.message : 'unavailable' })); process.exitCode = 1; } }
void main();

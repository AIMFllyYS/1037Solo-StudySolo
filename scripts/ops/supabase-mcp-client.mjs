/** Local MCP bridge for the parent workspace's Supabase server.
 * Credentials are read from .mcp.json at runtime and passed only as child env.
 * This command never prints credentials, SQL, or arbitrary database rows.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const operation = process.argv[2];
const serverName = process.argv[3] ?? 'supabase';
const projectId = process.argv[4];
const file = process.argv[5];
const allowed = new Set(['list_projects', 'list_migrations', 'list_tables', 'execute_sql', 'apply_migration']);
if (!allowed.has(operation) || !['supabase', 'supabase-legacy'].includes(serverName)) throw new Error('unsupported_operation_or_server');
const config = JSON.parse(readFileSync(resolve(process.cwd(), '..', '.mcp.json'), 'utf8'));
const entry = config.mcpServers?.[serverName];
if (entry?.command !== 'npx' || entry.args?.[1] !== '@supabase/mcp-server-supabase@latest' || entry.args?.[2] !== '--access-token') throw new Error('unexpected_mcp_configuration');
const token = entry.args[3];
if (typeof token !== 'string' || !/^sbp_[a-zA-Z0-9]+$/.test(token)) throw new Error('invalid_mcp_credential_format');
if (operation !== 'list_projects' && (!projectId || !/^[a-z0-9]{20}$/.test(projectId))) throw new Error('project_id_required');
if (['execute_sql', 'apply_migration'].includes(operation) && !file) throw new Error('sql_file_required');
if (file) {
  const target = resolve(file);
  const allowedRoot = operation === 'apply_migration' ? resolve(process.cwd(), 'supabase', 'migrations') : resolve(process.cwd(), 'supabase', 'audits');
  const evidenceRoot = resolve(process.cwd(), 'artifacts', 'performance');
  if (!target.startsWith(allowedRoot + '\\') && !(operation === 'execute_sql' && target.startsWith(evidenceRoot + '\\'))) throw new Error('sql_file_outside_allowed_scope');
}

const child = spawn(process.execPath, [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), '-y', '@supabase/mcp-server-supabase@latest'], {
  cwd: process.cwd(), shell: false, windowsHide: true,
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let nextId = 1;
const pending = new Map();
const timeout = setTimeout(() => { child.kill(); for (const item of pending.values()) item.reject(new Error('mcp_timeout')); }, 60_000);
child.stderr.resume(); // Do not echo credentials or server internals.
const lines = createInterface({ input: child.stdout });
lines.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (typeof message.id !== 'number') return;
  const item = pending.get(message.id);
  if (!item) return;
  pending.delete(message.id);
  if (message.error) item.reject(new Error(`mcp_rpc_${message.error.code ?? 'error'}`));
  else item.resolve(message.result);
});
function request(method, params) {
  const id = nextId++;
  return new Promise((resolveRequest, reject) => {
    pending.set(id, { resolve: resolveRequest, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
function toolData(result) {
  if (result?.isError) throw new Error('mcp_tool_error');
  const block = result?.content?.find((item) => item.type === 'text');
  if (!block) return result?.structuredContent ?? {};
  try { return JSON.parse(block.text); } catch { return { text: String(block.text).slice(0, 300) }; }
}
function summarize(data) {
  if (operation === 'list_projects') {
    const rows = Array.isArray(data) ? data : data.projects ?? data.data ?? [];
    return { projects: rows.map((row) => ({ id: row.id, name: row.name, region: row.region, status: row.status })) };
  }
  if (operation === 'list_migrations') {
    const rows = Array.isArray(data) ? data : data.migrations ?? data.data ?? [];
    return { shape: Object.keys(data ?? {}), migrations: rows.map((row) => ({ version: row.version, name: row.name })) };
  }
  if (operation === 'list_tables') {
    const rows = Array.isArray(data) ? data : data.tables ?? data.data ?? [];
    return { tables: rows.map((row) => ({ schema: row.schema, name: row.name })) };
  }
  if (operation === 'execute_sql') {
    const match = typeof data?.result === 'string' ? /<untrusted-data-[^>]+>\s*(\[[\s\S]*?\])\s*<\/untrusted-data-[^>]+>/.exec(data.result) : null;
    if (!match) throw new Error('unexpected_sql_result_shape');
    const rows = JSON.parse(match[1]);
    return { rows: Array.isArray(rows) ? rows.slice(0, 100) : rows };
  }
  if (operation === 'apply_migration') return { success: data?.success === true };
  return { status: data?.error ? 'error' : 'ok', error: data?.error?.message ?? undefined };
}

try {
  await request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'studysolo-migration-audit', version: '1.0.0' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  let args = operation === 'list_projects' ? {} : { project_id: projectId };
  if (operation === 'list_tables') args = { ...args, schemas: ['public'], verbose: false };
  if (operation === 'execute_sql') args = { ...args, query: readFileSync(resolve(file), 'utf8') };
  if (operation === 'apply_migration') {
    const filename = file.split(/[\\/]/).at(-1).replace(/\.sql$/, '');
    const matched = /^(\d+)_([a-z][a-z0-9_]*)$/.exec(filename);
    if (!matched) throw new Error('migration_filename_invalid');
    args = { ...args, name: `${matched[2]}_${matched[1]}`, query: readFileSync(resolve(file), 'utf8') };
  }
  const result = await request('tools/call', { name: operation, arguments: args });
  const data = toolData(result);
  process.stdout.write(JSON.stringify(summarize(data)) + '\n');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'mcp_unknown_error'}\n`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  child.stdin.end();
  child.kill();
}

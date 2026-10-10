export const BOOTSTRAP_SQL = `
create table if not exists public.schema_migrations (
  version    text primary key,
  name       text not null,
  checksum   text not null,
  applied_at timestamptz not null default now()
);

alter table public.schema_migrations enable row level security;

revoke all on table public.schema_migrations from anon, authenticated;
grant select, insert, update, delete on table public.schema_migrations to postgres, service_role;
`.trim();

export const SELECT_APPLIED_SQL = `
select version, name, checksum, applied_at::text as applied_at
from public.schema_migrations
order by version
`.trim();

export const LIVE_INVENTORY_SQL = `
with tables as (
  select json_agg(table_name order by table_name) as tables
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
),
indexes as (
  select json_agg(indexname order by indexname) as indexes
  from pg_indexes
  where schemaname = 'public'
),
policies as (
  select json_agg(policyname order by policyname) as policies
  from pg_policies
  where schemaname = 'public'
),
funcs as (
  select json_agg(proname order by proname) as functions
  from (
    select distinct p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid = d.refobjid
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  ) f
),
trigs as (
  select json_agg(t.tgname order by t.tgname) as triggers
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal
    and (
      n.nspname = 'public'
      or (n.nspname = 'auth' and t.tgname = 'on_auth_user_created')
    )
),
rls as (
  select json_agg(c.relname order by c.relname) as rls_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
),
grants as (
  select json_agg(grant_key order by grant_key) as grants
  from (
    select distinct format('table:%s:%s:%s', c.relname, x.privilege_type, r.rolname) as grant_key
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
    join pg_roles r on r.oid = x.grantee
    where n.nspname = 'public'
      and c.relkind = 'r'
      and r.rolname in ('anon', 'authenticated', 'service_role')
      and x.privilege_type <> 'MAINTAIN'
    union
    select distinct format('schema:%s:%s:%s', n.nspname, x.privilege_type, r.rolname)
    from pg_namespace n
    cross join lateral aclexplode(coalesce(n.nspacl, '{}'::aclitem[])) x
    join pg_roles r on r.oid = x.grantee
    where n.nspname = 'public'
      and r.rolname in ('anon', 'authenticated', 'service_role')
      and x.privilege_type <> 'MAINTAIN'
    union
    select distinct format('function:%s:%s:%s', p.proname, x.privilege_type, r.rolname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) x
    join pg_roles r on r.oid = x.grantee
    where n.nspname = 'public'
      and p.prokind = 'f'
      and r.rolname in ('anon', 'authenticated', 'service_role')
      and x.privilege_type <> 'MAINTAIN'
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid = d.refobjid
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  ) g
)
select
  coalesce((select tables from tables), '[]'::json) as tables,
  coalesce((select indexes from indexes), '[]'::json) as indexes,
  coalesce((select policies from policies), '[]'::json) as policies,
  coalesce((select functions from funcs), '[]'::json) as functions,
  coalesce((select triggers from trigs), '[]'::json) as triggers,
  coalesce((select rls_tables from rls), '[]'::json) as rls_tables,
  coalesce((select grants from grants), '[]'::json) as grants
`.trim();
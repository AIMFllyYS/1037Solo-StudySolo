-- REVIEW CANDIDATE ONLY: never applied to a live database by the application.
-- Unit tests may apply it only to their isolated in-memory PostgreSQL fixture.
-- Requires current RootSolo schema/history/ACL audit and parent approval.
-- Additive RPC, no edits/replay of the already applied 006 or historic SQL.
begin;
create or replace function public.ss_agent_execution_reserve_reconciled(
  p_id uuid,p_owner uuid,p_micro_cny bigint,p_month text,p_run text,
  p_month_cap bigint,p_run_cap bigint,p_expires_at timestamptz,p_import_fingerprint text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ss_agent_execution_capacity',0));
  if p_import_fingerprint !~ '^[a-f0-9]{64}$' or p_import_fingerprint is null
    or not exists(select 1 from public.ss_agent_execution_budgets
      where period_key='legacy:'||p_import_fingerprint
        and reserved_micro_cny=1800000 and cap_micro_cny=1800000) then
    raise exception 'budget_not_reconciled';
  end if;
  if exists(select 1 from public.ss_agent_execution_reservations where id=p_id) then
    return public.ss_agent_execution_reserve(p_id,p_owner,p_micro_cny,p_month,p_run,
      p_month_cap,p_run_cap,p_expires_at);
  end if;
  -- Creation/termination uncertainty does not expire merely with the local TTL.
  if exists(select 1 from public.ss_agent_execution_reservations where released_at is null)
    then return false; end if;
  -- Existing RPC validates amount/month/run/caps/owner FK and updates both
  -- explicit run/month periods under the same reentrant transaction lock.
  return public.ss_agent_execution_reserve(p_id,p_owner,p_micro_cny,p_month,p_run,
    p_month_cap,p_run_cap,p_expires_at);
end $$;
revoke all on function public.ss_agent_execution_reserve_reconciled(uuid,uuid,bigint,text,text,bigint,bigint,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ss_agent_execution_reserve_reconciled(uuid,uuid,bigint,text,text,bigint,bigint,timestamptz,text) to service_role;
comment on function public.ss_agent_execution_reserve_reconciled(uuid,uuid,bigint,text,text,bigint,bigint,timestamptz,text)
  is '【ss_ StudySolo】Shared operator-budget admission; reviewed legacy import and unresolved capacity checked atomically. Not user wallet billing.';
commit;

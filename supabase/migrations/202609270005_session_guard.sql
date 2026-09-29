-- Reuse the canonical session rule, including Auth bans and mandatory staff MFA.
BEGIN;
CREATE OR REPLACE FUNCTION public.ss_class_can_read(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.ecosystem_user_can_read(p_user_id);
$$;
REVOKE ALL ON FUNCTION public.ss_class_can_read(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ss_class_can_read(uuid) TO authenticated,service_role;
COMMIT;

-- Merge classroom profile and linked note identity atomically across devices.
BEGIN;
CREATE OR REPLACE FUNCTION public.ss_class_patch_session_payload(
  p_user_id uuid,p_session_id uuid,p_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE next_payload jsonb;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
    OR p_patch='{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) key WHERE key NOT IN ('profile','noteId')) THEN
    RAISE EXCEPTION 'invalid_class_session_patch' USING ERRCODE='22023';
  END IF;
  UPDATE public.ss_class_sessions
    SET payload=coalesce(payload,'{}'::jsonb)||p_patch
    WHERE id=p_session_id AND user_id=p_user_id
    RETURNING payload INTO next_payload;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_session_not_owned' USING ERRCODE='42501'; END IF;
  RETURN next_payload;
END;
$$;
REVOKE ALL ON FUNCTION public.ss_class_patch_session_payload(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_class_patch_session_payload(uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

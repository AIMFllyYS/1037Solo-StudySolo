-- Atomic outline revision and operation replay. Apply before the matching Class server release.
BEGIN;
ALTER TABLE public.ss_class_outlines ADD COLUMN IF NOT EXISTS last_operation_key uuid;

CREATE OR REPLACE FUNCTION public.ss_class_save_outline(
  p_user_id uuid, p_session_id uuid, p_expected_revision integer,
  p_revision integer, p_outline jsonb, p_operation_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE current_row public.ss_class_outlines%ROWTYPE;
BEGIN
  IF p_expected_revision IS NULL OR p_revision IS NULL OR p_expected_revision<0 OR p_revision<=p_expected_revision OR p_operation_key IS NULL
    OR jsonb_typeof(p_outline) IS DISTINCT FROM 'object' OR jsonb_typeof(p_outline->'nodes') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_outline->'nodes')>300 THEN
    RAISE EXCEPTION 'invalid_outline_revision_or_payload' USING ERRCODE='22023';
  END IF;
  -- Lock the existing owner/session row even for the first outline write, closing the insert race.
  PERFORM 1 FROM public.ss_class_sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_session_not_owned' USING ERRCODE='42501'; END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_outline->'nodes') n
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(n->'sourceSegmentIds','[]'::jsonb)) source
    WHERE NOT EXISTS(SELECT 1 FROM public.ss_class_transcripts t
      WHERE t.id::text=source.value AND t.session_id=p_session_id AND t.user_id=p_user_id)
  ) THEN RAISE EXCEPTION 'invalid_outline_source' USING ERRCODE='22023'; END IF;
  SELECT * INTO current_row FROM public.ss_class_outlines WHERE session_id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF FOUND THEN
    IF current_row.last_operation_key=p_operation_key THEN
      IF current_row.revision<>p_revision OR current_row.payload<>p_outline THEN
        RAISE EXCEPTION 'operation_key_payload_mismatch' USING ERRCODE='22023';
      END IF;
      RETURN jsonb_build_object('status','saved','revision',current_row.revision);
    END IF;
    IF current_row.revision<>p_expected_revision THEN
      RETURN jsonb_build_object('status','conflict','revision',current_row.revision,'payload',current_row.payload);
    END IF;
    UPDATE public.ss_class_outlines SET revision=p_revision,payload=p_outline,
      last_operation_key=p_operation_key,updated_at=now() WHERE session_id=p_session_id AND user_id=p_user_id;
  ELSE
    IF p_expected_revision<>0 THEN RETURN jsonb_build_object('status','conflict','revision',0,'payload',NULL); END IF;
    INSERT INTO public.ss_class_outlines(session_id,user_id,revision,payload,last_operation_key)
      VALUES(p_session_id,p_user_id,p_revision,p_outline,p_operation_key);
  END IF;
  UPDATE public.ss_class_sessions SET updated_at=now() WHERE id=p_session_id AND user_id=p_user_id;
  RETURN jsonb_build_object('status','saved','revision',p_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.ss_class_save_outline(uuid,uuid,integer,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_class_save_outline(uuid,uuid,integer,integer,jsonb,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

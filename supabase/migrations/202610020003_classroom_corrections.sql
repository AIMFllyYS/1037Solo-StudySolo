-- Student-approved transcript overlays. Original ASR rows remain immutable.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ss_class_transcript_owner_target') THEN
    ALTER TABLE public.ss_class_transcripts ADD CONSTRAINT ss_class_transcript_owner_target UNIQUE(id,session_id,user_id);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.ss_class_corrections(
  session_id uuid NOT NULL,
  segment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision>=1),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  last_operation_key uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,segment_id),
  FOREIGN KEY(segment_id,session_id,user_id) REFERENCES public.ss_class_transcripts(id,session_id,user_id)
);
ALTER TABLE public.ss_class_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ss_class_corrections FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ss_class_corrections TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ss_class_corrections TO service_role;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ss_class_corrections' AND policyname='class_owner_read') THEN
    CREATE POLICY class_owner_read ON public.ss_class_corrections FOR SELECT TO authenticated USING(public.ss_class_can_read(user_id));
  END IF;
END $$;
CREATE OR REPLACE TRIGGER ss_class_correction_revision AFTER INSERT OR UPDATE ON public.ss_class_corrections
  FOR EACH ROW EXECUTE FUNCTION public.ss_class_child_revision();

CREATE OR REPLACE FUNCTION public.ss_class_save_correction(
  p_user_id uuid,p_session_id uuid,p_segment_id uuid,p_expected_revision integer,
  p_next_text text,p_history jsonb,p_operation_key uuid,p_action_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE current_row public.ss_class_corrections%ROWTYPE;
DECLARE next_row jsonb;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_operation_key IS NULL
    OR p_next_text IS NULL OR char_length(p_next_text)>20000
    OR p_action_hash !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_history) IS DISTINCT FROM 'array' OR jsonb_array_length(p_history)>64 THEN
    RAISE EXCEPTION 'invalid_correction_payload' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.ss_class_transcripts WHERE id=p_segment_id AND session_id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_segment_not_owned' USING ERRCODE='42501'; END IF;
  SELECT * INTO current_row FROM public.ss_class_corrections WHERE session_id=p_session_id AND segment_id=p_segment_id AND user_id=p_user_id FOR UPDATE;
  next_row=jsonb_build_object('sessionId',p_session_id,'segmentId',p_segment_id,'revision',p_expected_revision+1,'correctedText',p_next_text,'history',p_history,'actionHash',p_action_hash);
  IF FOUND THEN
    IF current_row.last_operation_key=p_operation_key THEN
      IF current_row.revision<>p_expected_revision+1 OR current_row.payload<>next_row THEN
        RAISE EXCEPTION 'operation_key_payload_mismatch' USING ERRCODE='22023';
      END IF;
      RETURN jsonb_build_object('status','saved','revision',current_row.revision,'row',current_row.payload);
    END IF;
    IF current_row.revision<>p_expected_revision THEN
      RETURN jsonb_build_object('status','conflict','revision',current_row.revision,'row',current_row.payload);
    END IF;
    UPDATE public.ss_class_corrections SET revision=p_expected_revision+1,payload=next_row,
      last_operation_key=p_operation_key,updated_at=clock_timestamp()
      WHERE session_id=p_session_id AND segment_id=p_segment_id AND user_id=p_user_id;
  ELSE
    IF p_expected_revision<>0 THEN RETURN jsonb_build_object('status','conflict','revision',0,'row',NULL); END IF;
    INSERT INTO public.ss_class_corrections(session_id,segment_id,user_id,revision,payload,last_operation_key)
      VALUES(p_session_id,p_segment_id,p_user_id,1,next_row,p_operation_key);
  END IF;
  RETURN jsonb_build_object('status','saved','revision',p_expected_revision+1,'row',next_row);
END;
$$;
REVOKE ALL ON FUNCTION public.ss_class_save_correction(uuid,uuid,uuid,integer,text,jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_class_save_correction(uuid,uuid,uuid,integer,text,jsonb,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

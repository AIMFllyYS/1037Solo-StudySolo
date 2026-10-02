SELECT
  (SELECT count(*) FROM public.ss_class_sessions) AS sessions,
  (SELECT count(*) FROM public.ss_class_transcripts) AS transcript_segments,
  (SELECT count(*) FROM public.ss_class_outlines) AS outlines,
  (SELECT count(*) FROM public.ss_class_renders) AS renders,
  (SELECT count(*) FROM public.ss_class_chats) AS chats,
  (SELECT count(*) FROM public.ss_class_corrections) AS corrections,
  (SELECT count(*) FROM pg_trigger WHERE tgname IN (
    'ss_class_revision_before_update','ss_class_transcript_revision','ss_class_outline_revision',
    'ss_class_render_revision','ss_class_chat_revision','ss_class_correction_revision'
  ) AND NOT tgisinternal) AS revision_triggers,
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.ss_class_corrections'::regclass) AS corrections_rls,
  has_function_privilege('anon','public.ss_class_save_outline(uuid,uuid,integer,integer,jsonb,uuid)','EXECUTE') AS anon_outline_execute,
  has_function_privilege('authenticated','public.ss_class_save_correction(uuid,uuid,uuid,integer,text,jsonb,uuid,text)','EXECUTE') AS authenticated_correction_execute,
  has_function_privilege('service_role','public.ss_class_patch_session_payload(uuid,uuid,jsonb)','EXECUTE') AS service_payload_execute;

SELECT
  to_regclass('supabase_migrations.schema_migrations')::text AS migration_history_table,
  to_regclass('public.ss_class_sessions')::text AS class_sessions_table,
  to_regclass('public.ss_class_outlines')::text AS class_outlines_table,
  to_regclass('public.ss_class_corrections')::text AS corrections_table,
  to_regprocedure('public.ss_class_can_read(uuid)') IS NOT NULL AS has_class_read_guard,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ss_class_sessions' AND column_name='payload' AND udt_name='jsonb') AS has_session_json_payload,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ss_class_transcripts' AND column_name='id' AND udt_name='uuid') AS has_transcript_uuid_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ss_class_sessions' AND column_name='cloud_revision') AS has_cloud_revision,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ss_class_outlines' AND column_name='last_operation_key') AS has_outline_operation_key,
  to_regprocedure('public.ss_class_save_outline(uuid,uuid,integer,integer,jsonb,uuid)') IS NOT NULL AS has_outline_cas,
  to_regprocedure('public.ss_class_save_correction(uuid,uuid,uuid,integer,text,jsonb,uuid,text)') IS NOT NULL AS has_correction_cas,
  to_regprocedure('public.ss_class_patch_session_payload(uuid,uuid,jsonb)') IS NOT NULL AS has_session_payload_patch;

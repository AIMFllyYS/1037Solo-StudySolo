BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
 VALUES('f4444444-4444-4444-8444-444444444444','gates@example.invalid',now(),false,false);
INSERT INTO public.ss_class_sessions(id,user_id,title,status) VALUES
 ('f5555555-5555-4555-8555-555555555555','f4444444-4444-4444-8444-444444444444','Synthetic gate check','ended');
INSERT INTO public.ss_usage_ledger(user_id,pool,route,kind)
 VALUES('f4444444-4444-4444-8444-444444444444','platform','fixture','llm');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"f4444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.ss_class_sessions) OR EXISTS(SELECT 1 FROM public.ss_usage_ledger) THEN RAISE EXCEPTION 'missing profile can read'; END IF;
END $$;
RESET ROLE;
INSERT INTO public.user_profiles(id,email,is_active,account_role)
 VALUES('f4444444-4444-4444-8444-444444444444','gates@example.invalid',true,'user');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.ss_class_sessions)<>1 OR (SELECT count(*) FROM public.ss_usage_ledger)<>1 THEN RAISE EXCEPTION 'confirmed active profile denied'; END IF;
END $$;
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=NULL WHERE id='f4444444-4444-4444-8444-444444444444';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.ss_class_sessions) OR EXISTS(SELECT 1 FROM public.ss_usage_ledger) THEN RAISE EXCEPTION 'unconfirmed profile can read'; END IF;
END $$;
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now(),deleted_at=now() WHERE id='f4444444-4444-4444-8444-444444444444';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.ss_class_sessions) OR EXISTS(SELECT 1 FROM public.ss_usage_ledger) THEN RAISE EXCEPTION 'deleted auth profile can read'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ss_class_sessions','ss_class_transcripts','ss_class_outlines','ss_class_renders','ss_class_chats','ss_ai_admissions','ss_sync_documents','ss_shared_conversations','ss_data_storage_refs','ss_usage_ledger'] LOOP
  IF has_table_privilege('service_role','public.'||t,'DELETE') OR has_table_privilege('service_role','public.'||t,'TRUNCATE') THEN RAISE EXCEPTION 'destructive service ACL on %',t; END IF;
 END LOOP;
 IF has_table_privilege('service_role','public.ss_data_storage_refs','UPDATE') THEN RAISE EXCEPTION 'direct storage refs mutation'; END IF;
END $$;
SELECT 'PASS canonical profile, confirmed user, retained deletion gate, usage privacy, no destructive service ACL' AS result;
ROLLBACK;

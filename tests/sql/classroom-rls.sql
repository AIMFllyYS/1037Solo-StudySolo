-- Local retained fixture only: all synthetic rows/catalog changes roll back.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
VALUES('f1111111-1111-4111-8111-111111111111','class-a@example.invalid',now(),false,false),
 ('f2222222-2222-4222-8222-222222222222','class-b@example.invalid',now(),false,false);
INSERT INTO public.user_profiles(id,email,account_role) VALUES
 ('f1111111-1111-4111-8111-111111111111','class-a@example.invalid','user'),
 ('f2222222-2222-4222-8222-222222222222','class-b@example.invalid','user') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.ss_class_sessions(id,user_id,title,status,payload) VALUES
 ('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','f1111111-1111-4111-8111-111111111111','Class A','ended','{}'),
 ('fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','f2222222-2222-4222-8222-222222222222','Class B','ended','{}');
INSERT INTO public.ss_class_transcripts(id,session_id,user_id,seq,payload) VALUES
 ('fccccccc-cccc-4ccc-8ccc-cccccccccccc','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','f1111111-1111-4111-8111-111111111111',1,'{"text":"original"}');
DO $$ BEGIN
 BEGIN
  INSERT INTO public.ss_class_transcripts(id,session_id,user_id,seq,payload) VALUES
   ('fddddddd-dddd-4ddd-8ddd-dddddddddddd','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','f2222222-2222-4222-8222-222222222222',2,'{}');
  RAISE EXCEPTION 'cross-owner child unexpectedly accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.ss_class_sessions)<>1 THEN RAISE EXCEPTION 'owner RLS failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.ss_class_sessions WHERE id='fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') THEN RAISE EXCEPTION 'cross-owner read'; END IF;
 BEGIN
  INSERT INTO public.ss_class_sessions(id,user_id,title,status) VALUES('feeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','f1111111-1111-4111-8111-111111111111','bypass','ended');
  RAISE EXCEPTION 'client bypassed server/storage gate';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.user_profiles SET account_role='admin' WHERE id='f1111111-1111-4111-8111-111111111111';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.ss_class_sessions)<>0 THEN RAISE EXCEPTION 'admin without aal2 was allowed'; END IF;
END $$;
RESET ROLE;
UPDATE public.user_profiles SET account_role='user' WHERE id='f1111111-1111-4111-8111-111111111111';
INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
 VALUES('f3333333-3333-4333-8333-333333333333','f1111111-1111-4111-8111-111111111111','totp','verified',now(),now(),'SYNTHETIC_NOT_A_REAL_SECRET');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.ss_class_sessions)<>0 THEN RAISE EXCEPTION 'MFA aal1 was allowed'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.ss_class_sessions)<>1 THEN RAISE EXCEPTION 'MFA aal2 was denied'; END IF;
END $$;
RESET ROLE;
UPDATE public.user_profiles SET is_active=false WHERE id='f1111111-1111-4111-8111-111111111111';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.ss_class_sessions)<>0 THEN RAISE EXCEPTION 'inactive aal2 user was allowed'; END IF;
END $$;
RESET ROLE;
UPDATE public.user_profiles SET is_active=true WHERE id='f1111111-1111-4111-8111-111111111111';
UPDATE public.ss_class_transcripts SET payload='{"text":"updated and preserved"}' WHERE id='fccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $$ DECLARE expected bigint; actual bigint; BEGIN
 SELECT sum(size_bytes) INTO expected FROM public.storage_objects WHERE user_id='f1111111-1111-4111-8111-111111111111' AND state='committed';
 SELECT used_bytes INTO actual FROM public.storage_accounts WHERE user_id='f1111111-1111-4111-8111-111111111111';
 IF expected<>actual OR actual<=0 THEN RAISE EXCEPTION 'shared storage reconciliation failed'; END IF;
END $$;
INSERT INTO public.ss_shared_conversations(id,owner_id,source_client_id,title,payload) VALUES('synthetic-share-20260927','f1111111-1111-4111-8111-111111111111','fixture','Fixture','{}');
UPDATE public.membership_plans SET storage_bytes=1 WHERE id='free';
-- Privacy revocation remains possible even when the user is already over quota.
UPDATE public.ss_shared_conversations SET revoked_at=now() WHERE id='synthetic-share-20260927';
DO $$ BEGIN
 BEGIN
  UPDATE public.ss_class_transcripts SET payload='{"text":"must not overwrite on quota failure"}' WHERE id='fccccccc-cccc-4ccc-8ccc-cccccccccccc';
  RAISE EXCEPTION 'quota was not enforced';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%storage_quota_exceeded%' THEN RAISE; END IF;
 END;
 IF (SELECT payload->>'text' FROM public.ss_class_transcripts WHERE id='fccccccc-cccc-4ccc-8ccc-cccccccccccc')<>'updated and preserved' THEN RAISE EXCEPTION 'quota failure lost content'; END IF;
END $$;
SELECT 'PASS classroom: owner isolation, MFA, server-only writes, composite FK, central storage accounting, rollback on quota failure' AS result;
ROLLBACK;

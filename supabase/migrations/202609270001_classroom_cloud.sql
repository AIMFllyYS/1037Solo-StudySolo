-- New StudySolo classroom data. Original Classolo and old migrations remain untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ss_class_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  status text NOT NULL CHECK(status IN ('recording','paused','ended','interrupted')),
  payload jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(payload)='object'),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id)
);
CREATE TABLE IF NOT EXISTS public.ss_class_transcripts (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  seq integer NOT NULL CHECK(seq>=0),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,seq),
  FOREIGN KEY(session_id,user_id) REFERENCES public.ss_class_sessions(id,user_id)
);
CREATE TABLE IF NOT EXISTS public.ss_class_outlines (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(session_id,user_id) REFERENCES public.ss_class_sessions(id,user_id)
);
CREATE TABLE IF NOT EXISTS public.ss_class_renders (
  id text NOT NULL CHECK(length(id) BETWEEN 1 AND 150),
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,id),
  FOREIGN KEY(session_id,user_id) REFERENCES public.ss_class_sessions(id,user_id)
);
CREATE TABLE IF NOT EXISTS public.ss_class_chats (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  seq integer NOT NULL CHECK(seq>=0),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(session_id,user_id) REFERENCES public.ss_class_sessions(id,user_id)
);
CREATE INDEX IF NOT EXISTS ss_class_sessions_owner_idx ON public.ss_class_sessions(user_id,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS ss_class_transcripts_session_idx ON public.ss_class_transcripts(user_id,session_id,seq);
CREATE INDEX IF NOT EXISTS ss_class_chats_session_idx ON public.ss_class_chats(user_id,session_id,created_at);

CREATE OR REPLACE FUNCTION public.ss_class_can_read(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid()=p_user_id
  AND EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=p_user_id AND p.is_active=true)
  AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_user_id AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL)
  AND (
    auth.jwt()->>'aal'='aal2' OR (
      NOT EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id=p_user_id AND f.status='verified')
      AND NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=p_user_id AND p.account_role IN ('admin','super_admin'))
    )
  );
$$;
REVOKE ALL ON FUNCTION public.ss_class_can_read(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ss_class_can_read(uuid) TO authenticated,service_role;
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['ss_class_sessions','ss_class_transcripts','ss_class_outlines','ss_class_renders','ss_class_chats'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',name);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO service_role',name);
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=name AND policyname='class_owner_read') THEN
      EXECUTE format('CREATE POLICY class_owner_read ON public.%I FOR SELECT TO authenticated USING(public.ss_class_can_read(user_id))',name);
    END IF;
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS public.ss_ai_admissions (
 user_id uuid NOT NULL REFERENCES auth.users(id),
 request_key text NOT NULL CHECK(length(request_key) BETWEEN 1 AND 200),
 route text NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','reserved','settled','cancelled','rejected')),
 reserved_microcredits bigint NOT NULL CHECK(reserved_microcredits>0),
 charged_microcredits bigint NOT NULL DEFAULT 0 CHECK(charged_microcredits>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_key)
);
ALTER TABLE public.ss_ai_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ss_ai_admissions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.ss_ai_admissions TO service_role;
CREATE INDEX IF NOT EXISTS ss_ai_admissions_pending_idx ON public.ss_ai_admissions(created_at) WHERE state IN ('pending','reserved');
NOTIFY pgrst,'reload schema';
COMMIT;

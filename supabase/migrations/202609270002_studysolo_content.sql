-- StudySolo-specific content only. Shared identities/memberships/credits stay authoritative.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ss_sync_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 kind text NOT NULL CHECK(kind IN ('chat-session','artifact','settings','skill','document','user-note','review-card','chat-project','scheduled-task')),
 client_id text NOT NULL CHECK(length(client_id) BETWEEN 1 AND 200),
 payload jsonb NOT NULL,
 deleted boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,kind,client_id)
);
CREATE INDEX IF NOT EXISTS ss_sync_documents_owner_kind_idx ON public.ss_sync_documents(user_id,kind,updated_at DESC);
ALTER TABLE public.ss_sync_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ss_sync_documents FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ss_sync_documents TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ss_sync_documents TO service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ss_sync_documents' AND policyname='ss_sync_owner_read') THEN
  CREATE POLICY ss_sync_owner_read ON public.ss_sync_documents FOR SELECT TO authenticated USING(public.ss_class_can_read(user_id));
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.ss_shared_conversations (
 id text PRIMARY KEY CHECK(length(id) BETWEEN 16 AND 200),
 owner_id uuid NOT NULL REFERENCES auth.users(id),
 source_client_id text NOT NULL,
 title text NOT NULL,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS ss_shared_conversations_owner_idx ON public.ss_shared_conversations(owner_id,created_at DESC);
ALTER TABLE public.ss_shared_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ss_shared_conversations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.ss_shared_conversations TO service_role;
CREATE OR REPLACE FUNCTION public.ss_get_shared_conversation(p_id text)
 RETURNS TABLE(title text,payload jsonb,created_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.title,s.payload,s.created_at FROM public.ss_shared_conversations s
 WHERE s.id=p_id AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now());
$$;
REVOKE ALL ON FUNCTION public.ss_get_shared_conversation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_get_shared_conversation(text) TO anon,authenticated,service_role;

-- Metadata for the current physical DB row representation, not another quota pool.
CREATE TABLE IF NOT EXISTS public.ss_data_storage_refs (
 table_name text NOT NULL,
 row_key text NOT NULL,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 storage_request_key text NOT NULL,
 PRIMARY KEY(table_name,row_key)
);
ALTER TABLE public.ss_data_storage_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ss_data_storage_refs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ss_data_storage_refs TO service_role;
CREATE OR REPLACE FUNCTION public.ss_account_row_storage() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE content jsonb; complete_row jsonb; owner uuid; old_owner uuid; v_row_key text; old_key text; new_key text; bytes bigint;
BEGIN
 complete_row:=to_jsonb(NEW);
 content:=complete_row-ARRAY['created_at','updated_at','archived_at','revoked_at','expires_at','deleted','status'];
 owner:=coalesce(content->>'user_id',content->>'owner_id')::uuid;
 v_row_key:=CASE WHEN content ? 'session_id' THEN (content->>'session_id')||':'||coalesce(content->>'id','outline') ELSE content->>'id' END;
 IF TG_OP='UPDATE' THEN
  old_owner:=coalesce(to_jsonb(OLD)->>'user_id',to_jsonb(OLD)->>'owner_id')::uuid;
  IF old_owner<>owner THEN RAISE EXCEPTION 'content_ownership_immutable'; END IF;
  IF content=(to_jsonb(OLD)-ARRAY['created_at','updated_at','archived_at','revoked_at','expires_at','deleted','status']) THEN RETURN NEW; END IF;
 END IF;
 SELECT storage_request_key INTO old_key FROM public.ss_data_storage_refs
  WHERE table_name=TG_TABLE_NAME AND ss_data_storage_refs.row_key=v_row_key FOR UPDATE;
 -- The old row representation is replaced in THIS transaction; archived rows
 -- still retain their content and are immediately accounted at their full size.
 IF old_key IS NOT NULL THEN
  PERFORM public.storage_apply(owner,'studysolo',old_key,'release',0);
 END IF;
 bytes:=octet_length(content::text);
 new_key:='db:'||gen_random_uuid()::text;
 PERFORM public.storage_apply(owner,'studysolo',new_key,'reserve',bytes,'server','studysolo-db',owner::text||'/'||TG_TABLE_NAME||'/'||new_key);
 PERFORM public.storage_apply(owner,'studysolo',new_key,'commit',bytes);
 INSERT INTO public.ss_data_storage_refs(table_name,row_key,user_id,storage_request_key)
 VALUES(TG_TABLE_NAME,v_row_key,owner,new_key)
 ON CONFLICT(table_name,row_key) DO UPDATE SET storage_request_key=excluded.storage_request_key;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ss_account_row_storage() FROM PUBLIC;
DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['ss_sync_documents','ss_shared_conversations','ss_class_sessions','ss_class_transcripts','ss_class_outlines','ss_class_renders','ss_class_chats'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',name)::regclass AND tgname='ss_account_storage') THEN
   EXECUTE format('CREATE TRIGGER ss_account_storage AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ss_account_row_storage()',name);
  END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

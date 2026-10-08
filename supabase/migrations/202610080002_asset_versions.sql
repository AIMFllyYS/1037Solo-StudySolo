-- Additive, private body storage and Account-server-only compare-and-swap.
BEGIN;
-- Extend the single central ledger with quota-checked restoration.
CREATE OR REPLACE FUNCTION public.storage_apply(p_user_id uuid,p_project_id text,p_request_key text,p_action text,p_bytes bigint,
  p_provider text DEFAULT NULL,p_bucket text DEFAULT NULL,p_object_key text DEFAULT NULL)
RETURNS public.storage_objects LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.storage_accounts; o public.storage_objects; capacity bigint; du bigint:=0; dr bigint:=0;
BEGIN
  IF p_bytes IS NULL OR p_bytes<0 OR p_bytes>9007199254740991 OR p_action IS NULL OR p_action NOT IN ('reserve','commit','cancel','release','restore') THEN RAISE EXCEPTION 'invalid_storage_request'; END IF;
  IF p_action IN ('cancel','release','restore') AND p_bytes<>0 THEN RAISE EXCEPTION 'bytes_must_be_zero'; END IF;
  INSERT INTO public.storage_accounts(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT a FROM public.storage_accounts WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO o FROM public.storage_objects WHERE user_id=p_user_id AND project_id=p_project_id AND request_key=p_request_key;
  IF FOUND THEN
    IF p_action='reserve' THEN
      IF o.reserved_bytes=p_bytes AND o.provider=p_provider AND o.bucket=p_bucket AND o.object_key=p_object_key THEN RETURN o; END IF;
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    IF (p_action='commit' AND o.state IN ('committed','released') AND o.size_bytes=p_bytes)
      OR (p_action='cancel' AND o.state='cancelled') OR (p_action='release' AND o.state='released') THEN RETURN o; END IF;
    IF p_action='restore' AND o.state IN ('released','cancelled') THEN
      SELECT storage_bytes INTO STRICT capacity FROM public.membership_plans WHERE id=coalesce((SELECT plan_id FROM public.membership_accounts WHERE user_id=p_user_id AND (plan_id='free' OR expires_at>now())), 'free');
      IF a.used_bytes::numeric+a.reserved_bytes::numeric+greatest(o.size_bytes,o.reserved_bytes)::numeric>capacity THEN RAISE EXCEPTION 'storage_quota_exceeded'; END IF;
      du:=greatest(o.size_bytes,o.reserved_bytes);
      UPDATE public.storage_objects SET state='committed',size_bytes=du,updated_at=now() WHERE id=o.id RETURNING * INTO o;
    ELSIF p_action='restore' AND o.state='committed' THEN RETURN o;
    ELSIF p_action='commit' AND o.state='reserved' THEN
      IF p_bytes>o.reserved_bytes THEN RAISE EXCEPTION 'upload_exceeds_reservation'; END IF;
      du:=p_bytes; dr:=-o.reserved_bytes;
      UPDATE public.storage_objects SET state='committed',size_bytes=p_bytes,updated_at=now() WHERE id=o.id RETURNING * INTO o;
    ELSIF p_action='cancel' AND o.state='reserved' THEN
      dr:=-o.reserved_bytes;
      UPDATE public.storage_objects SET state='cancelled',updated_at=now() WHERE id=o.id RETURNING * INTO o;
    ELSIF p_action='release' AND o.state='committed' THEN
      du:=-o.size_bytes;
      UPDATE public.storage_objects SET state='released',updated_at=now() WHERE id=o.id RETURNING * INTO o;
    ELSE RAISE EXCEPTION 'invalid_storage_transition'; END IF;
  ELSE
    IF p_action<>'reserve' THEN RAISE EXCEPTION 'storage_operation_not_found'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.ecosystem_projects WHERE id=p_project_id AND enabled) THEN RAISE EXCEPTION 'project_disabled'; END IF;
    SELECT storage_bytes INTO STRICT capacity FROM public.membership_plans WHERE id=coalesce(
      (SELECT plan_id FROM public.membership_accounts WHERE user_id=p_user_id AND (plan_id='free' OR expires_at>now())), 'free');
    IF a.used_bytes::numeric+a.reserved_bytes::numeric+p_bytes::numeric>capacity THEN RAISE EXCEPTION 'storage_quota_exceeded'; END IF;
    dr:=p_bytes;
    INSERT INTO public.storage_objects(user_id,project_id,request_key,provider,bucket,object_key,state,reserved_bytes)
      VALUES(p_user_id,p_project_id,p_request_key,p_provider,p_bucket,p_object_key,'reserved',p_bytes) RETURNING * INTO o;
  END IF;
  UPDATE public.storage_accounts SET used_bytes=used_bytes+du,reserved_bytes=reserved_bytes+dr,updated_at=now() WHERE user_id=p_user_id;
  RETURN o;
END $$;

ALTER TABLE public.ss_sync_documents ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.ss_sync_documents DROP CONSTRAINT IF EXISTS ss_sync_documents_kind_check;
ALTER TABLE public.ss_sync_documents ADD CONSTRAINT ss_sync_documents_kind_check CHECK(kind IN ('chat-session','artifact','settings','skill','document','user-note','review-card','chat-project','scheduled-task','image-gen'));
CREATE FUNCTION public.ss_sync_version_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF OLD.revision>0 AND NEW.revision<=OLD.revision AND (NEW.payload IS DISTINCT FROM OLD.payload OR NEW.deleted IS DISTINCT FROM OLD.deleted) THEN RAISE EXCEPTION 'sync_client_upgrade_required'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ss_sync_version_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ss_sync_version_guard BEFORE UPDATE ON public.ss_sync_documents FOR EACH ROW EXECUTE FUNCTION public.ss_sync_version_guard();
CREATE FUNCTION public.ss_sync_compatible_read(p_owner uuid,p_external boolean) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE headers jsonb;
BEGIN
 IF NOT public.ss_class_can_read(p_owner) THEN RETURN false; END IF;
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 IF p_external AND coalesce(headers->>'x-study-client-version','')<>'2' THEN RAISE EXCEPTION '请升级客户端后读取云端正文，已有本机内容保留。'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.ss_sync_compatible_read(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_sync_compatible_read(uuid,boolean) TO anon,authenticated,service_role;
DROP POLICY IF EXISTS ss_sync_owner_read ON public.ss_sync_documents;
CREATE POLICY ss_sync_owner_read ON public.ss_sync_documents FOR SELECT TO authenticated USING(public.ss_sync_compatible_read(user_id,payload ? 'bodyStorage'));
CREATE OR REPLACE FUNCTION public.ss_sync_document_asset(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.ss_sync_documents; asset_kind text; current_owner uuid;
BEGIN
 SELECT * INTO d FROM public.ss_sync_documents WHERE id=p_id;
 IF NOT FOUND THEN RETURN; END IF;
 asset_kind:=CASE d.kind WHEN 'user-note' THEN 'note' WHEN 'review-card' THEN 'flashcard' WHEN 'document' THEN 'document' WHEN 'artifact' THEN 'artifact' WHEN 'image-gen' THEN 'image' END;
 IF asset_kind IS NULL THEN
  UPDATE public.asset_index SET archived_at=coalesce(archived_at,now()) WHERE project_id='studysolo' AND source_type='sync-document' AND source_id=d.id::text;
  RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=d.user_id) THEN RAISE EXCEPTION 'canonical_owner_required'; END IF;
 SELECT user_id INTO current_owner FROM public.asset_index WHERE project_id='studysolo' AND source_type='sync-document' AND source_id=d.id::text FOR UPDATE;
 IF current_owner IS NOT NULL AND current_owner<>d.user_id THEN RAISE EXCEPTION 'asset_owner_conflict'; END IF;
 INSERT INTO public.asset_index(user_id,project_id,source_type,source_id,title,media_type,source_path,metadata,archived_at,updated_at)
 VALUES(d.user_id,'studysolo','sync-document',d.id::text,left(coalesce(nullif(d.payload->>'title',''),nullif(d.payload->>'name',''),nullif(d.payload->'spec'->>'title',''),'学习产物'),300),
 CASE d.kind WHEN 'artifact' THEN 'text/html' WHEN 'review-card' THEN 'application/x-flashcard' WHEN 'image-gen' THEN 'application/x-generated-image' ELSE 'text/markdown' END,
 '/agent/assets/open?kind='||asset_kind||'&id='||regexp_replace(encode(convert_to(d.client_id,'UTF8'),'hex'),'(..)','%\1','g'),
 jsonb_build_object('kind',d.kind,'revision',d.revision,'clientId',d.client_id),CASE WHEN d.deleted THEN d.updated_at END,d.updated_at)
 ON CONFLICT(project_id,source_type,source_id) DO UPDATE SET title=excluded.title,media_type=excluded.media_type,source_path=excluded.source_path,
 metadata=excluded.metadata,archived_at=excluded.archived_at,updated_at=excluded.updated_at WHERE asset_index.user_id=excluded.user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'asset_owner_conflict'; END IF;
END $$;

CREATE TABLE public.ss_sync_body_chunks (
 user_id uuid NOT NULL REFERENCES auth.users(id), sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 8388608), object_key text NOT NULL,
 storage_request_key text NOT NULL, state text NOT NULL CHECK(state IN ('pending','ready','released')),
 PRIMARY KEY(user_id,sha256)
);
CREATE TABLE public.ss_sync_writes (
 user_id uuid NOT NULL REFERENCES auth.users(id), mutation_id uuid NOT NULL,
 kind text NOT NULL, client_id text NOT NULL CHECK(length(client_id) BETWEEN 1 AND 200), expected_revision bigint NOT NULL CHECK(expected_revision>=0),
 payload jsonb NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','committed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,mutation_id)
);
CREATE TABLE public.ss_sync_revisions (
 user_id uuid NOT NULL REFERENCES auth.users(id), kind text NOT NULL, client_id text NOT NULL,
 revision bigint NOT NULL, mutation_id uuid NOT NULL, payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,kind,client_id,revision), UNIQUE(user_id,mutation_id)
);
CREATE INDEX ss_sync_revisions_owner ON public.ss_sync_revisions(user_id,kind,client_id);
ALTER TABLE public.ss_sync_body_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_sync_writes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_sync_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ss_sync_body_chunks,public.ss_sync_writes,public.ss_sync_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.ss_sync_body_chunks,public.ss_sync_writes,public.ss_sync_revisions TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('ss-asset-bodies','ss-asset-bodies',false,8388608) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='ss-asset-bodies' AND public) THEN RAISE EXCEPTION 'asset_bucket_must_be_private'; END IF; END $$;

CREATE FUNCTION public.ss_sync_prepare(p_owner uuid,p_mutation uuid,p_kind text,p_client_id text,p_expected bigint,p_payload jsonb,p_chunks jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE existing public.ss_sync_writes; chunk jsonb; b public.ss_sync_body_chunks; result jsonb:='[]'; key text; size bigint; sha text; revision bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 IF p_kind NOT IN ('chat-session','artifact','document','user-note','review-card','chat-project','image-gen') OR p_expected<0 OR octet_length(p_payload::text)>262144 THEN RAISE EXCEPTION 'invalid_sync_payload'; END IF;
 SELECT * INTO existing FROM public.ss_sync_writes WHERE user_id=p_owner AND mutation_id=p_mutation;
 IF FOUND AND (existing.kind<>p_kind OR existing.client_id<>p_client_id OR existing.expected_revision<>p_expected OR existing.payload<>p_payload OR existing.state='cancelled') THEN RAISE EXCEPTION 'mutation_conflict'; END IF;
 SELECT d.revision INTO revision FROM public.ss_sync_documents d WHERE user_id=p_owner AND kind=p_kind AND client_id=p_client_id;
 IF existing.state IS DISTINCT FROM 'committed' AND coalesce(revision,0)<>p_expected THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 INSERT INTO public.ss_sync_writes(user_id,mutation_id,kind,client_id,expected_revision,payload) VALUES(p_owner,p_mutation,p_kind,p_client_id,p_expected,p_payload) ON CONFLICT DO NOTHING;
 FOR chunk IN SELECT * FROM jsonb_array_elements(p_chunks) LOOP
  sha:=chunk->>'sha256'; size:=(chunk->>'size')::bigint;
  IF sha !~ '^[a-f0-9]{64}$' OR size NOT BETWEEN 1 AND 8388608 THEN RAISE EXCEPTION 'invalid_body_chunk'; END IF;
  SELECT * INTO b FROM public.ss_sync_body_chunks WHERE user_id=p_owner AND sha256=sha FOR UPDATE;
  IF FOUND AND b.size_bytes<>size THEN RAISE EXCEPTION 'body_hash_size_conflict'; END IF;
  IF FOUND AND b.state='released' THEN
   PERFORM public.storage_apply(p_owner,'studysolo',b.storage_request_key,'restore',0);
   UPDATE public.ss_sync_body_chunks SET state='ready' WHERE user_id=p_owner AND sha256=sha; b.state:='ready';
  ELSIF NOT FOUND THEN
   key:='body:'||gen_random_uuid()::text;
   PERFORM public.storage_apply(p_owner,'studysolo',key,'reserve',size,'supabase','ss-asset-bodies',p_owner::text||'/'||sha);
   INSERT INTO public.ss_sync_body_chunks(user_id,sha256,size_bytes,object_key,storage_request_key,state)
   VALUES(p_owner,sha,size,p_owner::text||'/'||sha,key,'pending')
   ON CONFLICT(user_id,sha256) DO UPDATE SET storage_request_key=excluded.storage_request_key,state='pending';
   SELECT * INTO b FROM public.ss_sync_body_chunks WHERE user_id=p_owner AND sha256=sha;
  END IF;
  result:=result||jsonb_build_array(jsonb_build_object('sha256',sha,'state',b.state,'objectKey',b.object_key));
 END LOOP;
 RETURN jsonb_build_object('chunks',result,'state',coalesce(existing.state,'pending'));
END $$;

CREATE FUNCTION public.ss_sync_commit(p_owner uuid,p_mutation uuid)
RETURNS public.ss_sync_documents LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE w public.ss_sync_writes; d public.ss_sync_documents; b public.ss_sync_body_chunks; sha text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 SELECT * INTO w FROM public.ss_sync_writes WHERE user_id=p_owner AND mutation_id=p_mutation FOR UPDATE;
 IF NOT FOUND OR w.state='cancelled' THEN RAISE EXCEPTION 'write_not_prepared'; END IF;
 SELECT * INTO d FROM public.ss_sync_documents WHERE user_id=p_owner AND kind=w.kind AND client_id=w.client_id FOR UPDATE;
 IF w.state='committed' THEN RETURN d; END IF;
 IF coalesce(d.revision,0)<>w.expected_revision THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 FOR sha IN SELECT DISTINCT value #>> '{}' FROM jsonb_path_query(w.payload,'$.bodyStorage.fields[*].chunks[*]') AS chunks(value) LOOP
  SELECT * INTO b FROM public.ss_sync_body_chunks WHERE user_id=p_owner AND sha256=sha FOR UPDATE;
  IF NOT FOUND OR b.state='released' THEN RAISE EXCEPTION 'body_not_prepared'; END IF;
  IF b.state='pending' THEN PERFORM public.storage_apply(p_owner,'studysolo',b.storage_request_key,'commit',b.size_bytes); UPDATE public.ss_sync_body_chunks SET state='ready' WHERE user_id=p_owner AND sha256=sha; END IF;
 END LOOP;
 INSERT INTO public.ss_sync_revisions(user_id,kind,client_id,revision,mutation_id,payload) VALUES(p_owner,w.kind,w.client_id,w.expected_revision+1,p_mutation,w.payload);
 INSERT INTO public.ss_sync_documents(user_id,kind,client_id,payload,deleted,revision,updated_at) VALUES(p_owner,w.kind,w.client_id,w.payload,false,w.expected_revision+1,now())
 ON CONFLICT(user_id,kind,client_id) DO UPDATE SET payload=excluded.payload,deleted=false,revision=excluded.revision,updated_at=excluded.updated_at RETURNING * INTO d;
 UPDATE public.ss_sync_writes SET state='committed' WHERE user_id=p_owner AND mutation_id=p_mutation;
 RETURN d;
END $$;

CREATE FUNCTION public.ss_sync_archive(p_owner uuid,p_kind text,p_client_id text,p_expected bigint,p_restore boolean DEFAULT false)
RETURNS public.ss_sync_documents LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.ss_sync_documents; b public.ss_sync_body_chunks; active boolean; key text; ref text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 SELECT * INTO d FROM public.ss_sync_documents WHERE user_id=p_owner AND kind=p_kind AND client_id=p_client_id FOR UPDATE;
 IF NOT FOUND THEN
  IF p_restore THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  INSERT INTO public.ss_sync_documents(user_id,kind,client_id,payload,deleted,revision) VALUES(p_owner,p_kind,p_client_id,'{}',true,1) RETURNING * INTO d;
  RETURN d;
 END IF;
 IF d.deleted=NOT p_restore THEN RETURN d; END IF;
 IF d.revision<>p_expected THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 UPDATE public.ss_sync_documents SET deleted=NOT p_restore,revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
 -- Tombstones retain bytes, but cease to consume the user's active quota.
 SELECT storage_request_key INTO ref FROM public.ss_data_storage_refs WHERE table_name='ss_sync_documents' AND row_key=d.id::text;
 IF NOT p_restore AND ref IS NOT NULL THEN
  PERFORM public.storage_apply(p_owner,'studysolo',ref,'release',0);
 END IF;
 FOR b IN SELECT * FROM public.ss_sync_body_chunks WHERE user_id=p_owner FOR UPDATE LOOP
  SELECT EXISTS(SELECT 1 FROM public.ss_sync_revisions r JOIN public.ss_sync_documents h ON h.user_id=r.user_id AND h.kind=r.kind AND h.client_id=r.client_id
   WHERE r.user_id=p_owner AND NOT h.deleted AND jsonb_path_exists(r.payload,'$.bodyStorage.fields[*].chunks[*] ? (@ == $hash)',jsonb_build_object('hash',b.sha256))) INTO active;
  IF active AND b.state='released' THEN
   PERFORM public.storage_apply(p_owner,'studysolo',b.storage_request_key,'restore',0);
   UPDATE public.ss_sync_body_chunks SET state='ready' WHERE user_id=p_owner AND sha256=b.sha256;
  ELSIF NOT active AND b.state='ready' THEN
   PERFORM public.storage_apply(p_owner,'studysolo',b.storage_request_key,'release',0);
   UPDATE public.ss_sync_body_chunks SET state='released' WHERE user_id=p_owner AND sha256=b.sha256;
  END IF;
 END LOOP;
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION public.ss_sync_prepare(uuid,uuid,text,text,bigint,jsonb,jsonb),public.ss_sync_commit(uuid,uuid),public.ss_sync_archive(uuid,text,text,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_sync_prepare(uuid,uuid,text,text,bigint,jsonb,jsonb),public.ss_sync_commit(uuid,uuid),public.ss_sync_archive(uuid,text,text,bigint,boolean) TO service_role;
CREATE FUNCTION public.ss_sync_cancel(p_owner uuid,p_mutation uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE w public.ss_sync_writes;b public.ss_sync_body_chunks;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 SELECT * INTO STRICT w FROM public.ss_sync_writes WHERE user_id=p_owner AND mutation_id=p_mutation FOR UPDATE;
 IF w.state='committed' THEN RAISE EXCEPTION 'write_already_committed'; END IF;
 UPDATE public.ss_sync_writes SET state='cancelled' WHERE user_id=p_owner AND mutation_id=p_mutation;
 FOR b IN SELECT * FROM public.ss_sync_body_chunks WHERE user_id=p_owner AND state IN ('pending','ready') FOR UPDATE LOOP
  IF NOT EXISTS(SELECT 1 FROM public.ss_sync_writes pending WHERE user_id=p_owner AND state='pending' AND jsonb_path_exists(pending.payload,'$.bodyStorage.fields[*].chunks[*] ? (@ == $hash)',jsonb_build_object('hash',b.sha256))) THEN
   IF NOT EXISTS(SELECT 1 FROM public.ss_sync_revisions r JOIN public.ss_sync_documents h ON h.user_id=r.user_id AND h.kind=r.kind AND h.client_id=r.client_id WHERE r.user_id=p_owner AND NOT h.deleted AND jsonb_path_exists(r.payload,'$.bodyStorage.fields[*].chunks[*] ? (@ == $hash)',jsonb_build_object('hash',b.sha256))) THEN
    PERFORM public.storage_apply(p_owner,'studysolo',b.storage_request_key,CASE WHEN b.state='pending' THEN 'cancel' ELSE 'release' END,0);
    UPDATE public.ss_sync_body_chunks SET state='released' WHERE user_id=p_owner AND sha256=b.sha256;
   END IF;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.ss_sync_cancel(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_sync_cancel(uuid,uuid) TO service_role;
CREATE FUNCTION public.ss_file_restore(p_user_id uuid,p_file_id uuid)
RETURNS public.ss_user_files LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE row public.ss_user_files;object public.storage_objects;
BEGIN
 SELECT * INTO STRICT row FROM public.ss_user_files WHERE user_id=p_user_id AND id=p_file_id FOR UPDATE;
 IF row.state='ready' THEN RETURN row; END IF;
 IF row.state<>'deleted' THEN RAISE EXCEPTION 'file_not_deleted'; END IF;
 SELECT * INTO STRICT object FROM public.storage_objects WHERE user_id=p_user_id AND project_id='studysolo' AND request_key='file:'||p_file_id::text;
 IF object.state<>'released' THEN RAISE EXCEPTION 'incomplete_file_reupload_required'; END IF;
 PERFORM public.storage_apply(p_user_id,'studysolo',object.request_key,'restore',0);
 UPDATE public.ss_user_files SET state='ready',deleted_at=NULL,updated_at=now() WHERE id=p_file_id RETURNING * INTO row;
 UPDATE public.asset_index SET archived_at=NULL,storage_object_id=object.id,updated_at=now() WHERE user_id=p_user_id AND project_id='studysolo' AND source_type='cloud-file' AND source_id=p_file_id::text;
 RETURN row;
END $$;
REVOKE ALL ON FUNCTION public.ss_file_restore(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_file_restore(uuid,uuid) TO service_role;
CREATE TABLE public.ss_local_tool_turns (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),session_id text NOT NULL,
 snapshot jsonb NOT NULL CHECK(octet_length(snapshot::text)<=262144),state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','claimed')),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ss_local_tool_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ss_local_tool_turns FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.ss_local_tool_turns TO service_role;

CREATE OR REPLACE FUNCTION public.ss_account_row_storage() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE content jsonb; complete_row jsonb; owner uuid; old_owner uuid; v_row_key text; old_key text; new_key text; bytes bigint;
BEGIN
 complete_row:=to_jsonb(NEW);
 content:=complete_row-ARRAY['created_at','updated_at','archived_at','revoked_at','expires_at','deleted','status'];
 owner:=coalesce(content->>'user_id',content->>'owner_id')::uuid;
 v_row_key:=CASE WHEN content ? 'session_id' THEN (content->>'session_id')||':'||coalesce(content->>'id',content->>'segment_id','outline') ELSE content->>'id' END;
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

CREATE TRIGGER ss_account_storage AFTER INSERT OR UPDATE ON public.ss_class_corrections FOR EACH ROW EXECUTE FUNCTION public.ss_account_row_storage();

-- Classroom entities remain in their existing tables and join the same directory.
CREATE FUNCTION public.ss_class_asset_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref record;
BEGIN
 INSERT INTO public.asset_index(user_id,project_id,source_type,source_id,title,media_type,source_path,metadata,archived_at,updated_at)
 VALUES(NEW.user_id,'studysolo','class-session',NEW.id::text,NEW.title,'application/x-classroom-session','/class?session='||NEW.id::text,
 jsonb_build_object('kind','classroom','revision',to_jsonb(NEW)->'cloud_revision'),NEW.archived_at,NEW.updated_at)
 ON CONFLICT(project_id,source_type,source_id) DO UPDATE SET title=excluded.title,metadata=excluded.metadata,archived_at=excluded.archived_at,updated_at=excluded.updated_at
 WHERE asset_index.user_id=excluded.user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'asset_owner_conflict'; END IF;
 IF TG_OP='UPDATE' AND (NEW.archived_at IS NULL) IS DISTINCT FROM (OLD.archived_at IS NULL) THEN
  FOR ref IN SELECT storage_request_key FROM public.ss_data_storage_refs WHERE user_id=NEW.user_id
   AND table_name IN ('ss_class_sessions','ss_class_transcripts','ss_class_outlines','ss_class_renders','ss_class_chats','ss_class_corrections')
   AND (row_key=NEW.id::text OR left(row_key,length(NEW.id::text)+1)=NEW.id::text||':') FOR UPDATE LOOP
   PERFORM public.storage_apply(NEW.user_id,'studysolo',ref.storage_request_key,CASE WHEN NEW.archived_at IS NULL THEN 'restore' ELSE 'release' END,0);
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ss_class_asset_lifecycle() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ss_class_asset_lifecycle AFTER INSERT OR UPDATE ON public.ss_class_sessions FOR EACH ROW EXECUTE FUNCTION public.ss_class_asset_lifecycle();
CREATE FUNCTION public.ss_class_archive(p_owner uuid,p_session uuid,p_expected bigint,p_restore boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.ss_class_sessions;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 SELECT * INTO STRICT d FROM public.ss_class_sessions WHERE user_id=p_owner AND id=p_session FOR UPDATE;
 IF (d.archived_at IS NULL)=p_restore THEN RETURN; END IF;
 IF d.cloud_revision<>p_expected THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 UPDATE public.ss_class_sessions SET archived_at=CASE WHEN p_restore THEN NULL ELSE now() END,updated_at=now() WHERE id=p_session AND user_id=p_owner;
END $$;
REVOKE ALL ON FUNCTION public.ss_class_archive(uuid,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_class_archive(uuid,uuid,bigint,boolean) TO service_role;
CREATE FUNCTION public.ss_class_reject_archived_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parent public.ss_class_sessions;
BEGIN
 IF TG_TABLE_NAME='ss_class_sessions' THEN
  IF TG_OP='UPDATE' AND OLD.archived_at IS NOT NULL AND NEW.archived_at IS NOT NULL THEN RAISE EXCEPTION 'classroom_in_trash'; END IF;
 ELSE
  SELECT * INTO STRICT parent FROM public.ss_class_sessions WHERE id=NEW.session_id AND user_id=NEW.user_id FOR KEY SHARE;
  IF parent.archived_at IS NOT NULL THEN RAISE EXCEPTION 'classroom_in_trash'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ss_class_reject_archived_write() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['ss_class_sessions','ss_class_transcripts','ss_class_outlines','ss_class_renders','ss_class_chats','ss_class_corrections'] LOOP
  IF to_regclass('public.'||tab) IS NOT NULL THEN
   EXECUTE format('CREATE TRIGGER ss_class_archived_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ss_class_reject_archived_write()',tab);
  END IF;
 END LOOP;
END $$;
-- Directory backfill only: no old body or entitlement is changed.
INSERT INTO public.asset_index(user_id,project_id,source_type,source_id,title,media_type,source_path,metadata,archived_at,updated_at)
 SELECT user_id,'studysolo','class-session',id::text,title,'application/x-classroom-session','/class?session='||id::text,jsonb_build_object('kind','classroom','revision',cloud_revision),archived_at,updated_at FROM public.ss_class_sessions
 ON CONFLICT(project_id,source_type,source_id) DO NOTHING;

-- Reconcile only proved tombstone-to-ledger relationships. No entitlement change,
-- guessed balance or physical content cleanup is permitted here.
DO $$ DECLARE ref record; BEGIN
 FOR ref IN
  SELECT DISTINCT r.user_id,r.storage_request_key FROM public.ss_data_storage_refs r
  JOIN public.storage_objects o ON o.user_id=r.user_id AND o.project_id='studysolo' AND o.request_key=r.storage_request_key AND o.state='committed'
  WHERE (r.table_name='ss_sync_documents' AND EXISTS(SELECT 1 FROM public.ss_sync_documents d WHERE d.user_id=r.user_id AND d.id::text=r.row_key AND d.deleted))
   OR (r.table_name IN ('ss_class_sessions','ss_class_transcripts','ss_class_outlines','ss_class_renders','ss_class_chats','ss_class_corrections')
    AND EXISTS(SELECT 1 FROM public.ss_class_sessions c WHERE c.user_id=r.user_id AND c.archived_at IS NOT NULL AND (r.row_key=c.id::text OR left(r.row_key,37)=c.id::text||':')))
 LOOP PERFORM public.storage_apply(ref.user_id,'studysolo',ref.storage_request_key,'release',0); END LOOP;
END $$;
COMMIT;

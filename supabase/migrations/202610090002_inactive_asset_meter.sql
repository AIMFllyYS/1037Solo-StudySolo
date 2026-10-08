-- Inactive metadata never requires temporary quota. Restore remains quota checked.
BEGIN;
ALTER TABLE public.ss_sync_revisions ADD COLUMN metadata_request_key text;
CREATE OR REPLACE FUNCTION public.ss_account_row_storage() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE content jsonb; complete_row jsonb; owner uuid; old_owner uuid; v_row_key text; old_key text; new_key text; bytes bigint; inactive boolean; was_inactive boolean:=false;
BEGIN
 complete_row:=to_jsonb(NEW);
 content:=complete_row-ARRAY['created_at','updated_at','archived_at','revoked_at','expires_at','deleted','status'];
 owner:=coalesce(content->>'user_id',content->>'owner_id')::uuid;
 v_row_key:=CASE WHEN content ? 'session_id' THEN (content->>'session_id')||':'||coalesce(content->>'id',content->>'segment_id','outline') ELSE content->>'id' END;
 inactive:=(TG_TABLE_NAME='ss_sync_documents' AND coalesce((complete_row->>'deleted')::boolean,false)) OR (TG_TABLE_NAME='ss_class_sessions' AND complete_row->>'archived_at' IS NOT NULL);
 IF TG_OP='UPDATE' THEN
  was_inactive:=(TG_TABLE_NAME='ss_sync_documents' AND coalesce((to_jsonb(OLD)->>'deleted')::boolean,false)) OR (TG_TABLE_NAME='ss_class_sessions' AND to_jsonb(OLD)->>'archived_at' IS NOT NULL);
  old_owner:=coalesce(to_jsonb(OLD)->>'user_id',to_jsonb(OLD)->>'owner_id')::uuid;
  IF old_owner<>owner THEN RAISE EXCEPTION 'content_ownership_immutable'; END IF;

 END IF;
 SELECT storage_request_key INTO old_key FROM public.ss_data_storage_refs
  WHERE table_name=TG_TABLE_NAME AND ss_data_storage_refs.row_key=v_row_key FOR UPDATE;
 IF inactive THEN
  IF old_key IS NOT NULL THEN PERFORM public.storage_apply(owner,'studysolo',old_key,'release',0); END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND NOT was_inactive AND content=(to_jsonb(OLD)-ARRAY['created_at','updated_at','archived_at','revoked_at','expires_at','deleted','status']) THEN RETURN NEW; END IF;
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
CREATE OR REPLACE FUNCTION public.ss_sync_document_asset(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.ss_sync_documents; asset_kind text; current_owner uuid;
BEGIN
 SELECT * INTO d FROM public.ss_sync_documents WHERE id=p_id;
 IF NOT FOUND THEN RETURN; END IF;
 IF d.deleted AND d.payload='{}'::jsonb THEN
  UPDATE public.asset_index SET metadata=metadata||jsonb_build_object('originalMissing',true),archived_at=coalesce(archived_at,now()) WHERE project_id='studysolo' AND source_type='sync-document' AND source_id=d.id::text AND NOT EXISTS(SELECT 1 FROM public.ss_sync_revisions r WHERE r.user_id=d.user_id AND r.kind=d.kind AND r.client_id=d.client_id AND r.payload<>'{}'::jsonb);
  RETURN;
 END IF;
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
CREATE OR REPLACE FUNCTION public.ss_sync_commit(p_owner uuid,p_mutation uuid)
RETURNS public.ss_sync_documents LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE w public.ss_sync_writes; d public.ss_sync_documents; b public.ss_sync_body_chunks; r public.ss_sync_revisions; sha text; metadata_key text; metadata_bytes bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 SELECT * INTO w FROM public.ss_sync_writes WHERE user_id=p_owner AND mutation_id=p_mutation FOR UPDATE;
 IF NOT FOUND OR w.state='cancelled' THEN RAISE EXCEPTION 'write_not_prepared'; END IF;
 SELECT * INTO d FROM public.ss_sync_documents WHERE user_id=p_owner AND kind=w.kind AND client_id=w.client_id FOR UPDATE;
 IF w.state='committed' THEN
  SELECT * INTO STRICT r FROM public.ss_sync_revisions WHERE user_id=p_owner AND mutation_id=p_mutation;
  d.payload:=r.payload; d.revision:=r.revision; d.updated_at:=r.created_at; d.deleted:=false;
  RETURN d;
 END IF;
 IF coalesce(d.revision,0)<>w.expected_revision THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 FOR sha IN SELECT DISTINCT value #>> '{}' FROM jsonb_path_query(w.payload,'$.bodyStorage.fields[*].chunks[*]') AS chunks(value) LOOP
  SELECT * INTO b FROM public.ss_sync_body_chunks WHERE user_id=p_owner AND sha256=sha FOR UPDATE;
  IF NOT FOUND OR b.state='released' THEN RAISE EXCEPTION 'body_not_prepared'; END IF;
  IF b.state='pending' THEN PERFORM public.storage_apply(p_owner,'studysolo',b.storage_request_key,'commit',b.size_bytes); UPDATE public.ss_sync_body_chunks SET state='ready' WHERE user_id=p_owner AND sha256=sha; END IF;
 END LOOP;
 metadata_key:='revision:'||p_mutation::text;
 metadata_bytes:=octet_length(jsonb_build_object('user_id',p_owner,'kind',w.kind,'client_id',w.client_id,'revision',w.expected_revision+1,'mutation_id',p_mutation,'payload',w.payload)::text);
 PERFORM public.storage_apply(p_owner,'studysolo',metadata_key,'reserve',metadata_bytes,'server','studysolo-db',p_owner::text||'/ss_sync_revisions/'||p_mutation::text);
 PERFORM public.storage_apply(p_owner,'studysolo',metadata_key,'commit',metadata_bytes);
 INSERT INTO public.ss_sync_revisions(user_id,kind,client_id,revision,mutation_id,payload,metadata_request_key) VALUES(p_owner,w.kind,w.client_id,w.expected_revision+1,p_mutation,w.payload,metadata_key);
 INSERT INTO public.ss_sync_documents(user_id,kind,client_id,payload,deleted,revision,updated_at) VALUES(p_owner,w.kind,w.client_id,w.payload,false,w.expected_revision+1,now())
 ON CONFLICT(user_id,kind,client_id) DO UPDATE SET payload=excluded.payload,deleted=false,revision=excluded.revision,updated_at=excluded.updated_at RETURNING * INTO d;
 UPDATE public.ss_sync_writes SET state='committed' WHERE user_id=p_owner AND mutation_id=p_mutation;
 RETURN d;
END $$;
CREATE OR REPLACE FUNCTION public.ss_sync_archive(p_owner uuid,p_kind text,p_client_id text,p_expected bigint,p_restore boolean DEFAULT false)
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
 IF p_restore AND d.payload='{}'::jsonb THEN
  SELECT payload INTO d.payload FROM public.ss_sync_revisions WHERE user_id=p_owner AND kind=p_kind AND client_id=p_client_id AND payload<>'{}'::jsonb ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset_original_missing'; END IF;
 END IF;
 IF d.deleted=NOT p_restore THEN RETURN d; END IF;
 IF d.revision<>p_expected THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 UPDATE public.ss_sync_documents SET payload=d.payload,deleted=NOT p_restore,revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
 FOR key IN SELECT metadata_request_key FROM public.ss_sync_revisions WHERE user_id=p_owner AND kind=p_kind AND client_id=p_client_id AND metadata_request_key IS NOT NULL LOOP
  PERFORM public.storage_apply(p_owner,'studysolo',key,CASE WHEN p_restore THEN 'restore' ELSE 'release' END,0);
 END LOOP;
 -- Tombstones retain bytes, but cease to consume the user's active quota.
 SELECT storage_request_key INTO ref FROM public.ss_data_storage_refs WHERE table_name='ss_sync_documents' AND row_key=d.id::text;
 IF NOT p_restore AND ref IS NOT NULL THEN
  PERFORM public.storage_apply(p_owner,'studysolo',ref,'release',0);
 END IF;
 FOR b IN SELECT * FROM public.ss_sync_body_chunks WHERE user_id=p_owner FOR UPDATE LOOP
  SELECT EXISTS(SELECT 1 FROM public.ss_sync_revisions r JOIN public.ss_sync_documents h ON h.user_id=r.user_id AND h.kind=r.kind AND h.client_id=r.client_id
   WHERE r.user_id=p_owner AND NOT h.deleted AND jsonb_path_exists(r.payload,'$.bodyStorage.fields[*].chunks[*] ? (@ == $hash)',jsonb_build_object('hash',b.sha256)))
   OR EXISTS(SELECT 1 FROM public.ss_sync_writes w WHERE w.user_id=p_owner AND w.state='pending' AND jsonb_path_exists(w.payload,'$.bodyStorage.fields[*].chunks[*] ? (@ == $hash)',jsonb_build_object('hash',b.sha256))) INTO active;
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
REVOKE ALL ON FUNCTION public.ss_account_row_storage(),public.ss_sync_document_asset(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.ss_sync_commit(uuid,uuid),public.ss_sync_archive(uuid,text,text,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_sync_commit(uuid,uuid),public.ss_sync_archive(uuid,text,text,bigint,boolean) TO service_role;
DO $$ DECLARE item uuid; BEGIN
 FOR item IN SELECT id FROM public.ss_sync_documents WHERE deleted AND payload='{}'::jsonb LOOP PERFORM public.ss_sync_document_asset(item); END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

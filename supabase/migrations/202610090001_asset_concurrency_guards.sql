-- Idempotent ACKs and pending body references. Never replay the prior migration.
BEGIN;
CREATE OR REPLACE FUNCTION public.ss_sync_prepare(p_owner uuid,p_mutation uuid,p_kind text,p_client_id text,p_expected bigint,p_payload jsonb,p_chunks jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE existing public.ss_sync_writes; chunk jsonb; b public.ss_sync_body_chunks; result jsonb:='[]'; key text; size bigint; sha text; revision bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 IF p_kind NOT IN ('chat-session','artifact','document','user-note','review-card','chat-project','image-gen') OR p_expected<0 OR octet_length(p_payload::text)>262144 THEN RAISE EXCEPTION 'invalid_sync_payload'; END IF;
 SELECT * INTO existing FROM public.ss_sync_writes WHERE user_id=p_owner AND mutation_id=p_mutation;
 IF FOUND AND (existing.kind<>p_kind OR existing.client_id<>p_client_id OR existing.expected_revision<>p_expected OR existing.payload<>p_payload OR existing.state='cancelled') THEN RAISE EXCEPTION 'mutation_conflict'; END IF;
 IF existing.state='committed' THEN RETURN jsonb_build_object('state','committed','chunks','[]'::jsonb); END IF;
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
CREATE OR REPLACE FUNCTION public.ss_sync_commit(p_owner uuid,p_mutation uuid)
RETURNS public.ss_sync_documents LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE w public.ss_sync_writes; d public.ss_sync_documents; b public.ss_sync_body_chunks; r public.ss_sync_revisions; sha text;
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
 INSERT INTO public.ss_sync_revisions(user_id,kind,client_id,revision,mutation_id,payload) VALUES(p_owner,w.kind,w.client_id,w.expected_revision+1,p_mutation,w.payload);
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
REVOKE ALL ON FUNCTION public.ss_sync_prepare(uuid,uuid,text,text,bigint,jsonb,jsonb),public.ss_sync_commit(uuid,uuid),public.ss_sync_archive(uuid,text,text,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_sync_prepare(uuid,uuid,text,text,bigint,jsonb,jsonb),public.ss_sync_commit(uuid,uuid),public.ss_sync_archive(uuid,text,text,bigint,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

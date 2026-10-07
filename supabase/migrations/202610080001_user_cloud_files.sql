-- Private file bundles reuse the ecosystem storage_apply ledger and membership capacity.
-- A bundle includes the original and its processed context; soft deletion releases
-- the user's active quota but keeps provider bytes until a future reviewed retention job.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES('ss-user-files','ss-user-files',false,33554432)
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='ss-user-files' AND public) THEN RAISE EXCEPTION 'file_bucket_must_be_private'; END IF;
END $$;
CREATE TABLE public.ss_user_files (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 300),
 mime_type text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 26214400),
 processed_bytes bigint NOT NULL CHECK(processed_bytes BETWEEN 1 AND 33554432),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 processed_sha256 text NOT NULL CHECK(processed_sha256 ~ '^[a-f0-9]{64}$'),
 object_key text NOT NULL UNIQUE,
 processed_key text NOT NULL UNIQUE,
 project_id text,
 storage_object_id uuid NOT NULL REFERENCES public.storage_objects(id),
 state text NOT NULL CHECK(state IN ('pending','ready','deleted','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz
);
CREATE INDEX ss_user_files_owner_idx ON public.ss_user_files(user_id,created_at DESC);
ALTER TABLE public.ss_user_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ss_user_files FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.ss_user_files TO service_role;

CREATE FUNCTION public.ss_file_prepare(p_user_id uuid,p_file_id uuid,p_name text,p_mime text,p_size bigint,p_sha256 text,p_processed_size bigint,p_processed_sha256 text,p_project_id text DEFAULT NULL)
RETURNS public.ss_user_files LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE obj public.storage_objects; row public.ss_user_files; key text;
BEGIN
 IF p_file_id IS NULL OR p_size NOT BETWEEN 1 AND 26214400 OR p_processed_size NOT BETWEEN 1 AND 33554432 THEN RAISE EXCEPTION 'invalid_file_size'; END IF;
 key:=p_user_id::text||'/'||p_file_id::text;
 obj:=public.storage_apply(p_user_id,'studysolo','file:'||p_file_id::text,'reserve',p_size+p_processed_size,'supabase','ss-user-files',key||'/original');
 INSERT INTO public.ss_user_files(id,user_id,name,mime_type,size_bytes,processed_bytes,sha256,processed_sha256,object_key,processed_key,project_id,storage_object_id,state)
 VALUES(p_file_id,p_user_id,p_name,p_mime,p_size,p_processed_size,p_sha256,p_processed_sha256,key||'/original',key||'/context.json',p_project_id,obj.id,'pending') RETURNING * INTO row;
 RETURN row;
END $$;
REVOKE ALL ON FUNCTION public.ss_file_prepare(uuid,uuid,text,text,bigint,text,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_file_prepare(uuid,uuid,text,text,bigint,text,bigint,text,text) TO service_role;

CREATE FUNCTION public.ss_file_transition(p_user_id uuid,p_file_id uuid,p_action text)
RETURNS public.ss_user_files LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE row public.ss_user_files;
BEGIN
 SELECT * INTO STRICT row FROM public.ss_user_files WHERE id=p_file_id AND user_id=p_user_id FOR UPDATE;
 IF p_action='complete' THEN
  IF row.state='ready' THEN RETURN row; END IF;
  IF row.state<>'pending' THEN RAISE EXCEPTION 'file_not_pending'; END IF;
  PERFORM public.storage_apply(p_user_id,'studysolo','file:'||p_file_id::text,'commit',row.size_bytes+row.processed_bytes);
  UPDATE public.ss_user_files SET state='ready',updated_at=now() WHERE id=row.id RETURNING * INTO row;
  INSERT INTO public.asset_index(user_id,project_id,source_type,source_id,title,media_type,source_path,storage_object_id,metadata)
  VALUES(p_user_id,'studysolo','cloud-file',row.id::text,row.name,row.mime_type,'/agent/assets?tab=cloud',row.storage_object_id,jsonb_build_object('file_id',row.id,'project_id',row.project_id))
  ON CONFLICT(project_id,source_type,source_id) DO NOTHING;
 ELSIF p_action='delete' THEN
  IF row.state='deleted' THEN RETURN row; END IF;
  PERFORM public.storage_apply(p_user_id,'studysolo','file:'||p_file_id::text,CASE WHEN row.state='ready' THEN 'release' ELSE 'cancel' END,0);
  UPDATE public.ss_user_files SET state='deleted',deleted_at=now(),updated_at=now() WHERE id=row.id RETURNING * INTO row;
  UPDATE public.asset_index SET archived_at=now(),updated_at=now(),storage_object_id=NULL WHERE project_id='studysolo' AND source_type='cloud-file' AND source_id=row.id::text AND user_id=p_user_id;
 ELSE RAISE EXCEPTION 'invalid_file_action'; END IF;
 RETURN row;
END $$;
REVOKE ALL ON FUNCTION public.ss_file_transition(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_file_transition(uuid,uuid,text) TO service_role;
COMMIT;

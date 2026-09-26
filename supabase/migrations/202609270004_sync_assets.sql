-- Ordinary user products only: internal settings/tasks and conversation containers are excluded.
BEGIN;
CREATE OR REPLACE FUNCTION public.ss_sync_document_asset(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.ss_sync_documents; asset_kind text; current_owner uuid;
BEGIN
 SELECT * INTO d FROM public.ss_sync_documents WHERE id=p_id;
 IF NOT FOUND THEN RETURN; END IF;
 asset_kind:=CASE d.kind WHEN 'user-note' THEN 'note' WHEN 'review-card' THEN 'flashcard' WHEN 'document' THEN 'document' WHEN 'artifact' THEN 'artifact' END;
 IF asset_kind IS NULL THEN
  UPDATE public.asset_index SET archived_at=coalesce(archived_at,now()) WHERE project_id='studysolo' AND source_type='sync-document' AND source_id=d.id::text;
  RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=d.user_id) THEN RAISE EXCEPTION 'canonical_owner_required'; END IF;
 SELECT user_id INTO current_owner FROM public.asset_index WHERE project_id='studysolo' AND source_type='sync-document' AND source_id=d.id::text FOR UPDATE;
 IF current_owner IS NOT NULL AND current_owner<>d.user_id THEN RAISE EXCEPTION 'asset_owner_conflict'; END IF;
 INSERT INTO public.asset_index(user_id,project_id,source_type,source_id,title,media_type,source_path,metadata,archived_at,updated_at)
 VALUES(d.user_id,'studysolo','sync-document',d.id::text,left(coalesce(nullif(d.payload->>'title',''),nullif(d.payload->>'name',''),'学习产物'),300),
 CASE d.kind WHEN 'artifact' THEN 'text/html' WHEN 'review-card' THEN 'application/x-flashcard' ELSE 'text/markdown' END,
 '/agent/assets/open?kind='||asset_kind||'&id='||regexp_replace(encode(convert_to(d.client_id,'UTF8'),'hex'),'(..)','%\1','g'),
 jsonb_build_object('kind',d.kind),CASE WHEN d.deleted THEN d.updated_at END,d.updated_at)
 ON CONFLICT(project_id,source_type,source_id) DO UPDATE SET title=excluded.title,media_type=excluded.media_type,source_path=excluded.source_path,
 metadata=excluded.metadata,archived_at=excluded.archived_at,updated_at=excluded.updated_at WHERE asset_index.user_id=excluded.user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'asset_owner_conflict'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.ss_sync_document_asset(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.ss_sync_asset_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.client_id IS DISTINCT FROM OLD.client_id) THEN RAISE EXCEPTION 'sync_identity_immutable'; END IF;
 PERFORM public.ss_sync_document_asset(NEW.id);RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ss_sync_asset_trigger() FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.ss_sync_documents'::regclass AND tgname='ss_sync_asset') THEN
  CREATE TRIGGER ss_sync_asset AFTER INSERT OR UPDATE ON public.ss_sync_documents FOR EACH ROW EXECUTE FUNCTION public.ss_sync_asset_trigger();
 END IF;
END $$;
DO $$ DECLARE row_id uuid; BEGIN
 FOR row_id IN SELECT id FROM public.ss_sync_documents LOOP PERFORM public.ss_sync_document_asset(row_id); END LOOP;
END $$;
COMMIT;

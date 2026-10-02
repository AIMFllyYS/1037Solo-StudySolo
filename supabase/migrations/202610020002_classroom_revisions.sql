-- Monotonic snapshot versions for visible-page synchronization, including child-row mutations.
BEGIN;
ALTER TABLE public.ss_class_sessions ADD COLUMN IF NOT EXISTS cloud_revision bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.ss_class_session_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  NEW.cloud_revision:=OLD.cloud_revision+1;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.ss_class_child_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  UPDATE public.ss_class_sessions SET updated_at=clock_timestamp()
    WHERE id=NEW.session_id AND user_id=NEW.user_id;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER ss_class_revision_before_update BEFORE UPDATE ON public.ss_class_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ss_class_session_revision();
CREATE OR REPLACE TRIGGER ss_class_transcript_revision AFTER INSERT OR UPDATE ON public.ss_class_transcripts
  FOR EACH ROW EXECUTE FUNCTION public.ss_class_child_revision();
CREATE OR REPLACE TRIGGER ss_class_outline_revision AFTER INSERT OR UPDATE ON public.ss_class_outlines
  FOR EACH ROW EXECUTE FUNCTION public.ss_class_child_revision();
CREATE OR REPLACE TRIGGER ss_class_render_revision AFTER INSERT OR UPDATE ON public.ss_class_renders
  FOR EACH ROW EXECUTE FUNCTION public.ss_class_child_revision();
CREATE OR REPLACE TRIGGER ss_class_chat_revision AFTER INSERT OR UPDATE ON public.ss_class_chats
  FOR EACH ROW EXECUTE FUNCTION public.ss_class_child_revision();
REVOKE ALL ON FUNCTION public.ss_class_session_revision(),public.ss_class_child_revision() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ss_class_session_revision(),public.ss_class_child_revision() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

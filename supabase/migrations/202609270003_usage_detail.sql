BEGIN;
CREATE TABLE public.ss_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  pool text NOT NULL CHECK(pool IN ('platform','byok')),
  route text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('llm','image','embedding','rerank','web-search','image-search')),
  selected_model_id text,
  actual_model_id text,
  prompt_tokens bigint NOT NULL DEFAULT 0 CHECK(prompt_tokens>=0),
  completion_tokens bigint NOT NULL DEFAULT 0 CHECK(completion_tokens>=0),
  cached_tokens bigint NOT NULL DEFAULT 0 CHECK(cached_tokens>=0),
  reasoning_tokens bigint NOT NULL DEFAULT 0 CHECK(reasoning_tokens>=0),
  cache_write_tokens bigint NOT NULL DEFAULT 0 CHECK(cache_write_tokens>=0),
  image_count integer NOT NULL DEFAULT 0 CHECK(image_count>=0),
  cost_cny numeric(20,8) NOT NULL DEFAULT 0 CHECK(cost_cny>=0),
  session_id text,
  request_id text,
  meta jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(meta)='object')
);
COMMENT ON TABLE public.ss_usage_ledger IS '【ss StudySolo】Provider usage detail and legacy evidence only; shared credit_ledger is spending authority';
CREATE INDEX ss_usage_ledger_owner_time_idx ON public.ss_usage_ledger(user_id,occurred_at DESC,id);
CREATE INDEX ss_usage_ledger_request_idx ON public.ss_usage_ledger(request_id) WHERE request_id IS NOT NULL;
ALTER TABLE public.ss_usage_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ss_usage_ledger FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ss_usage_ledger TO authenticated;
GRANT SELECT,INSERT ON public.ss_usage_ledger TO service_role;
CREATE POLICY owner_read ON public.ss_usage_ledger FOR SELECT TO authenticated USING(public.ss_class_can_read(user_id));
COMMIT;

-- =========================================================
-- Sprint 2 — Auth + Papéis + Link Compartilhável
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'papel_usuario') THEN
    CREATE TYPE public.papel_usuario AS ENUM ('admin', 'supervisor', 'viewer');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.user_papeis (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  papel public.papel_usuario NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  nome text NOT NULL DEFAULT '',
  iniciais text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_papeis_papel ON public.user_papeis(papel);

DROP TRIGGER IF EXISTS trg_user_papeis_updated_at ON public.user_papeis;
CREATE TRIGGER trg_user_papeis_updated_at
  BEFORE UPDATE ON public.user_papeis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_papeis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_papeis_select_authenticated ON public.user_papeis;
CREATE POLICY user_papeis_select_authenticated ON public.user_papeis
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_papeis
    WHERE user_id = auth.uid() AND papel = 'admin' AND ativo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.pode_escrever()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_papeis
    WHERE user_id = auth.uid() AND papel IN ('admin', 'supervisor') AND ativo = true
  );
$$;

DROP POLICY IF EXISTS user_papeis_admin_all ON public.user_papeis;
CREATE POLICY user_papeis_admin_all ON public.user_papeis
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.supervisores
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supervisores_user_id ON public.supervisores(user_id);

ALTER TABLE public.rdos
  ADD COLUMN IF NOT EXISTS criado_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rdos_criado_por_user_id ON public.rdos(criado_por_user_id);

CREATE TABLE IF NOT EXISTS public.obra_share_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  criado_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  revogado_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_obra_share_tokens_obra_id ON public.obra_share_tokens(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_share_tokens_token ON public.obra_share_tokens(token);

ALTER TABLE public.obra_share_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS obra_share_tokens_select_authenticated ON public.obra_share_tokens;
CREATE POLICY obra_share_tokens_select_authenticated ON public.obra_share_tokens
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS obra_share_tokens_insert_supervisor ON public.obra_share_tokens;
CREATE POLICY obra_share_tokens_insert_supervisor ON public.obra_share_tokens
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_escrever());

DROP POLICY IF EXISTS obra_share_tokens_update_supervisor ON public.obra_share_tokens;
CREATE POLICY obra_share_tokens_update_supervisor ON public.obra_share_tokens
  FOR UPDATE TO authenticated
  USING (public.pode_escrever())
  WITH CHECK (public.pode_escrever());

DROP POLICY IF EXISTS obra_share_tokens_delete_admin ON public.obra_share_tokens;
CREATE POLICY obra_share_tokens_delete_admin ON public.obra_share_tokens
  FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.gerar_share_token_obra(p_obra_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_existente text;
BEGIN
  IF NOT public.pode_escrever() THEN
    RAISE EXCEPTION 'Sem permissão para gerar token desta obra';
  END IF;

  SELECT token INTO v_existente
    FROM public.obra_share_tokens
    WHERE obra_id = p_obra_id AND revogado_em IS NULL
    LIMIT 1;
  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  v_token := encode(gen_random_bytes(18), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');

  INSERT INTO public.obra_share_tokens (obra_id, token, criado_por_user_id)
    VALUES (p_obra_id, v_token, auth.uid());

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.revogar_share_token_obra(p_obra_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_escrever() THEN
    RAISE EXCEPTION 'Sem permissão para revogar token desta obra';
  END IF;

  UPDATE public.obra_share_tokens
    SET revogado_em = now()
    WHERE obra_id = p_obra_id AND revogado_em IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_share_token(p_token text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT obra_id
    FROM public.obra_share_tokens
    WHERE token = p_token AND revogado_em IS NULL
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_share_token_obra(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revogar_share_token_obra(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_share_token(text) TO anon, authenticated;
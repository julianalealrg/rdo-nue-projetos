-- =========================================================
-- Sprint 2 — Auth + Papéis + Link Compartilhável
-- =========================================================
-- Adiciona: user_papeis (3 papéis), vínculo entre supervisores e auth.users,
-- coluna criado_por_user_id em rdos, tabela obra_share_tokens com RPCs.
-- Mantém RLS aberto pra agora; nova migration vem depois pra fechar por papel.

-- =========================================================
-- ENUMS
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'papel_usuario') THEN
    CREATE TYPE public.papel_usuario AS ENUM ('admin', 'supervisor', 'viewer');
  END IF;
END$$;

-- =========================================================
-- TABELA: user_papeis
-- Vincula auth.users a um papel. Cada usuário tem exatamente 1 papel.
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_papeis (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  papel public.papel_usuario NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  nome text NOT NULL DEFAULT '',
  iniciais text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_papeis_papel ON public.user_papeis(papel);

CREATE TRIGGER trg_user_papeis_updated_at
  BEFORE UPDATE ON public.user_papeis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_papeis ENABLE ROW LEVEL SECURITY;

-- Policies provisórias (autenticado vê tudo; user_papeis só admin altera)
CREATE POLICY user_papeis_select_authenticated ON public.user_papeis
  FOR SELECT TO authenticated USING (true);

-- =========================================================
-- HELPERS de auth — checa o papel do usuário corrente
-- =========================================================
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

CREATE POLICY user_papeis_admin_all ON public.user_papeis
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- supervisores: vínculo opcional com auth.users
-- =========================================================
ALTER TABLE public.supervisores
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supervisores_user_id ON public.supervisores(user_id);

-- =========================================================
-- rdos: rastrear quem criou
-- =========================================================
ALTER TABLE public.rdos
  ADD COLUMN IF NOT EXISTS criado_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rdos_criado_por_user_id ON public.rdos(criado_por_user_id);

-- =========================================================
-- TABELA: obra_share_tokens
-- Token único por obra que permite acesso público read-only via /p/obra/:id?t=xxx
-- =========================================================
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

-- Authenticated vê tudo
CREATE POLICY obra_share_tokens_select_authenticated ON public.obra_share_tokens
  FOR SELECT TO authenticated USING (true);

-- Apenas admin/supervisor pode criar/revogar tokens
CREATE POLICY obra_share_tokens_insert_supervisor ON public.obra_share_tokens
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_escrever());

CREATE POLICY obra_share_tokens_update_supervisor ON public.obra_share_tokens
  FOR UPDATE TO authenticated
  USING (public.pode_escrever())
  WITH CHECK (public.pode_escrever());

CREATE POLICY obra_share_tokens_delete_admin ON public.obra_share_tokens
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Acesso anônimo SOMENTE quando há um token válido (não revogado)
-- O check do token é feito via RPC abaixo, não diretamente.
-- A rota pública busca a obra/rdos pela RPC, evitando expor a tabela inteira ao anon.

-- =========================================================
-- RPCs do share token
-- =========================================================

-- Gera (ou retorna o existente ativo) token de uma obra
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

  -- Retorna token ativo existente se houver
  SELECT token INTO v_existente
    FROM public.obra_share_tokens
    WHERE obra_id = p_obra_id AND revogado_em IS NULL
    LIMIT 1;
  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  -- Gera novo token (64 chars hex, baseado em 2x gen_random_uuid)
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.obra_share_tokens (obra_id, token, criado_por_user_id)
    VALUES (p_obra_id, v_token, auth.uid());

  RETURN v_token;
END;
$$;

-- Revoga token ativo da obra (gera novo na próxima chamada)
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

-- Resolve obra_id a partir de um token (público, sem login)
-- Usado pela rota /p/obra/:id?t=xxx pra validar antes de buscar o resto.
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

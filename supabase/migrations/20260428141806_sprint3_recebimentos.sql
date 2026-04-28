-- =========================================================
-- Sprint 3 — Recebimentos da obra
-- =========================================================
-- Documento separado do RDO usado pela Kassiane pra registrar
-- recebimento de cubas/metais que vão pra fábrica. Estrutura
-- simples: descrição livre + fotos + flag teve_avaria + observação.
-- Aparece misturado com RDOs na lista cronológica da obra.
--
-- RLS aberto pra autenticados (igual ao resto do schema). Fechar
-- por papel virá em migration futura.

-- Tabela recebimentos
CREATE TABLE IF NOT EXISTS public.recebimentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT CURRENT_DATE,
  descricao text NOT NULL DEFAULT '',
  teve_avaria boolean NOT NULL DEFAULT false,
  observacao_avaria text NOT NULL DEFAULT '',
  criado_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recebimentos_obra_id ON public.recebimentos(obra_id);
CREATE INDEX IF NOT EXISTS idx_recebimentos_data ON public.recebimentos(data DESC);
CREATE INDEX IF NOT EXISTS idx_recebimentos_criado_por ON public.recebimentos(criado_por_user_id);

CREATE TRIGGER trg_recebimentos_updated_at
  BEFORE UPDATE ON public.recebimentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.recebimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY open_all_select_recebimentos ON public.recebimentos
  FOR SELECT USING (true);
CREATE POLICY open_all_insert_recebimentos ON public.recebimentos
  FOR INSERT WITH CHECK (true);
CREATE POLICY open_all_update_recebimentos ON public.recebimentos
  FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY open_all_delete_recebimentos ON public.recebimentos
  FOR DELETE USING (true);

-- Tabela recebimento_fotos
CREATE TABLE IF NOT EXISTS public.recebimento_fotos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recebimento_id uuid NOT NULL REFERENCES public.recebimentos(id) ON DELETE CASCADE,
  url text NOT NULL,
  legenda text NOT NULL DEFAULT '',
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recebimento_fotos_recebimento_id
  ON public.recebimento_fotos(recebimento_id);
CREATE INDEX IF NOT EXISTS idx_recebimento_fotos_ordem
  ON public.recebimento_fotos(recebimento_id, ordem);

ALTER TABLE public.recebimento_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY open_all_select_recebimento_fotos ON public.recebimento_fotos
  FOR SELECT USING (true);
CREATE POLICY open_all_insert_recebimento_fotos ON public.recebimento_fotos
  FOR INSERT WITH CHECK (true);
CREATE POLICY open_all_update_recebimento_fotos ON public.recebimento_fotos
  FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY open_all_delete_recebimento_fotos ON public.recebimento_fotos
  FOR DELETE USING (true);

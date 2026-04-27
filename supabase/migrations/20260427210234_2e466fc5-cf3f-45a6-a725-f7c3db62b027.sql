ALTER TABLE public.rdo_pendencias
  ADD COLUMN ambiente_id uuid REFERENCES public.obra_ambientes(id) ON DELETE SET NULL;

ALTER TABLE public.rdo_pontos_atencao
  ADD COLUMN ambiente_id uuid REFERENCES public.obra_ambientes(id) ON DELETE SET NULL;

CREATE INDEX idx_rdo_pendencias_ambiente_id ON public.rdo_pendencias(ambiente_id);
CREATE INDEX idx_rdo_pontos_atencao_ambiente_id ON public.rdo_pontos_atencao(ambiente_id);

CREATE TABLE public.rdo_observacoes_ambiente (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rdo_id text NOT NULL REFERENCES public.rdos(id) ON DELETE CASCADE,
  ambiente_id uuid NOT NULL REFERENCES public.obra_ambientes(id) ON DELETE CASCADE,
  texto text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rdo_id, ambiente_id)
);

CREATE INDEX idx_rdo_observacoes_ambiente_rdo_id ON public.rdo_observacoes_ambiente(rdo_id);

CREATE TRIGGER trg_rdo_observacoes_ambiente_updated_at
  BEFORE UPDATE ON public.rdo_observacoes_ambiente
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.rdo_observacoes_ambiente ENABLE ROW LEVEL SECURITY;

-- TODO sprint-auth: substituir por políticas baseadas em auth
CREATE POLICY open_all_select_rdo_observacoes_ambiente ON public.rdo_observacoes_ambiente
  FOR SELECT USING (true);
CREATE POLICY open_all_insert_rdo_observacoes_ambiente ON public.rdo_observacoes_ambiente
  FOR INSERT WITH CHECK (true);
CREATE POLICY open_all_update_rdo_observacoes_ambiente ON public.rdo_observacoes_ambiente
  FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY open_all_delete_rdo_observacoes_ambiente ON public.rdo_observacoes_ambiente
  FOR DELETE USING (true);
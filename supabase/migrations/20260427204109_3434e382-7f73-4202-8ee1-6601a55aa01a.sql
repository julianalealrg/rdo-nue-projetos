-- Limpar todos os dados de teste de RDOs e obras
DELETE FROM public.rdo_versoes;
DELETE FROM public.rdo_fotos;
DELETE FROM public.rdo_pendencias;
DELETE FROM public.rdo_pontos_atencao;
DELETE FROM public.rdo_equipe_nue;
DELETE FROM public.rdo_terceiros;
DELETE FROM public.rdos;
DELETE FROM public.obras;

-- Tabela de ambientes vinculados a obras
CREATE TABLE public.obra_ambientes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obra_ambientes ENABLE ROW LEVEL SECURITY;

-- TODO sprint-auth: ajustar RLS com autenticação
CREATE POLICY "open_all_select_obra_ambientes" ON public.obra_ambientes FOR SELECT USING (true);
CREATE POLICY "open_all_insert_obra_ambientes" ON public.obra_ambientes FOR INSERT WITH CHECK (true);
CREATE POLICY "open_all_update_obra_ambientes" ON public.obra_ambientes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "open_all_delete_obra_ambientes" ON public.obra_ambientes FOR DELETE USING (true);

CREATE INDEX obra_ambientes_obra_ordem_idx ON public.obra_ambientes (obra_id, ordem);
CREATE UNIQUE INDEX obra_ambientes_obra_nome_unique_ativo
  ON public.obra_ambientes (obra_id, lower(nome))
  WHERE ativo = true;

-- rdo_fotos: trocar coluna text "ambiente" por FK ambiente_id
ALTER TABLE public.rdo_fotos DROP COLUMN IF EXISTS ambiente;
ALTER TABLE public.rdo_fotos
  ADD COLUMN ambiente_id uuid REFERENCES public.obra_ambientes(id) ON DELETE SET NULL;

CREATE INDEX rdo_fotos_ambiente_id_idx ON public.rdo_fotos (ambiente_id);
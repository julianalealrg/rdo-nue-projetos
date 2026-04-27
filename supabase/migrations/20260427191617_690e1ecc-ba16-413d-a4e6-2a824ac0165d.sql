-- =========================================================
-- Sistema RDO Obras — schema inicial
-- AVISO: Políticas RLS deste sprint são totalmente abertas
-- (qualquer requisição pode ler/gravar/excluir). DEVERÃO ser
-- endurecidas em sprint futuro quando autenticação for adicionada.
-- =========================================================

-- ENUMS ---------------------------------------------------
CREATE TYPE public.obra_status AS ENUM ('ativa', 'concluida', 'pausada');
CREATE TYPE public.tipo_visita AS ENUM ('medicao', 'supervisao_montagem');
CREATE TYPE public.condicao_local AS ENUM ('praticavel', 'parcialmente_praticavel', 'impraticavel');
CREATE TYPE public.prioridade_pendencia AS ENUM ('alta', 'media', 'baixa');
CREATE TYPE public.categoria_foto AS ENUM ('medicao', 'antes', 'durante', 'depois', 'ocorrencia', 'detalhe');

-- TRIGGER FUNCTION: updated_at ---------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- TABELAS -------------------------------------------------

-- supervisores
CREATE TABLE public.supervisores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  iniciais    TEXT CHECK (char_length(iniciais) = 2),
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- obras
CREATE TABLE public.obras (
  id                TEXT PRIMARY KEY,
  nome_cliente      TEXT NOT NULL,
  endereco          TEXT NOT NULL,
  supervisor_id     UUID REFERENCES public.supervisores(id) ON DELETE SET NULL,
  status            public.obra_status NOT NULL DEFAULT 'ativa',
  motivo_pausa      TEXT NOT NULL DEFAULT '',
  observacoes_obra  TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_obras_updated_at
BEFORE UPDATE ON public.obras
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- rdos
CREATE TABLE public.rdos (
  id                TEXT PRIMARY KEY,
  obra_id           TEXT NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  supervisor_id     UUID REFERENCES public.supervisores(id) ON DELETE SET NULL,
  data              DATE NOT NULL,
  hora_chegada      TIME NOT NULL,
  hora_saida        TIME,
  tipo_visita       public.tipo_visita NOT NULL,
  condicao_local    public.condicao_local NOT NULL,
  registros         TEXT NOT NULL DEFAULT '',
  proximos_passos   TEXT NOT NULL DEFAULT '',
  assinatura_url    TEXT,
  finalizado        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_rdos_updated_at
BEFORE UPDATE ON public.rdos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_rdos_obra_data ON public.rdos (obra_id, data DESC);
CREATE INDEX idx_rdos_supervisor ON public.rdos (supervisor_id);

-- rdo_equipe_nue
CREATE TABLE public.rdo_equipe_nue (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rdo_id  TEXT NOT NULL REFERENCES public.rdos(id) ON DELETE CASCADE,
  nome    TEXT NOT NULL,
  funcao  TEXT NOT NULL DEFAULT '',
  ordem   INT NOT NULL DEFAULT 0
);

-- rdo_terceiros
CREATE TABLE public.rdo_terceiros (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rdo_id  TEXT NOT NULL REFERENCES public.rdos(id) ON DELETE CASCADE,
  nome    TEXT NOT NULL,
  papel   TEXT NOT NULL DEFAULT '',
  ordem   INT NOT NULL DEFAULT 0
);

-- rdo_pendencias
CREATE TABLE public.rdo_pendencias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rdo_id        TEXT NOT NULL REFERENCES public.rdos(id) ON DELETE CASCADE,
  descricao     TEXT NOT NULL,
  prioridade    public.prioridade_pendencia NOT NULL DEFAULT 'media',
  resolvida_em  TIMESTAMPTZ,
  ordem         INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_rdo_pendencias_rdo ON public.rdo_pendencias (rdo_id);
CREATE INDEX idx_rdo_pendencias_abertas
  ON public.rdo_pendencias (resolvida_em)
  WHERE resolvida_em IS NULL;

-- rdo_pontos_atencao
CREATE TABLE public.rdo_pontos_atencao (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rdo_id      TEXT NOT NULL REFERENCES public.rdos(id) ON DELETE CASCADE,
  descricao   TEXT NOT NULL,
  ordem       INT NOT NULL DEFAULT 0
);

-- rdo_fotos
CREATE TABLE public.rdo_fotos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rdo_id      TEXT NOT NULL REFERENCES public.rdos(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  categoria   public.categoria_foto,
  legenda     TEXT NOT NULL DEFAULT '',
  ordem       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rdo_fotos_rdo_ordem ON public.rdo_fotos (rdo_id, ordem);

-- rdo_versoes
CREATE TABLE public.rdo_versoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rdo_id        TEXT NOT NULL REFERENCES public.rdos(id) ON DELETE CASCADE,
  snapshot      JSONB NOT NULL,
  editado_por   UUID REFERENCES public.supervisores(id) ON DELETE SET NULL,
  editado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  nota_edicao   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_rdo_versoes_rdo_data ON public.rdo_versoes (rdo_id, editado_em DESC);

-- =========================================================
-- FUNÇÕES DE GERAÇÃO DE ID (atômicas — evitam race condition)
-- =========================================================

CREATE OR REPLACE FUNCTION public.gerar_proximo_id_obra()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  ultimo_num INT;
  proximo_num INT;
BEGIN
  -- Lock advisory para serializar concorrência neste gerador
  PERFORM pg_advisory_xact_lock(hashtext('gerar_proximo_id_obra'));

  SELECT COALESCE(MAX((substring(id from 4))::INT), 0)
    INTO ultimo_num
    FROM public.obras
   WHERE id ~ '^OB-[0-9]+$';

  proximo_num := ultimo_num + 1;
  RETURN 'OB-' || lpad(proximo_num::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_proximo_id_rdo()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  ultimo_num INT;
  proximo_num INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('gerar_proximo_id_rdo'));

  SELECT COALESCE(MAX((substring(id from 5))::INT), 0)
    INTO ultimo_num
    FROM public.rdos
   WHERE id ~ '^RDO-[0-9]+$';

  proximo_num := ultimo_num + 1;
  RETURN 'RDO-' || lpad(proximo_num::TEXT, 6, '0');
END;
$$;

-- =========================================================
-- RLS — POLÍTICAS ABERTAS PROVISÓRIAS
-- TODO(sprint-auth): substituir por policies baseadas em
-- auth.uid() / role assim que login for implementado.
-- =========================================================

ALTER TABLE public.supervisores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obras              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rdos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rdo_equipe_nue     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rdo_terceiros      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rdo_pendencias     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rdo_pontos_atencao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rdo_fotos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rdo_versoes        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'supervisores','obras','rdos','rdo_equipe_nue','rdo_terceiros',
    'rdo_pendencias','rdo_pontos_atencao','rdo_fotos','rdo_versoes'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY "open_all_select_%I" ON public.%I FOR SELECT USING (true);', t, t
    );
    EXECUTE format(
      'CREATE POLICY "open_all_insert_%I" ON public.%I FOR INSERT WITH CHECK (true);', t, t
    );
    EXECUTE format(
      'CREATE POLICY "open_all_update_%I" ON public.%I FOR UPDATE USING (true) WITH CHECK (true);', t, t
    );
    EXECUTE format(
      'CREATE POLICY "open_all_delete_%I" ON public.%I FOR DELETE USING (true);', t, t
    );
  END LOOP;
END$$;

-- =========================================================
-- STORAGE — buckets públicos
-- TODO(sprint-auth): restringir por papel/obra quando login existir.
-- =========================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('rdo-fotos', 'rdo-fotos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('rdo-assinaturas', 'rdo-assinaturas', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Políticas abertas para os buckets (provisório)
CREATE POLICY "rdo_buckets_select_open"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('rdo-fotos', 'rdo-assinaturas'));

CREATE POLICY "rdo_buckets_insert_open"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('rdo-fotos', 'rdo-assinaturas'));

CREATE POLICY "rdo_buckets_update_open"
  ON storage.objects FOR UPDATE
  USING (bucket_id IN ('rdo-fotos', 'rdo-assinaturas'))
  WITH CHECK (bucket_id IN ('rdo-fotos', 'rdo-assinaturas'));

CREATE POLICY "rdo_buckets_delete_open"
  ON storage.objects FOR DELETE
  USING (bucket_id IN ('rdo-fotos', 'rdo-assinaturas'));

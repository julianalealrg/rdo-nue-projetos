import { supabase } from "@/integrations/supabase/client";
import type { Tables, Enums } from "@/integrations/supabase/types";

export type Obra = Tables<"obras">;
export type Supervisor = Tables<"supervisores">;
export type Rdo = Tables<"rdos">;
export type Ambiente = Tables<"obra_ambientes">;
export type AmbienteResumo = Pick<Ambiente, "id" | "nome" | "ordem" | "ativo">;
export type RdoFotoBase = Tables<"rdo_fotos">;
export type RdoFoto = RdoFotoBase & {
  ambiente?: AmbienteResumo | null;
};
export type RdoPendenciaBase = Tables<"rdo_pendencias">;
export type RdoPendencia = RdoPendenciaBase & {
  ambiente?: AmbienteResumo | null;
};
export type RdoPontoAtencaoBase = Tables<"rdo_pontos_atencao">;
export type RdoPontoAtencao = RdoPontoAtencaoBase & {
  ambiente?: AmbienteResumo | null;
};
export type RdoEquipeNue = Tables<"rdo_equipe_nue">;
export type RdoTerceiro = Tables<"rdo_terceiros">;
export type RdoObservacaoAmbiente = Tables<"rdo_observacoes_ambiente">;

export type RdoCompleto = Rdo & {
  supervisor: Pick<Supervisor, "id" | "nome" | "iniciais"> | null;
  fotos: RdoFoto[];
  pendencias: RdoPendencia[];
  pontos_atencao: RdoPontoAtencao[];
  equipe_nue: RdoEquipeNue[];
  terceiros: RdoTerceiro[];
  observacoes_ambiente: RdoObservacaoAmbiente[];
};

export type ObraComSupervisor = Obra & {
  supervisor: Pick<Supervisor, "id" | "nome" | "iniciais"> | null;
  ambientes?: Ambiente[];
  // NOTE: coluna adicionada na migration 20260428145229 — opcional aqui até
  // o Supabase regenerar types e a coluna entrar em Tables<"obras">.
  onedrive_url?: string;
};

export type DiarioObraData = {
  obra: ObraComSupervisor;
  rdos: RdoCompleto[];
};

export class ObraNaoEncontradaError extends Error {
  constructor(id: string) {
    super(`Obra ${id} não encontrada`);
    this.name = "ObraNaoEncontradaError";
  }
}

const FOTO_SELECT = "*, ambiente:obra_ambientes(id, nome, ordem, ativo)";
const PEND_SELECT = "*, ambiente:obra_ambientes(id, nome, ordem, ativo)";
const PONTO_SELECT = "*, ambiente:obra_ambientes(id, nome, ordem, ativo)";

/* ------------------------- RESUMO LEVE PARA LISTAGEM ------------------------- */

export type RdoResumo = Pick<
  Rdo,
  | "id"
  | "obra_id"
  | "data"
  | "hora_chegada"
  | "hora_saida"
  | "tipo_visita"
  | "condicao_local"
  | "finalizado"
  | "supervisor_id"
  | "created_at"
  | "updated_at"
> & {
  supervisor: Pick<Supervisor, "id" | "nome" | "iniciais"> | null;
  total_fotos: number;
  total_pendencias: number;
  total_pontos: number;
};

export type DiarioObraResumoData = {
  obra: ObraComSupervisor;
  rdos: RdoResumo[];
};

const RDO_RESUMO_COLS =
  "id, obra_id, data, hora_chegada, hora_saida, tipo_visita, condicao_local, finalizado, supervisor_id, created_at, updated_at";

/**
 * Versão leve do diário: traz só campos básicos do RDO + contagens.
 * Não carrega fotos, pendências, pontos, equipes, observações.
 * Use fetchRdoDetalhes(rdoId) para carregar o resto sob demanda.
 */
export async function fetchDiarioObraResumo(
  id: string,
): Promise<DiarioObraResumoData> {
  const [obraRes, rdosRes, fotosRes, pendRes, pontosRes] = await Promise.all([
    supabase
      .from("obras")
      .select("*, supervisor:supervisores(id, nome, iniciais)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("rdos")
      .select(`${RDO_RESUMO_COLS}, supervisor:supervisores(id, nome, iniciais)`)
      .eq("obra_id", id)
      .order("data", { ascending: false })
      .order("hora_chegada", { ascending: false }),
    supabase.from("rdo_fotos").select("rdo_id, rdos!inner(obra_id)").eq("rdos.obra_id", id),
    supabase
      .from("rdo_pendencias")
      .select("rdo_id, rdos!inner(obra_id)")
      .eq("rdos.obra_id", id),
    supabase
      .from("rdo_pontos_atencao")
      .select("rdo_id, rdos!inner(obra_id)")
      .eq("rdos.obra_id", id),
  ]);

  if (obraRes.error) throw new Error(`Falha ao carregar obra: ${obraRes.error.message}`);
  if (!obraRes.data) throw new ObraNaoEncontradaError(id);
  if (rdosRes.error) throw new Error(`Falha ao carregar RDOs: ${rdosRes.error.message}`);
  if (fotosRes.error)
    throw new Error(`Falha ao contar fotos: ${fotosRes.error.message}`);
  if (pendRes.error)
    throw new Error(`Falha ao contar pendências: ${pendRes.error.message}`);
  if (pontosRes.error)
    throw new Error(`Falha ao contar pontos: ${pontosRes.error.message}`);

  const countMap = (rows: { rdo_id: string }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.rdo_id, (m.get(r.rdo_id) ?? 0) + 1);
    return m;
  };
  const fotos = countMap((fotosRes.data ?? []) as { rdo_id: string }[]);
  const pend = countMap((pendRes.data ?? []) as { rdo_id: string }[]);
  const pontos = countMap((pontosRes.data ?? []) as { rdo_id: string }[]);

  const rdos: RdoResumo[] = (rdosRes.data ?? []).map((r) => {
    const row = r as Rdo & {
      supervisor: { id: string; nome: string; iniciais: string | null } | null;
    };
    return {
      id: row.id,
      obra_id: row.obra_id,
      data: row.data,
      hora_chegada: row.hora_chegada,
      hora_saida: row.hora_saida,
      tipo_visita: row.tipo_visita,
      condicao_local: row.condicao_local,
      finalizado: row.finalizado,
      supervisor_id: row.supervisor_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      supervisor: row.supervisor ?? null,
      total_fotos: fotos.get(row.id) ?? 0,
      total_pendencias: pend.get(row.id) ?? 0,
      total_pontos: pontos.get(row.id) ?? 0,
    };
  });

  return {
    obra: {
      ...(obraRes.data as Obra),
      supervisor:
        (obraRes.data as { supervisor: ObraComSupervisor["supervisor"] }).supervisor ?? null,
    },
    rdos,
  };
}

/** Carrega detalhes completos de um único RDO (fotos, pendências, pontos, equipes, observações). */
export async function fetchRdoDetalhes(rdoId: string): Promise<RdoCompleto> {
  const { data, error } = await supabase
    .from("rdos")
    .select(
      `*,
       supervisor:supervisores(id, nome, iniciais),
       fotos:rdo_fotos(${FOTO_SELECT}),
       pendencias:rdo_pendencias(${PEND_SELECT}),
       pontos_atencao:rdo_pontos_atencao(${PONTO_SELECT}),
       equipe_nue:rdo_equipe_nue(*),
       terceiros:rdo_terceiros(*),
       observacoes_ambiente:rdo_observacoes_ambiente(*)`,
    )
    .eq("id", rdoId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar RDO: ${error.message}`);
  if (!data) throw new Error(`RDO ${rdoId} não encontrado`);

  const r = data as unknown as Rdo & {
    supervisor: RdoCompleto["supervisor"];
    fotos: RdoFoto[];
    pendencias: RdoPendencia[];
    pontos_atencao: RdoPontoAtencao[];
    equipe_nue: RdoEquipeNue[];
    terceiros: RdoTerceiro[];
    observacoes_ambiente: RdoObservacaoAmbiente[];
  };
  return {
    ...(r as Rdo),
    supervisor: r.supervisor ?? null,
    fotos: (r.fotos ?? []).slice().sort((a, b) => a.ordem - b.ordem),
    pendencias: (r.pendencias ?? []).slice().sort((a, b) => a.ordem - b.ordem),
    pontos_atencao: (r.pontos_atencao ?? []).slice().sort((a, b) => a.ordem - b.ordem),
    equipe_nue: (r.equipe_nue ?? []).slice().sort((a, b) => a.ordem - b.ordem),
    terceiros: (r.terceiros ?? []).slice().sort((a, b) => a.ordem - b.ordem),
    observacoes_ambiente: (r.observacoes_ambiente ?? []).slice(),
  };
}

export async function fetchDiarioObra(id: string): Promise<DiarioObraData> {
  const [obraRes, rdosRes, ambientesRes] = await Promise.all([
    supabase
      .from("obras")
      .select("*, supervisor:supervisores(id, nome, iniciais)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("rdos")
      .select(
        `*,
         supervisor:supervisores(id, nome, iniciais),
         fotos:rdo_fotos(${FOTO_SELECT}),
         pendencias:rdo_pendencias(${PEND_SELECT}),
         pontos_atencao:rdo_pontos_atencao(${PONTO_SELECT}),
         equipe_nue:rdo_equipe_nue(*),
         terceiros:rdo_terceiros(*),
         observacoes_ambiente:rdo_observacoes_ambiente(*)`,
      )
      .eq("obra_id", id)
      .order("data", { ascending: false })
      .order("hora_chegada", { ascending: false }),
    supabase
      .from("obra_ambientes")
      .select("*")
      .eq("obra_id", id)
      .eq("ativo", true)
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (obraRes.error) throw new Error(`Falha ao carregar obra: ${obraRes.error.message}`);
  if (!obraRes.data) throw new ObraNaoEncontradaError(id);
  if (rdosRes.error) throw new Error(`Falha ao carregar RDOs: ${rdosRes.error.message}`);
  if (ambientesRes.error)
    throw new Error(`Falha ao carregar ambientes: ${ambientesRes.error.message}`);

  const rdos = (rdosRes.data ?? []).map((r): RdoCompleto => ({
    ...(r as Rdo),
    supervisor: (r as { supervisor: RdoCompleto["supervisor"] }).supervisor ?? null,
    fotos: ((r as { fotos: RdoFoto[] }).fotos ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem),
    pendencias: ((r as { pendencias: RdoPendencia[] }).pendencias ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem),
    pontos_atencao: ((r as { pontos_atencao: RdoPontoAtencao[] }).pontos_atencao ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem),
    equipe_nue: ((r as { equipe_nue: RdoEquipeNue[] }).equipe_nue ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem),
    terceiros: ((r as { terceiros: RdoTerceiro[] }).terceiros ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem),
    observacoes_ambiente:
      ((r as { observacoes_ambiente: RdoObservacaoAmbiente[] }).observacoes_ambiente ?? []).slice(),
  }));

  return {
    obra: {
      ...(obraRes.data as Obra),
      supervisor:
        (obraRes.data as { supervisor: ObraComSupervisor["supervisor"] }).supervisor ?? null,
      ambientes: (ambientesRes.data ?? []) as Ambiente[],
    },
    rdos,
  };
}

export const RDO_FOTO_SELECT = FOTO_SELECT;

export type CondicaoLocal = Enums<"condicao_local">;
export type TipoVisita = Enums<"tipo_visita">;
export type Prioridade = Enums<"prioridade_pendencia">;

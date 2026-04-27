import { supabase } from "@/integrations/supabase/client";
import type { Tables, Enums } from "@/integrations/supabase/types";

export type Obra = Tables<"obras">;
export type Supervisor = Tables<"supervisores">;
export type Rdo = Tables<"rdos">;
export type Ambiente = Tables<"obra_ambientes">;
export type RdoFotoBase = Tables<"rdo_fotos">;
export type RdoFoto = RdoFotoBase & {
  ambiente?: Pick<Ambiente, "id" | "nome" | "ordem" | "ativo"> | null;
};
export type RdoPendencia = Tables<"rdo_pendencias">;
export type RdoPontoAtencao = Tables<"rdo_pontos_atencao">;
export type RdoEquipeNue = Tables<"rdo_equipe_nue">;
export type RdoTerceiro = Tables<"rdo_terceiros">;

export type RdoCompleto = Rdo & {
  supervisor: Pick<Supervisor, "id" | "nome" | "iniciais"> | null;
  fotos: RdoFoto[];
  pendencias: RdoPendencia[];
  pontos_atencao: RdoPontoAtencao[];
  equipe_nue: RdoEquipeNue[];
  terceiros: RdoTerceiro[];
};

export type ObraComSupervisor = Obra & {
  supervisor: Pick<Supervisor, "id" | "nome" | "iniciais"> | null;
  ambientes?: Ambiente[];
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
         pendencias:rdo_pendencias(*),
         pontos_atencao:rdo_pontos_atencao(*),
         equipe_nue:rdo_equipe_nue(*),
         terceiros:rdo_terceiros(*)`,
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

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type DashboardRdoRecente = {
  id: string;
  data: string;
  obra_id: string;
  cliente: string;
  supervisor_nome: string | null;
  supervisor_iniciais: string | null;
};

export type DashboardObraSemRegistro = {
  id: string;
  cliente: string;
  ultimo_rdo: string | null;
  dias_sem_registro: number | null;
  supervisor_nome: string | null;
  supervisor_iniciais: string | null;
};

export type DashboardPendenciaCritica = {
  id: string;
  texto: string;
  rdo_id: string;
  obra_id: string;
  cliente: string;
  data_rdo: string;
  ambiente_nome: string | null;
};

export type DashboardAtividadeSupervisor = {
  supervisor_id: string;
  nome: string;
  iniciais: string | null;
  rdos_semana: number;
};

export type DashboardSerieDia = {
  data: string;
  total: number;
};

export type DashboardData = {
  rdosRecentes: DashboardRdoRecente[];
  obrasSemRegistro: DashboardObraSemRegistro[];
  pendenciasCriticas: DashboardPendenciaCritica[];
  atividadeSupervisores: DashboardAtividadeSupervisor[];
  serie14Dias: DashboardSerieDia[];
};

type ObraRef = Pick<Tables<"obras">, "id" | "nome_cliente" | "status" | "supervisor_id">;
type SupervisorRef = Pick<Tables<"supervisores">, "id" | "nome" | "iniciais">;
type RdoLite = Pick<Tables<"rdos">, "id" | "data" | "obra_id" | "supervisor_id" | "created_at">;

function isoDaysAgoRecife(days: number): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const now = new Date();
  const past = new Date(now.getTime() - days * 86_400_000);
  return fmt.format(past);
}

function isoTodayRecife(): string {
  return isoDaysAgoRecife(0);
}

function diffDiasFromTodayRecife(isoDate: string): number {
  const hojeISO = isoTodayRecife();
  const [y1, m1, d1] = hojeISO.split("-").map(Number);
  const [y2, m2, d2] = isoDate.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((a - b) / 86_400_000);
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const limite7d = isoDaysAgoRecife(7);
  const limite14d = isoDaysAgoRecife(14);
  const hoje = isoTodayRecife();

  const [obrasRes, supRes, rdosRes, pendRes] = await Promise.all([
    supabase
      .from("obras")
      .select("id, nome_cliente, status, supervisor_id"),
    supabase
      .from("supervisores")
      .select("id, nome, iniciais")
      .eq("ativo", true)
      .order("nome", { ascending: true }),
    supabase
      .from("rdos")
      .select("id, data, obra_id, supervisor_id, created_at")
      .order("data", { ascending: false }),
    supabase
      .from("rdo_pendencias")
      .select(
        "id, texto, rdo_id, ambiente_id, ambiente:obra_ambientes(id, nome), rdo:rdos(id, data, obra_id)",
      )
      .eq("prioridade", "alta")
      .is("resolvida_em", null),
  ]);

  if (obrasRes.error) throw new Error(`Falha ao carregar obras: ${obrasRes.error.message}`);
  if (supRes.error) throw new Error(`Falha ao carregar supervisores: ${supRes.error.message}`);
  if (rdosRes.error) throw new Error(`Falha ao carregar RDOs: ${rdosRes.error.message}`);
  if (pendRes.error) throw new Error(`Falha ao carregar pendências: ${pendRes.error.message}`);

  const obras = (obrasRes.data ?? []) as ObraRef[];
  const supervisores = (supRes.data ?? []) as SupervisorRef[];
  const rdos = (rdosRes.data ?? []) as RdoLite[];

  const obraById = new Map(obras.map((o) => [o.id, o]));
  const supById = new Map(supervisores.map((s) => [s.id, s]));

  // RDOs recentes — top 10 por data desc, depois created_at desc
  const rdosOrdenados = [...rdos].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return (b.created_at ?? "") > (a.created_at ?? "") ? 1 : -1;
  });

  const rdosRecentes: DashboardRdoRecente[] = rdosOrdenados.slice(0, 10).map((r) => {
    const obra = obraById.get(r.obra_id);
    const sup = r.supervisor_id ? supById.get(r.supervisor_id) ?? null : null;
    return {
      id: r.id,
      data: r.data,
      obra_id: r.obra_id,
      cliente: obra?.nome_cliente ?? "—",
      supervisor_nome: sup?.nome ?? null,
      supervisor_iniciais: sup?.iniciais ?? null,
    };
  });

  // Último RDO por obra
  const ultimoPorObra = new Map<string, string>();
  for (const r of rdos) {
    const atual = ultimoPorObra.get(r.obra_id);
    if (!atual || r.data > atual) ultimoPorObra.set(r.obra_id, r.data);
  }

  // Obras sem registro 7+ dias (apenas ativas)
  const obrasSemRegistro: DashboardObraSemRegistro[] = obras
    .filter((o) => o.status === "ativa")
    .map((o) => {
      const ultimo = ultimoPorObra.get(o.id) ?? null;
      const dias = ultimo ? diffDiasFromTodayRecife(ultimo) : null;
      const sup = o.supervisor_id ? supById.get(o.supervisor_id) ?? null : null;
      return {
        id: o.id,
        cliente: o.nome_cliente,
        ultimo_rdo: ultimo,
        dias_sem_registro: dias,
        supervisor_nome: sup?.nome ?? null,
        supervisor_iniciais: sup?.iniciais ?? null,
      };
    })
    .filter((o) => o.dias_sem_registro === null || o.dias_sem_registro >= 7)
    .sort((a, b) => {
      const da = a.dias_sem_registro ?? Number.POSITIVE_INFINITY;
      const db = b.dias_sem_registro ?? Number.POSITIVE_INFINITY;
      return db - da;
    });

  // Pendências críticas (prioridade alta, abertas)
  type PendRow = {
    id: string;
    texto: string;
    rdo_id: string;
    ambiente_id: string | null;
    ambiente: { id: string; nome: string } | null;
    rdo: { id: string; data: string; obra_id: string } | null;
  };
  const pendencias = (pendRes.data ?? []) as unknown as PendRow[];

  const pendenciasCriticas: DashboardPendenciaCritica[] = pendencias
    .map((p) => {
      const obra = p.rdo ? obraById.get(p.rdo.obra_id) : undefined;
      return {
        id: p.id,
        texto: p.texto,
        rdo_id: p.rdo_id,
        obra_id: p.rdo?.obra_id ?? "",
        cliente: obra?.nome_cliente ?? "—",
        data_rdo: p.rdo?.data ?? "",
        ambiente_nome: p.ambiente?.nome ?? null,
      };
    })
    .filter((p) => p.obra_id)
    .sort((a, b) => (a.data_rdo < b.data_rdo ? 1 : -1));

  // Atividade por supervisor (últimos 7 dias)
  const contagemSup = new Map<string, number>();
  for (const r of rdos) {
    if (r.data < limite7d) continue;
    if (!r.supervisor_id) continue;
    contagemSup.set(r.supervisor_id, (contagemSup.get(r.supervisor_id) ?? 0) + 1);
  }
  const atividadeSupervisores: DashboardAtividadeSupervisor[] = supervisores
    .map((s) => ({
      supervisor_id: s.id,
      nome: s.nome,
      iniciais: s.iniciais,
      rdos_semana: contagemSup.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.rdos_semana - a.rdos_semana);

  // Série últimos 14 dias
  const contagemPorDia = new Map<string, number>();
  for (const r of rdos) {
    if (r.data < limite14d || r.data > hoje) continue;
    contagemPorDia.set(r.data, (contagemPorDia.get(r.data) ?? 0) + 1);
  }
  const serie14Dias: DashboardSerieDia[] = [];
  for (let i = 13; i >= 0; i--) {
    const dia = isoDaysAgoRecife(i);
    serie14Dias.push({ data: dia, total: contagemPorDia.get(dia) ?? 0 });
  }

  return {
    rdosRecentes,
    obrasSemRegistro,
    pendenciasCriticas,
    atividadeSupervisores,
    serie14Dias,
  };
}

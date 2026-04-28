import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Obra = Tables<"obras">;
export type Supervisor = Tables<"supervisores">;

export type ObraComResumo = Obra & {
  supervisor: Pick<Supervisor, "id" | "nome" | "iniciais"> | null;
  total_rdos: number;
  ultimo_rdo: string | null; // ISO date (yyyy-mm-dd) ou null
};

export type DashboardData = {
  obras: ObraComResumo[];
  supervisores: Supervisor[];
  stats: {
    obrasAtivas: number;
    rdosSemana: number;
    pendenciasAbertas: number;
    semRegistro7Dias: number;
  };
};

/**
 * Busca tudo que o painel precisa em paralelo: obras, supervisores ativos,
 * RDOs (id, obra_id, data) e pendências abertas. Faz o agregado no client
 * para evitar N+1 e múltiplas roundtrips.
 */
export async function fetchPainelObras(): Promise<DashboardData> {
  const [obrasRes, supRes, rdosRes, pendRes] = await Promise.all([
    supabase
      .from("obras")
      .select(
        "id, nome_cliente, endereco, status, motivo_pausa, observacoes_obra, onedrive_url, supervisor_id, created_at, updated_at, supervisor:supervisores(id, nome, iniciais)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("supervisores")
      .select("*")
      .eq("ativo", true)
      .order("nome", { ascending: true }),
    supabase.from("rdos").select("id, obra_id, data"),
    supabase
      .from("rdo_pendencias")
      .select("id", { count: "exact", head: true })
      .is("resolvida_em", null),
  ]);

  if (obrasRes.error) throw new Error(`Falha ao carregar obras: ${obrasRes.error.message}`);
  if (supRes.error) throw new Error(`Falha ao carregar supervisores: ${supRes.error.message}`);
  if (rdosRes.error) throw new Error(`Falha ao carregar RDOs: ${rdosRes.error.message}`);
  if (pendRes.error)
    throw new Error(`Falha ao carregar pendências: ${pendRes.error.message}`);

  const rdos = rdosRes.data ?? [];

  // Agregados por obra
  const totaisPorObra = new Map<string, number>();
  const ultimoPorObra = new Map<string, string>();
  for (const r of rdos) {
    totaisPorObra.set(r.obra_id, (totaisPorObra.get(r.obra_id) ?? 0) + 1);
    const atual = ultimoPorObra.get(r.obra_id);
    if (!atual || r.data > atual) ultimoPorObra.set(r.obra_id, r.data);
  }

  const obras: ObraComResumo[] = (obrasRes.data ?? []).map((o) => ({
    id: o.id,
    nome_cliente: o.nome_cliente,
    endereco: o.endereco,
    status: o.status,
    motivo_pausa: o.motivo_pausa,
    observacoes_obra: o.observacoes_obra,
    onedrive_url: o.onedrive_url,
    supervisor_id: o.supervisor_id,
    created_at: o.created_at,
    updated_at: o.updated_at,
    supervisor: (o.supervisor as ObraComResumo["supervisor"]) ?? null,
    total_rdos: totaisPorObra.get(o.id) ?? 0,
    ultimo_rdo: ultimoPorObra.get(o.id) ?? null,
  }));

  // Stats
  const hoje = new Date();
  const seteDiasAtras = new Date(hoje);
  seteDiasAtras.setDate(hoje.getDate() - 7);
  const limiteISO = seteDiasAtras.toISOString().slice(0, 10);

  const obrasAtivas = obras.filter((o) => o.status === "ativa").length;
  const rdosSemana = rdos.filter((r) => r.data >= limiteISO).length;
  const semRegistro7Dias = obras.filter(
    (o) => o.status === "ativa" && (!o.ultimo_rdo || o.ultimo_rdo < limiteISO)
  ).length;

  return {
    obras,
    supervisores: supRes.data ?? [],
    stats: {
      obrasAtivas,
      rdosSemana,
      pendenciasAbertas: pendRes.count ?? 0,
      semRegistro7Dias,
    },
  };
}

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Ambiente = Tables<"obra_ambientes">;

export async function fetchAmbientesObra(
  obraId: string,
  opts?: { incluirInativos?: boolean },
): Promise<Ambiente[]> {
  let q = supabase
    .from("obra_ambientes")
    .select("*")
    .eq("obra_id", obraId)
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (!opts?.incluirInativos) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw new Error(`Falha ao listar ambientes: ${error.message}`);
  return (data ?? []) as Ambiente[];
}

export async function criarAmbiente(
  obraId: string,
  nome: string,
  ordem?: number,
): Promise<Ambiente> {
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) throw new Error("Nome do ambiente é obrigatório");

  let ordemFinal = ordem;
  if (ordemFinal === undefined) {
    const { data: existentes } = await supabase
      .from("obra_ambientes")
      .select("ordem")
      .eq("obra_id", obraId)
      .order("ordem", { ascending: false })
      .limit(1);
    ordemFinal = existentes && existentes.length > 0 ? existentes[0].ordem + 1 : 0;
  }

  const { data, error } = await supabase
    .from("obra_ambientes")
    .insert({ obra_id: obraId, nome: nomeLimpo, ordem: ordemFinal, ativo: true })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Falha ao criar ambiente: ${error?.message ?? "erro"}`);
  }
  return data as Ambiente;
}

export async function renomearAmbiente(id: string, novoNome: string): Promise<void> {
  const nomeLimpo = novoNome.trim();
  if (!nomeLimpo) throw new Error("Nome do ambiente não pode ficar vazio");
  const { error } = await supabase
    .from("obra_ambientes")
    .update({ nome: nomeLimpo })
    .eq("id", id);
  if (error) throw new Error(`Falha ao renomear ambiente: ${error.message}`);
}

export async function desativarAmbiente(id: string): Promise<void> {
  const { error } = await supabase
    .from("obra_ambientes")
    .update({ ativo: false })
    .eq("id", id);
  if (error) throw new Error(`Falha ao desativar ambiente: ${error.message}`);
}

export async function reativarAmbiente(id: string): Promise<void> {
  const { error } = await supabase
    .from("obra_ambientes")
    .update({ ativo: true })
    .eq("id", id);
  if (error) throw new Error(`Falha ao reativar ambiente: ${error.message}`);
}

export async function reordenarAmbientes(
  _obraId: string,
  ids: string[],
): Promise<void> {
  const updates = ids.map((id, i) =>
    supabase.from("obra_ambientes").update({ ordem: i }).eq("id", id),
  );
  const results = await Promise.all(updates);
  for (const r of results) {
    if (r.error) throw new Error(`Falha ao reordenar: ${r.error.message}`);
  }
}

export async function criarAmbientesEmLote(
  obraId: string,
  nomes: string[],
): Promise<void> {
  const limpos = nomes.map((n) => n.trim()).filter((n) => n.length > 0);
  if (limpos.length === 0) return;
  const rows = limpos.map((nome, i) => ({
    obra_id: obraId,
    nome,
    ordem: i,
    ativo: true,
  }));
  const { error } = await supabase.from("obra_ambientes").insert(rows);
  if (error) throw new Error(`Falha ao criar ambientes: ${error.message}`);
}

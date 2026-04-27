import { supabase } from "@/integrations/supabase/client";
import { gerarProximoIdRdo } from "@/lib/ids";
import type {
  Rdo,
  RdoCompleto,
  RdoEquipeNue,
  RdoTerceiro,
  RdoPendencia,
  RdoPontoAtencao,
  ObraComSupervisor,
  CondicaoLocal,
  TipoVisita,
  Prioridade,
} from "@/lib/diario";
import type { Json } from "@/integrations/supabase/types";

/* ---------------- Tipos do form ---------------- */

export type EquipeItem = { nome: string; funcao: string };
export type TerceiroItem = { nome: string; papel: string };
export type PendenciaItem = { descricao: string; prioridade: Prioridade };
export type PontoAtencaoItem = { descricao: string };

export type FormRdoState = {
  data: string;
  hora_chegada: string;
  hora_saida: string;
  tipo_visita: TipoVisita | "";
  condicao_local: CondicaoLocal | "";
  registros: string;
  proximos_passos: string;
  equipe_nue: EquipeItem[];
  terceiros: TerceiroItem[];
  pendencias: PendenciaItem[];
  pontos_atencao: PontoAtencaoItem[];
};

/* ---------------- Erros tipados ---------------- */

export class RdoNaoEncontradoError extends Error {
  constructor(id: string) {
    super(`RDO ${id} não encontrado`);
    this.name = "RdoNaoEncontradoError";
  }
}

export class ObraNaoEncontradaError extends Error {
  constructor(id: string) {
    super(`Obra ${id} não encontrada`);
    this.name = "ObraNaoEncontradaError";
  }
}

/* ---------------- Fetchers ---------------- */

export async function fetchObra(id: string): Promise<ObraComSupervisor> {
  const [obraRes, ambRes] = await Promise.all([
    supabase
      .from("obras")
      .select("*, supervisor:supervisores(id, nome, iniciais)")
      .eq("id", id)
      .maybeSingle(),
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
  if (ambRes.error) throw new Error(`Falha ao carregar ambientes: ${ambRes.error.message}`);

  const obraRaw = obraRes.data as unknown as ObraComSupervisor;
  return {
    ...obraRaw,
    supervisor: obraRaw.supervisor ?? null,
    ambientes: ambRes.data ?? [],
  };
}

export type RdoComObra = {
  rdo: RdoCompleto;
  obra: ObraComSupervisor;
};

export async function fetchRdoCompleto(id: string): Promise<RdoComObra> {
  const { data, error } = await supabase
    .from("rdos")
    .select(
      `*,
       supervisor:supervisores(id, nome, iniciais),
       fotos:rdo_fotos(*, ambiente:obra_ambientes(id, nome, ordem, ativo)),
       pendencias:rdo_pendencias(*),
       pontos_atencao:rdo_pontos_atencao(*),
       equipe_nue:rdo_equipe_nue(*),
       terceiros:rdo_terceiros(*),
       obra:obras(*, supervisor:supervisores(id, nome, iniciais))`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar RDO: ${error.message}`);
  if (!data) throw new RdoNaoEncontradoError(id);

  const r = data as unknown as Record<string, unknown>;
  const obraRaw = r.obra as
    | (ObraComSupervisor & { supervisor: ObraComSupervisor["supervisor"] })
    | null;

  if (!obraRaw) throw new Error("RDO sem obra associada");

  const { data: ambientesData, error: ambErr } = await supabase
    .from("obra_ambientes")
    .select("*")
    .eq("obra_id", obraRaw.id)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (ambErr) throw new Error(`Falha ao carregar ambientes: ${ambErr.message}`);

  const rdo: RdoCompleto = {
    ...(data as unknown as Rdo),
    supervisor: (r.supervisor as RdoCompleto["supervisor"]) ?? null,
    fotos: ((r.fotos as RdoCompleto["fotos"]) ?? []).slice().sort((a, b) => a.ordem - b.ordem),
    pendencias: ((r.pendencias as RdoPendencia[]) ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem),
    pontos_atencao: ((r.pontos_atencao as RdoPontoAtencao[]) ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem),
    equipe_nue: ((r.equipe_nue as RdoEquipeNue[]) ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem),
    terceiros: ((r.terceiros as RdoTerceiro[]) ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem),
  };

  const obra: ObraComSupervisor = {
    ...(obraRaw as ObraComSupervisor),
    supervisor: obraRaw.supervisor ?? null,
    ambientes: ambientesData ?? [],
  };

  return { rdo, obra };
}

/* ---------------- Conversões ---------------- */

export function rdoParaForm(rdo: RdoCompleto): FormRdoState {
  return {
    data: rdo.data,
    hora_chegada: (rdo.hora_chegada ?? "").slice(0, 5),
    hora_saida: (rdo.hora_saida ?? "").slice(0, 5),
    tipo_visita: rdo.tipo_visita,
    condicao_local: rdo.condicao_local,
    registros: rdo.registros ?? "",
    proximos_passos: rdo.proximos_passos ?? "",
    equipe_nue: rdo.equipe_nue.map((e) => ({ nome: e.nome, funcao: e.funcao ?? "" })),
    terceiros: rdo.terceiros.map((t) => ({ nome: t.nome, papel: t.papel ?? "" })),
    pendencias: rdo.pendencias.map((p) => ({
      descricao: p.descricao,
      prioridade: p.prioridade,
    })),
    pontos_atencao: rdo.pontos_atencao.map((p) => ({ descricao: p.descricao })),
  };
}

/* ---------------- Persistência ---------------- */

/** Cria o RDO inicial em rascunho. Retorna o id gerado. */
export async function criarRdoInicial(args: {
  obra_id: string;
  supervisor_id: string | null;
  form: FormRdoState;
}): Promise<string> {
  if (!args.form.tipo_visita || !args.form.condicao_local) {
    throw new Error("Campos obrigatórios mínimos não preenchidos");
  }
  const id = await gerarProximoIdRdo();
  const { error } = await supabase.from("rdos").insert({
    id,
    obra_id: args.obra_id,
    supervisor_id: args.supervisor_id,
    data: args.form.data,
    hora_chegada: args.form.hora_chegada,
    hora_saida: args.form.hora_saida || null,
    tipo_visita: args.form.tipo_visita,
    condicao_local: args.form.condicao_local,
    registros: args.form.registros,
    proximos_passos: args.form.proximos_passos,
    finalizado: false,
  });
  if (error) throw new Error(`Falha ao criar RDO: ${error.message}`);
  return id;
}

/** Atualiza os campos escalares do RDO. */
export async function atualizarRdoCampos(args: {
  id: string;
  form: FormRdoState;
  finalizado?: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from("rdos")
    .update({
      data: args.form.data,
      hora_chegada: args.form.hora_chegada,
      hora_saida: args.form.hora_saida || null,
      tipo_visita: args.form.tipo_visita || undefined,
      condicao_local: args.form.condicao_local || undefined,
      registros: args.form.registros,
      proximos_passos: args.form.proximos_passos,
      ...(args.finalizado !== undefined ? { finalizado: args.finalizado } : {}),
    })
    .eq("id", args.id);
  if (error) throw new Error(`Falha ao atualizar RDO: ${error.message}`);
}

/** Substitui (delete + insert) os filhos da seção dada. */
export async function sincronizarFilhos(args: {
  rdo_id: string;
  equipe_nue: EquipeItem[];
  terceiros: TerceiroItem[];
  pendencias: PendenciaItem[];
  pontos_atencao: PontoAtencaoItem[];
}): Promise<void> {
  const { rdo_id } = args;

  const equipeFiltrada = args.equipe_nue.filter((e) => e.nome.trim().length > 0);
  const terceirosFiltrados = args.terceiros.filter((t) => t.nome.trim().length > 0);
  const pendenciasFiltradas = args.pendencias.filter(
    (p) => p.descricao.trim().length > 0,
  );
  const pontosFiltrados = args.pontos_atencao.filter(
    (p) => p.descricao.trim().length > 0,
  );

  const delResults = await Promise.all([
    supabase.from("rdo_equipe_nue").delete().eq("rdo_id", rdo_id),
    supabase.from("rdo_terceiros").delete().eq("rdo_id", rdo_id),
    supabase.from("rdo_pendencias").delete().eq("rdo_id", rdo_id),
    supabase.from("rdo_pontos_atencao").delete().eq("rdo_id", rdo_id),
  ]);
  for (const r of delResults) {
    if (r.error) throw new Error(`Falha ao limpar filhos: ${r.error.message}`);
  }

  if (equipeFiltrada.length > 0) {
    const { error: e } = await supabase.from("rdo_equipe_nue").insert(
      equipeFiltrada.map((e, i) => ({
        rdo_id,
        nome: e.nome.trim(),
        funcao: e.funcao.trim(),
        ordem: i,
      })),
    );
    if (e) throw new Error(`Falha ao salvar equipe: ${e.message}`);
  }
  if (terceirosFiltrados.length > 0) {
    const { error: e } = await supabase.from("rdo_terceiros").insert(
      terceirosFiltrados.map((t, i) => ({
        rdo_id,
        nome: t.nome.trim(),
        papel: t.papel.trim(),
        ordem: i,
      })),
    );
    if (e) throw new Error(`Falha ao salvar terceiros: ${e.message}`);
  }
  if (pendenciasFiltradas.length > 0) {
    const { error: e } = await supabase.from("rdo_pendencias").insert(
      pendenciasFiltradas.map((p, i) => ({
        rdo_id,
        descricao: p.descricao.trim(),
        prioridade: p.prioridade,
        ordem: i,
      })),
    );
    if (e) throw new Error(`Falha ao salvar pendências: ${e.message}`);
  }
  if (pontosFiltrados.length > 0) {
    const { error: e } = await supabase.from("rdo_pontos_atencao").insert(
      pontosFiltrados.map((p, i) => ({
        rdo_id,
        descricao: p.descricao.trim(),
        ordem: i,
      })),
    );
    if (e) throw new Error(`Falha ao salvar pontos de atenção: ${e.message}`);
  }
}

/** Cria snapshot do RDO + filhos atual e insere em rdo_versoes. */
export async function criarVersaoSnapshot(args: {
  rdo_id: string;
  nota?: string;
}): Promise<void> {
  const { data: rdo, error } = await supabase
    .from("rdos")
    .select(
      `*,
       fotos:rdo_fotos(*),
       pendencias:rdo_pendencias(*),
       pontos_atencao:rdo_pontos_atencao(*),
       equipe_nue:rdo_equipe_nue(*),
       terceiros:rdo_terceiros(*)`
    )
    .eq("id", args.rdo_id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao snapshotar RDO: ${error.message}`);
  if (!rdo) throw new RdoNaoEncontradoError(args.rdo_id);

  const { error: insErr } = await supabase.from("rdo_versoes").insert({
    rdo_id: args.rdo_id,
    snapshot: rdo as unknown as Json,
    nota_edicao: args.nota ?? "",
  });
  if (insErr) throw new Error(`Falha ao registrar versão: ${insErr.message}`);
}

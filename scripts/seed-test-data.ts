/**
 * Seed de dados de TESTE pro Dashboard.
 *
 * Insere 5 obras com prefixo "TESTE -", ambientes, RDOs distribuídos
 * pelos últimos 14 dias e algumas pendências de prioridade alta abertas.
 *
 * Pra remover depois:
 *   delete from rdo_pendencias where rdo_id in (select id from rdos where obra_id in (select id from obras where nome_cliente like 'TESTE -%'));
 *   delete from rdo_observacoes_ambiente where rdo_id in (select id from rdos where obra_id in (select id from obras where nome_cliente like 'TESTE -%'));
 *   delete from rdo_pontos_atencao where rdo_id in (select id from rdos where obra_id in (select id from obras where nome_cliente like 'TESTE -%'));
 *   delete from rdo_fotos where rdo_id in (select id from rdos where obra_id in (select id from obras where nome_cliente like 'TESTE -%'));
 *   delete from rdos where obra_id in (select id from obras where nome_cliente like 'TESTE -%');
 *   delete from obra_ambientes where obra_id in (select id from obras where nome_cliente like 'TESTE -%');
 *   delete from obras where nome_cliente like 'TESTE -%';
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Carrega .env manualmente (sem depender de dotenv)
const envPath = resolve(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) {
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[m[1].trim()] = value;
  }
}

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são obrigatórias");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function gerarIdObra(): Promise<string> {
  const { data, error } = await supabase.rpc("gerar_proximo_id_obra");
  if (error) throw new Error(`gerar_proximo_id_obra: ${error.message}`);
  return data as string;
}

async function gerarIdRdo(): Promise<string> {
  const { data, error } = await supabase.rpc("gerar_proximo_id_rdo");
  if (error) throw new Error(`gerar_proximo_id_rdo: ${error.message}`);
  return data as string;
}

type Supervisor = { id: string; nome: string; iniciais: string };

async function fetchSupervisores(): Promise<Supervisor[]> {
  const { data, error } = await supabase
    .from("supervisores")
    .select("id, nome, iniciais")
    .eq("ativo", true);
  if (error) throw new Error(`fetchSupervisores: ${error.message}`);
  return (data ?? []) as Supervisor[];
}

async function ensureSupervisores(): Promise<Supervisor[]> {
  const existentes = await fetchSupervisores();
  if (existentes.length > 0) return existentes;

  console.log("Tabela supervisores vazia — inserindo os 4 supervisores padrão...");
  const padrao = [
    { nome: "Gino Colombi", iniciais: "GC" },
    { nome: "Gustavo", iniciais: "GU" },
    { nome: "Marcone", iniciais: "MA" },
    { nome: "Mauricio", iniciais: "MU" },
  ];
  const { data, error } = await supabase
    .from("supervisores")
    .insert(padrao.map((p) => ({ ...p, ativo: true })))
    .select("id, nome, iniciais");
  if (error) throw new Error(`insert supervisores: ${error.message}`);
  return (data ?? []) as Supervisor[];
}

type ObraTeste = {
  cliente: string;
  endereco: string;
  status: "ativa" | "pausada" | "concluida";
  ambientes: string[];
  rdosOffsetsDias: number[]; // dias atrás (0 = hoje, 14 = 14 dias atrás)
  pendenciasAltas: { texto: string; offsetDias: number; ambiente?: string }[];
};

const PLANO: ObraTeste[] = [
  {
    cliente: "TESTE - Hurquiza Silva",
    endereco: "Rua das Flores, 123 - Boa Viagem, Recife",
    status: "ativa",
    ambientes: ["Cozinha", "Banheiro suíte"],
    rdosOffsetsDias: [0, 2, 5, 9],
    pendenciasAltas: [
      { texto: "Falta cantoneira de inox no rodapé da bancada", offsetDias: 0, ambiente: "Cozinha" },
      { texto: "Pia chegou com risco visível, solicitar troca antes da instalação", offsetDias: 2 },
    ],
  },
  {
    cliente: "TESTE - Djaci Falcão",
    endereco: "Av. Conselheiro Aguiar, 4500 - Boa Viagem, Recife",
    status: "ativa",
    ambientes: ["Cozinha", "Lavabo", "Área gourmet"],
    rdosOffsetsDias: [1, 4, 7],
    pendenciasAltas: [
      { texto: "Cliente solicitou mudança de cor da pedra após corte iniciado — alinhar urgente", offsetDias: 1 },
    ],
  },
  {
    cliente: "TESTE - Maria Eduarda Lima",
    endereco: "Rua Padre Carapuceiro, 1200 - Casa Forte, Recife",
    status: "ativa",
    ambientes: ["Cozinha"],
    rdosOffsetsDias: [3, 6],
    pendenciasAltas: [],
  },
  {
    cliente: "TESTE - João Pedro Andrade",
    endereco: "Rua Setúbal, 999 - Boa Viagem, Recife",
    status: "ativa",
    ambientes: ["Cozinha", "Banheiro social"],
    rdosOffsetsDias: [11], // último RDO há 11 dias = aparece em "obras sem registro 7+ dias"
    pendenciasAltas: [
      { texto: "Tomada elétrica embaixo da bancada não foi prevista no projeto", offsetDias: 11, ambiente: "Cozinha" },
    ],
  },
  {
    cliente: "TESTE - Construtora Aurora",
    endereco: "Rua do Espinheiro, 50 - Espinheiro, Recife",
    status: "ativa",
    ambientes: [],
    rdosOffsetsDias: [], // sem nenhum RDO = aparece em "obras sem registro"
    pendenciasAltas: [],
  },
];

async function seed() {
  console.log("Buscando supervisores...");
  const supervisores = await ensureSupervisores();
  if (supervisores.length === 0) {
    throw new Error("Falha ao garantir supervisores.");
  }
  console.log(`  ${supervisores.length} supervisores ativos: ${supervisores.map((s) => s.iniciais).join(", ")}`);

  for (const plano of PLANO) {
    console.log(`\nCriando obra: ${plano.cliente}`);
    const obraId = await gerarIdObra();
    const supervisorPrincipal = supervisores[Math.floor(Math.random() * supervisores.length)];

    const { error: errObra } = await supabase.from("obras").insert({
      id: obraId,
      nome_cliente: plano.cliente,
      endereco: plano.endereco,
      status: plano.status,
      supervisor_id: supervisorPrincipal.id,
    });
    if (errObra) throw new Error(`insert obra ${obraId}: ${errObra.message}`);
    console.log(`  ID: ${obraId} | supervisor: ${supervisorPrincipal.iniciais}`);

    // Ambientes
    const ambientesPorNome = new Map<string, string>();
    for (let i = 0; i < plano.ambientes.length; i++) {
      const nome = plano.ambientes[i];
      const { data: ambData, error: errAmb } = await supabase
        .from("obra_ambientes")
        .insert({ obra_id: obraId, nome, ordem: i + 1, ativo: true })
        .select("id, nome")
        .single();
      if (errAmb) throw new Error(`insert ambiente ${nome}: ${errAmb.message}`);
      ambientesPorNome.set(nome, ambData!.id);
    }
    if (plano.ambientes.length > 0) {
      console.log(`  ${plano.ambientes.length} ambientes`);
    }

    // RDOs
    const rdoIds: { id: string; offsetDias: number }[] = [];
    for (const offset of plano.rdosOffsetsDias) {
      const rdoId = await gerarIdRdo();
      const sup = supervisores[Math.floor(Math.random() * supervisores.length)];
      const tipo = Math.random() > 0.5 ? "supervisao_montagem" : "medicao";
      const condicao = Math.random() > 0.7 ? "parcialmente_praticavel" : "praticavel";
      const horaChegada = `${8 + Math.floor(Math.random() * 4)}:${Math.random() > 0.5 ? "00" : "30"}:00`;

      const { error: errRdo } = await supabase.from("rdos").insert({
        id: rdoId,
        obra_id: obraId,
        data: isoDaysAgo(offset),
        hora_chegada: horaChegada,
        hora_saida: null,
        supervisor_id: sup.id,
        tipo_visita: tipo,
        condicao_local: condicao,
        registros: `Registro de teste — visita do dia ${isoDaysAgo(offset)}.`,
        proximos_passos: "",
        finalizado: true,
      });
      if (errRdo) throw new Error(`insert rdo ${rdoId}: ${errRdo.message}`);
      rdoIds.push({ id: rdoId, offsetDias: offset });
    }
    if (rdoIds.length > 0) {
      console.log(`  ${rdoIds.length} RDOs criados`);
    }

    // Pendências de prioridade alta
    for (const pend of plano.pendenciasAltas) {
      const rdo = rdoIds.find((r) => r.offsetDias === pend.offsetDias);
      if (!rdo) continue;
      const ambienteId = pend.ambiente ? ambientesPorNome.get(pend.ambiente) ?? null : null;
      const { error: errPend } = await supabase.from("rdo_pendencias").insert({
        rdo_id: rdo.id,
        descricao: pend.texto,
        prioridade: "alta",
        ambiente_id: ambienteId,
        ordem: 1,
      });
      if (errPend) throw new Error(`insert pendencia: ${errPend.message}`);
    }
    if (plano.pendenciasAltas.length > 0) {
      console.log(`  ${plano.pendenciasAltas.length} pendências críticas`);
    }
  }

  console.log("\nSeed concluído.");
}

seed().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});

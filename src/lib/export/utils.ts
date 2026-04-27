import type { RdoCompleto, ObraComSupervisor } from "@/lib/diario";

export type EscopoExport =
  | { tipo: "diario"; obra: ObraComSupervisor; rdos: RdoCompleto[] }
  | { tipo: "rdo"; obra: ObraComSupervisor; rdo: RdoCompleto };

export function sanitize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function hojeRecifeArquivo(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

export function nowRecife(): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Recife",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date());
}

export function formatDataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatHora(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h}h${m}`;
}

export function formatIntervalo(chegada: string, saida: string | null): string {
  const c = formatHora(chegada);
  if (!saida) return c;
  return `${c} até ${formatHora(saida)}`;
}

export const TIPO_VISITA_LABEL: Record<string, string> = {
  medicao: "Medição",
  supervisao_montagem: "Supervisão de montagem",
};
export const CONDICAO_LABEL: Record<string, string> = {
  praticavel: "Praticável",
  parcialmente_praticavel: "Parcialmente praticável",
  impraticavel: "Impraticável",
};
export const PRIORIDADE_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export function rdosOrdenadosDescendente(rdos: RdoCompleto[]): RdoCompleto[] {
  return [...rdos].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return (a.hora_chegada ?? "") < (b.hora_chegada ?? "") ? 1 : -1;
  });
}

export function periodoTexto(rdos: RdoCompleto[]): string {
  if (rdos.length === 0) return "—";
  const datas = rdos.map((r) => r.data).sort();
  const p = formatDataBR(datas[0]);
  const u = formatDataBR(datas[datas.length - 1]);
  return p === u ? p : `${p} – ${u}`;
}

export function totalFotos(rdos: RdoCompleto[]): number {
  return rdos.reduce((acc, r) => acc + r.fotos.length, 0);
}

/** Baixa imagem como dataURL (necessário pra react-pdf). */
export async function urlToDataURL(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("read fail"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export type FotoComData = {
  id: string;
  url: string;
  legenda: string;
  ambiente_id: string | null;
  ambiente_nome: string | null;
  ambiente_ordem: number;
  data?: string | null;
};

export function fotosDoRdoComData(rdo: RdoCompleto): FotoComData[] {
  return rdo.fotos.map((f) => ({
    id: f.id,
    url: f.url,
    legenda: f.legenda ?? "",
    ambiente_id: f.ambiente_id,
    ambiente_nome: f.ambiente?.nome ?? null,
    ambiente_ordem: f.ambiente?.ordem ?? 999999,
  }));
}

/** Pré-carrega todas as fotos (e assinaturas) usadas nos RDOs como dataURL. Retorna um Map url -> dataURL. */
export async function preloadImagens(urls: string[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(urls.filter(Boolean)));
  const out = new Map<string, string>();
  const results = await Promise.all(unicos.map((u) => urlToDataURL(u)));
  unicos.forEach((u, i) => {
    const d = results[i];
    if (d) out.set(u, d);
  });
  return out;
}

export type GrupoAmbiente = {
  id: string;
  nome: string;
  ordem: number;
  obs: string;
  fotos: FotoComData[];
  pendencias: RdoCompleto["pendencias"];
  pontos: RdoCompleto["pontos_atencao"];
};

export function agruparPorAmbiente(rdo: RdoCompleto): {
  grupos: GrupoAmbiente[];
  fotosSemAmbiente: FotoComData[];
  pendGerais: RdoCompleto["pendencias"];
  pontosGerais: RdoCompleto["pontos_atencao"];
} {
  const mapa = new Map<string, GrupoAmbiente>();
  const get = (id: string, nome: string, ordem: number) => {
    let g = mapa.get(id);
    if (!g) {
      g = { id, nome, ordem, obs: "", fotos: [], pendencias: [], pontos: [] };
      mapa.set(id, g);
    }
    return g;
  };
  for (const f of fotosDoRdoComData(rdo)) {
    if (f.ambiente_id) {
      const g = get(f.ambiente_id, f.ambiente_nome ?? "Ambiente removido", f.ambiente_ordem);
      g.fotos.push(f);
    }
  }
  for (const p of rdo.pendencias) {
    if (p.ambiente_id) {
      const g = get(
        p.ambiente_id,
        p.ambiente?.nome ?? "Ambiente removido",
        p.ambiente?.ordem ?? 999999,
      );
      g.pendencias.push(p);
    }
  }
  for (const p of rdo.pontos_atencao) {
    if (p.ambiente_id) {
      const g = get(
        p.ambiente_id,
        p.ambiente?.nome ?? "Ambiente removido",
        p.ambiente?.ordem ?? 999999,
      );
      g.pontos.push(p);
    }
  }
  for (const o of rdo.observacoes_ambiente) {
    if (o.ambiente_id && (o.texto ?? "").trim() !== "") {
      const g = get(o.ambiente_id, "Ambiente", 999999);
      g.obs = o.texto;
    }
  }
  const grupos = Array.from(mapa.values()).sort((a, b) => a.ordem - b.ordem);
  const fotosSemAmbiente = fotosDoRdoComData(rdo).filter((f) => f.ambiente_id == null);
  const pendGerais = rdo.pendencias.filter((p) => p.ambiente_id == null);
  const pontosGerais = rdo.pontos_atencao.filter((p) => p.ambiente_id == null);
  return { grupos, fotosSemAmbiente, pendGerais, pontosGerais };
}

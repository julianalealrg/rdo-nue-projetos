import type { ReactNode } from "react";
import type { ObraComSupervisor, RdoCompleto } from "@/lib/diario";
import { formatarDataCurta, formatarIntervaloHorario } from "@/lib/datas";
import logoUrl from "@/assets/logo-nue-projetos.svg?url";

type Praticabilidade = "praticavel" | "parcial" | "impraticavel";

const PRATIC_LABEL: Record<Praticabilidade, string> = {
  praticavel: "Medição praticável",
  parcial: "Medição parcialmente praticável",
  impraticavel: "Medição impraticável",
};

export function condicaoToPraticabilidade(c: RdoCompleto["condicao_local"]): Praticabilidade {
  if (c === "praticavel") return "praticavel";
  if (c === "parcialmente_praticavel") return "parcial";
  return "impraticavel";
}

export function PraticDot({ kind }: { kind: Praticabilidade }) {
  return <span className={`pratic-dot pratic-${kind}`} />;
}

export function praticLabel(rdo: RdoCompleto): string {
  return PRATIC_LABEL[condicaoToPraticabilidade(rdo.condicao_local)];
}

export function PageHeader({
  obra,
  periodo,
}: {
  obra: ObraComSupervisor;
  periodo: string;
}) {
  return (
    <header className="ph">
      <div className="ph-mark">
        <span className="ph-brand">NUE Projetos</span>
        <span className="ph-doctype">Diário de obra · {obra.id}</span>
      </div>
      <div className="ph-meta">
        <div>
          <span className="ph-meta-id">{obra.id}</span>
        </div>
        <div>Período {periodo}</div>
      </div>
    </header>
  );
}

export function PageFooter({
  pageNum,
  totalPages,
  obra,
  exportadoEm,
}: {
  pageNum: number;
  totalPages: number;
  obra: ObraComSupervisor;
  exportadoEm: string;
}) {
  return (
    <footer className="pf">
      <div>
        Diário {obra.id} · Cliente {obra.nome_cliente}
      </div>
      <div className="pf-page">
        <b>{String(pageNum).padStart(2, "0")}</b> /{" "}
        {String(totalPages).padStart(2, "0")}
      </div>
      <div>Exportado em {exportadoEm}</div>
    </footer>
  );
}

export type CoverData = {
  obra: ObraComSupervisor;
  rdos: RdoCompleto[];
  periodo: string;
};

function totalFotosDoc(rdos: RdoCompleto[]): number {
  return rdos.reduce((s, r) => s + r.fotos.length, 0);
}

function totalPendenciasDoc(rdos: RdoCompleto[]): number {
  return rdos.reduce((s, r) => s + r.pendencias.length, 0);
}

function totalAmbientesTrabalhados(rdos: RdoCompleto[]): number {
  let total = 0;
  for (const rdo of rdos) {
    const ids = new Set<string>();
    rdo.fotos.forEach((f) => f.ambiente_id && ids.add(f.ambiente_id));
    rdo.pendencias.forEach((p) => p.ambiente_id && ids.add(p.ambiente_id));
    rdo.pontos_atencao.forEach((p) => p.ambiente_id && ids.add(p.ambiente_id));
    rdo.observacoes_ambiente.forEach(
      (o) => o.ambiente_id && (o.texto ?? "").trim() && ids.add(o.ambiente_id),
    );
    total += ids.size;
  }
  return total;
}

function ambientesNomesDoRdo(rdo: RdoCompleto): string[] {
  const map = new Map<string, { nome: string; ordem: number }>();
  for (const f of rdo.fotos)
    if (f.ambiente_id && f.ambiente)
      map.set(f.ambiente_id, { nome: f.ambiente.nome, ordem: f.ambiente.ordem });
  for (const p of rdo.pendencias)
    if (p.ambiente_id && p.ambiente)
      map.set(p.ambiente_id, { nome: p.ambiente.nome, ordem: p.ambiente.ordem });
  for (const p of rdo.pontos_atencao)
    if (p.ambiente_id && p.ambiente)
      map.set(p.ambiente_id, { nome: p.ambiente.nome, ordem: p.ambiente.ordem });
  return Array.from(map.values())
    .sort((a, b) => a.ordem - b.ordem)
    .map((a) => a.nome);
}

export function Cover({ obra, rdos, periodo }: CoverData) {
  const totalRdos = rdos.length;
  const totalAmbs = totalAmbientesTrabalhados(rdos);
  const totalFotos = totalFotosDoc(rdos);
  const totalPend = totalPendenciasDoc(rdos);

  return (
    <>
      <div style={{ marginBottom: "8mm" }}>
        <Logo />
      </div>
      <div className="cover-eyebrow">
        Sistema operacional NUE · Diário de obra
      </div>
      <h1 className="cover-title">{obra.nome_cliente}</h1>
      <div className="cover-sub">
        Consolidação dos relatórios diários de obra (RDO) registrados em{" "}
        <b>{periodo}</b> para o cliente <b>{obra.nome_cliente}</b>.
      </div>

      <div className="cover-grid">
        <div className="cell">
          <span className="lbl">Cliente</span>
          <span className="val">{obra.nome_cliente}</span>
        </div>
        <div className="cell">
          <span className="lbl">Obra</span>
          <span className="val mono">{obra.id}</span>
        </div>
        <div className="cell">
          <span className="lbl">Endereço</span>
          <span className="val">{obra.endereco}</span>
        </div>
        <div className="cell">
          <span className="lbl">Status</span>
          <span className="val">{obra.status}</span>
        </div>
        <div className="cell">
          <span className="lbl">Supervisor</span>
          <span className="val">{obra.supervisor?.nome ?? "—"}</span>
        </div>
        <div className="cell">
          <span className="lbl">Período</span>
          <span className="val mono">{periodo}</span>
        </div>
      </div>

      <div className="kpis">
        <Kpi
          label="RDOs"
          value={String(totalRdos).padStart(2, "0")}
          hint="no período selecionado"
        />
        <Kpi
          label="Ambientes"
          value={String(totalAmbs).padStart(2, "0")}
          hint="trabalhados"
        />
        <Kpi
          label="Fotos"
          value={String(totalFotos).padStart(2, "0")}
          hint="anexadas"
        />
        <Kpi
          label="Pendências"
          value={String(totalPend).padStart(2, "0")}
          hint="registradas"
        />
      </div>

      <div className="toc">
        <div className="toc-head">Índice de relatórios</div>
        {rdos.map((rdo) => {
          const ambs = ambientesNomesDoRdo(rdo);
          const pratic = condicaoToPraticabilidade(rdo.condicao_local);
          const praticShort =
            pratic === "praticavel"
              ? "Praticável"
              : pratic === "parcial"
                ? "Parc. praticável"
                : "Impraticável";
          return (
            <div key={rdo.id} className="toc-row">
              <span className="toc-id">{rdo.id}</span>
              <span>{ambs.length > 0 ? ambs.join(" · ") : "Sem ambientes"}</span>
              <span className="toc-pratic">
                <PraticDot kind={pratic} /> {praticShort}
              </span>
              <span className="toc-time">
                {formatarDataCurta(rdo.data)}{" "}
                {formatarIntervaloHorario(rdo.hora_chegada, rdo.hora_saida).split(
                  " ",
                )[0]}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="kpi">
      <span className="kpi-lbl">{label}</span>
      <span className="kpi-val">{value}</span>
      <span className="kpi-hint">{hint}</span>
    </div>
  );
}

function Logo() {
  return (
    <img
      src={logoUrl}
      alt="NUE Projetos"
      style={{ height: "40px", width: "auto", display: "block" }}
    />
  );
}

export function Sheet({
  children,
  showFooter,
  pageNum,
  totalPages,
  obra,
  periodo,
  exportadoEm,
}: {
  children: ReactNode;
  showFooter: boolean;
  pageNum: number;
  totalPages: number;
  obra: ObraComSupervisor;
  periodo: string;
  exportadoEm: string;
}) {
  return (
    <section className="print-sheet">
      <PageHeader obra={obra} periodo={periodo} />
      <div className="sheet-body">{children}</div>
      {showFooter && (
        <PageFooter
          pageNum={pageNum}
          totalPages={totalPages}
          obra={obra}
          exportadoEm={exportadoEm}
        />
      )}
    </section>
  );
}

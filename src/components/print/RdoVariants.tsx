import type {
  RdoCompleto,
  RdoFoto,
  RdoPendencia,
  RdoPontoAtencao,
} from "@/lib/diario";
import {
  formatarDataCurta,
  formatarIntervaloHorario,
} from "@/lib/datas";
import { PraticDot, condicaoToPraticabilidade, praticLabel } from "./PageChrome";

type GrupoAmbiente = {
  id: string;
  nome: string;
  ordem: number;
  obs: string;
  fotos: RdoFoto[];
  pendencias: RdoPendencia[];
  pontos: RdoPontoAtencao[];
};

function agruparPorAmbiente(rdo: RdoCompleto): {
  grupos: GrupoAmbiente[];
  fotosSemAmb: RdoFoto[];
  pendGerais: RdoPendencia[];
  pontosGerais: RdoPontoAtencao[];
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

  const nomeLookup = new Map<string, { nome: string; ordem: number }>();
  for (const f of rdo.fotos)
    if (f.ambiente_id && f.ambiente)
      nomeLookup.set(f.ambiente_id, {
        nome: f.ambiente.nome,
        ordem: f.ambiente.ordem,
      });
  for (const p of rdo.pendencias)
    if (p.ambiente_id && p.ambiente)
      nomeLookup.set(p.ambiente_id, {
        nome: p.ambiente.nome,
        ordem: p.ambiente.ordem,
      });
  for (const p of rdo.pontos_atencao)
    if (p.ambiente_id && p.ambiente)
      nomeLookup.set(p.ambiente_id, {
        nome: p.ambiente.nome,
        ordem: p.ambiente.ordem,
      });

  for (const f of rdo.fotos) {
    if (f.ambiente_id) {
      const lk = nomeLookup.get(f.ambiente_id) ?? { nome: f.ambiente?.nome ?? "Ambiente removido", ordem: 999999 };
      get(f.ambiente_id, lk.nome, lk.ordem).fotos.push(f);
    }
  }
  for (const p of rdo.pendencias) {
    if (p.ambiente_id) {
      const lk = nomeLookup.get(p.ambiente_id) ?? { nome: p.ambiente?.nome ?? "Ambiente removido", ordem: 999999 };
      get(p.ambiente_id, lk.nome, lk.ordem).pendencias.push(p);
    }
  }
  for (const p of rdo.pontos_atencao) {
    if (p.ambiente_id) {
      const lk = nomeLookup.get(p.ambiente_id) ?? { nome: p.ambiente?.nome ?? "Ambiente removido", ordem: 999999 };
      get(p.ambiente_id, lk.nome, lk.ordem).pontos.push(p);
    }
  }
  for (const o of rdo.observacoes_ambiente) {
    if (o.ambiente_id && (o.texto ?? "").trim() !== "") {
      const lk = nomeLookup.get(o.ambiente_id) ?? { nome: "Ambiente removido", ordem: 999999 };
      get(o.ambiente_id, lk.nome, lk.ordem).obs = o.texto;
    }
  }

  const grupos = Array.from(mapa.values()).sort((a, b) => a.ordem - b.ordem);
  const fotosSemAmb = rdo.fotos.filter((f) => !f.ambiente_id);
  const pendGerais = rdo.pendencias.filter((p) => !p.ambiente_id);
  const pontosGerais = rdo.pontos_atencao.filter((p) => !p.ambiente_id);
  return { grupos, fotosSemAmb, pendGerais, pontosGerais };
}

function PhotoTile({ foto, tag }: { foto: RdoFoto; tag?: string }) {
  return (
    <div className="amb-photo">
      <img src={foto.url} alt={foto.legenda || ""} />
      {tag && <span className="ph-tag">{tag}</span>}
    </div>
  );
}

function AmbienteBlock({ grupo }: { grupo: GrupoAmbiente }) {
  const fotosSlice = grupo.fotos.slice(0, 6);
  return (
    <div className="amb">
      <div className="amb-head">
        <span className="amb-name">{grupo.nome}</span>
        <span className="amb-fotos">
          {grupo.fotos.length > 0
            ? `${String(grupo.fotos.length).padStart(2, "0")} ${grupo.fotos.length === 1 ? "foto" : "fotos"}`
            : "sem fotos"}
        </span>
      </div>
      {grupo.obs.trim() !== "" && <div className="amb-body">{grupo.obs}</div>}
      {fotosSlice.length > 0 && (
        <div className="amb-photos">
          {fotosSlice.map((f, i) => (
            <PhotoTile
              key={f.id}
              foto={f}
              tag={f.legenda || `${grupo.nome.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, "0")}`}
            />
          ))}
        </div>
      )}
      {grupo.pendencias.length > 0 && (
        <div className="amb-pend-list">
          <span className="lbl">Pendências</span>
          {grupo.pendencias.map((p) => (
            <div key={p.id}>
              <span style={{ fontWeight: 500 }}>
                {p.prioridade.toUpperCase()}
              </span>{" "}
              · {p.descricao}
            </div>
          ))}
        </div>
      )}
      {grupo.pontos.length > 0 && (
        <div className="amb-aten-list">
          <span className="lbl">Pontos de atenção</span>
          {grupo.pontos.map((p) => (
            <div key={p.id}>! {p.descricao}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function PendListGerais({ pendencias }: { pendencias: RdoPendencia[] }) {
  if (pendencias.length === 0) return null;
  return (
    <section>
      <h6 className="sec-h">Pendências gerais</h6>
      <div className="list-pend">
        {pendencias.map((p) => (
          <div key={p.id} className="pend">
            <div>{p.descricao}</div>
            <div className={`pend-prio ${p.prioridade}`}>{p.prioridade}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PontosListGerais({ pontos }: { pontos: RdoPontoAtencao[] }) {
  if (pontos.length === 0) return null;
  return (
    <section>
      <h6 className="sec-h">Pontos de atenção gerais</h6>
      <div className="list-aten">
        {pontos.map((p) => (
          <div key={p.id} className="aten">
            <span className="aten-mark">!</span>
            <span>{p.descricao}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FotosSemAmbBlock({ fotos }: { fotos: RdoFoto[] }) {
  if (fotos.length === 0) return null;
  const slice = fotos.slice(0, 6);
  return (
    <section>
      <h6 className="sec-h">Fotos sem ambiente</h6>
      <div className="amb-photos" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {slice.map((f, i) => (
          <PhotoTile key={f.id} foto={f} tag={f.legenda || `IMG-${i + 1}`} />
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   V1 — Card denso vertical (cliente)
   ============================================================ */
export function RDOv1({ rdo }: { rdo: RdoCompleto }) {
  const { grupos, fotosSemAmb, pendGerais, pontosGerais } = agruparPorAmbiente(rdo);
  const totFotos = rdo.fotos.length;
  const totAmbs = grupos.length;
  return (
    <article className="rdo">
      <header className="rdo-head">
        <div>
          <div className="rdo-eyebrow">Relatório diário de obra</div>
          <div className="rdo-id">{rdo.id}</div>
        </div>
        <div className="rdo-meta">
          <div>
            <b>{formatarDataCurta(rdo.data)}</b>
          </div>
          <div>{formatarIntervaloHorario(rdo.hora_chegada, rdo.hora_saida)}</div>
        </div>
      </header>

      <div className="rdo-status">
        <PraticDot kind={condicaoToPraticabilidade(rdo.condicao_local)} />
        <span className="pratic-label">{praticLabel(rdo)}</span>
        <span className="pratic-sub">
          {totAmbs} ambientes · {totFotos} fotos
        </span>
      </div>

      {rdo.registros.trim() !== "" && (
        <section>
          <h6 className="sec-h">Registros do dia</h6>
          <div className="sec-body">{rdo.registros}</div>
        </section>
      )}

      {rdo.proximos_passos.trim() !== "" && (
        <section>
          <h6 className="sec-h">Próximos passos</h6>
          <div className="sec-body">{rdo.proximos_passos}</div>
        </section>
      )}

      {(rdo.equipe_nue.length > 0 || rdo.terceiros.length > 0) && (
        <section>
          <h6 className="sec-h">Equipe presente</h6>
          <div className="sec-body" style={{ fontSize: "10pt" }}>
            {rdo.equipe_nue.length > 0 && (
              <div>
                <b>NUE:</b>{" "}
                {rdo.equipe_nue
                  .map((e) => (e.funcao ? `${e.nome} (${e.funcao})` : e.nome))
                  .join(", ")}
              </div>
            )}
            {rdo.terceiros.length > 0 && (
              <div style={{ marginTop: "1.5mm" }}>
                <b>Terceiros:</b>{" "}
                {rdo.terceiros
                  .map((t) => (t.papel ? `${t.nome} (${t.papel})` : t.nome))
                  .join(", ")}
              </div>
            )}
          </div>
        </section>
      )}

      <PendListGerais pendencias={pendGerais} />
      <PontosListGerais pontos={pontosGerais} />

      {grupos.length > 0 && (
        <section>
          <h6 className="sec-h">Ambientes · {grupos.length}</h6>
          <div className="amb-grid">
            {grupos.map((g) => (
              <AmbienteBlock key={g.id} grupo={g} />
            ))}
          </div>
        </section>
      )}

      <FotosSemAmbBlock fotos={fotosSemAmb} />

      <div className="sig">
        <div className="sig-info">
          Assinada por{" "}
          <span className="sig-name">{rdo.supervisor?.nome ?? "—"}</span>
        </div>
        {rdo.assinatura_url && (
          <img className="sig-img" src={rdo.assinatura_url} alt="Assinatura" />
        )}
      </div>
    </article>
  );
}

/* ============================================================
   V3 — Formulário técnico
   ============================================================ */
export function RDOv3({ rdo }: { rdo: RdoCompleto }) {
  const { grupos, fotosSemAmb, pendGerais, pontosGerais } = agruparPorAmbiente(rdo);
  const totFotos = rdo.fotos.length;
  const pratic = condicaoToPraticabilidade(rdo.condicao_local);
  const praticShort =
    pratic === "praticavel"
      ? "Praticável"
      : pratic === "parcial"
        ? "Parc. praticável"
        : "Impraticável";

  return (
    <article className="rdo rdo-v3">
      <header className="rdo-head">
        <div>
          <div className="rdo-eyebrow">Relatório diário de obra</div>
          <div className="rdo-id">{rdo.id}</div>
        </div>
        <div className="rdo-meta">
          <div>
            <b>{formatarDataCurta(rdo.data)}</b>
          </div>
          <div>{formatarIntervaloHorario(rdo.hora_chegada, rdo.hora_saida)}</div>
        </div>
      </header>

      <div className="form-grid">
        <Field label="Data" value={formatarDataCurta(rdo.data)} mono />
        <Field
          label="Hora"
          value={formatarIntervaloHorario(rdo.hora_chegada, rdo.hora_saida)}
          mono
        />
        <Field
          label="Praticabilidade"
          render={
            <span style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
              <PraticDot kind={pratic} />
              <span>{praticShort}</span>
            </span>
          }
        />
        <Field label="Responsável" value={rdo.supervisor?.nome ?? "—"} />

        <Field
          label="Ambientes"
          value={String(grupos.length).padStart(2, "0")}
          mono
        />
        <Field label="Fotos" value={String(totFotos).padStart(2, "0")} mono />
        <Field
          label="Pendências"
          value={String(rdo.pendencias.length).padStart(2, "0")}
          mono
        />
        <Field
          label="Pontos de atenção"
          value={String(rdo.pontos_atencao.length).padStart(2, "0")}
          mono
        />

        <Field label="Registros do dia" value={rdo.registros || "—"} bodyField span={2} />
        <Field
          label="Próximos passos"
          value={rdo.proximos_passos || "—"}
          bodyField
          span={2}
        />

        <Field label="Equipe NUE" bodyField span={2}>
          {rdo.equipe_nue.length === 0 ? (
            <span className="sec-empty" style={{ fontSize: "9pt" }}>
              Sem registros.
            </span>
          ) : (
            <div style={{ fontSize: "9.5pt", lineHeight: 1.5 }}>
              {rdo.equipe_nue
                .map((e) => (e.funcao ? `${e.nome} (${e.funcao})` : e.nome))
                .join(", ")}
            </div>
          )}
        </Field>
        <Field label="Terceiros" bodyField span={2}>
          {rdo.terceiros.length === 0 ? (
            <span className="sec-empty" style={{ fontSize: "9pt" }}>
              Sem registros.
            </span>
          ) : (
            <div style={{ fontSize: "9.5pt", lineHeight: 1.5 }}>
              {rdo.terceiros
                .map((t) => (t.papel ? `${t.nome} (${t.papel})` : t.nome))
                .join(", ")}
            </div>
          )}
        </Field>

        <Field label="Pendências gerais" bodyField span={2} lastRow>
          {pendGerais.length === 0 ? (
            <span className="sec-empty" style={{ fontSize: "9pt" }}>
              Sem registros.
            </span>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5mm",
                marginTop: "1mm",
              }}
            >
              {pendGerais.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "3mm",
                    fontSize: "9pt",
                  }}
                >
                  <span style={{ color: "var(--fg)" }}>{p.descricao}</span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--fg-tertiary)",
                      textTransform: "uppercase",
                      fontSize: "8pt",
                    }}
                  >
                    {p.prioridade}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Field>
        <Field label="Pontos de atenção" bodyField span={2} lastRow>
          {pontosGerais.length === 0 ? (
            <span className="sec-empty" style={{ fontSize: "9pt" }}>
              Sem registros.
            </span>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5mm",
                marginTop: "1mm",
              }}
            >
              {pontosGerais.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "5mm 1fr",
                    fontSize: "9pt",
                    lineHeight: 1.45,
                  }}
                >
                  <span
                    style={{
                      color: "var(--nue-warning)",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                    }}
                  >
                    !
                  </span>
                  <span style={{ color: "var(--fg-secondary)" }}>
                    {p.descricao}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Field>
      </div>

      {grupos.length > 0 && (
        <section style={{ marginTop: "2mm" }}>
          <h6 className="sec-h">Ambientes · {grupos.length}</h6>
          <div className="amb-grid">
            {grupos.map((g) => (
              <AmbienteBlock key={g.id} grupo={g} />
            ))}
          </div>
        </section>
      )}

      <FotosSemAmbBlock fotos={fotosSemAmb} />

      <div className="sig">
        <div className="sig-info">
          Assinada por{" "}
          <span className="sig-name">{rdo.supervisor?.nome ?? "—"}</span>
        </div>
        {rdo.assinatura_url && (
          <img className="sig-img" src={rdo.assinatura_url} alt="Assinatura" />
        )}
      </div>
    </article>
  );
}

function Field({
  label,
  value,
  mono,
  bodyField,
  span,
  lastRow,
  render,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  bodyField?: boolean;
  span?: 2 | 4;
  lastRow?: boolean;
  render?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const cls = ["field"];
  if (bodyField) cls.push("body-field");
  if (span === 2) cls.push("span-2");
  if (span === 4) cls.push("span-4");
  if (lastRow) cls.push("last-row");
  return (
    <div className={cls.join(" ")}>
      <span className="lbl">{label}</span>
      {render ? (
        <span className="val">{render}</span>
      ) : children ? (
        children
      ) : (
        <span className={`val ${mono ? "mono" : ""}`}>{value}</span>
      )}
    </div>
  );
}


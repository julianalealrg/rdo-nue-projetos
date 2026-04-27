import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  Pencil,
  Printer,
  Image as ImageIcon,
} from "lucide-react";
import {
  fetchRdoCompleto,
  fetchVersoesRdo,
  RdoNaoEncontradoError,
} from "@/lib/rdo";
import type {
  RdoCompleto,
  ObraComSupervisor,
  CondicaoLocal,
  TipoVisita,
  Prioridade,
} from "@/lib/diario";
import {
  formatarDataCurta,
  formatarIntervaloHorario,
} from "@/lib/datas";
import { SupervisorAvatar } from "@/components/ObraBadges";
import { Lightbox } from "@/components/Lightbox";
import { ModalVersoesRdo } from "@/components/ModalVersoesRdo";

export const Route = createFileRoute("/rdo/$id")({
  component: RdoDetalheRoute,
});

function RdoDetalheRoute() {
  const { id } = Route.useParams();
  const router = useRouter();

  const rdoQuery = useQuery({
    queryKey: ["rdo-completo", id],
    queryFn: () => fetchRdoCompleto(id),
    retry: (count, err) => !(err instanceof RdoNaoEncontradoError) && count < 2,
  });

  const versoesQuery = useQuery({
    queryKey: ["rdo-versoes", id],
    queryFn: () => fetchVersoesRdo(id),
    enabled: rdoQuery.isSuccess,
  });

  if (rdoQuery.isLoading) return <SkeletonDetalhe />;

  if (rdoQuery.isError && rdoQuery.error instanceof RdoNaoEncontradoError) {
    return <RdoNaoEncontrado id={id} />;
  }

  if (rdoQuery.isError) {
    return (
      <div className="rounded-md border border-[#8C3A2E]/30 bg-[#F1DDD8] px-4 py-3 text-sm text-[#8C3A2E]">
        {rdoQuery.error instanceof Error
          ? rdoQuery.error.message
          : "Erro ao carregar RDO."}{" "}
        <button
          type="button"
          onClick={() => router.invalidate()}
          className="ml-2 underline underline-offset-2"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!rdoQuery.data) return null;

  return (
    <DetalheRdoView
      rdo={rdoQuery.data.rdo}
      obra={rdoQuery.data.obra}
      totalVersoes={versoesQuery.data?.length ?? 0}
      versoes={versoesQuery.data ?? []}
    />
  );
}

/* ------------------------- Estados auxiliares ------------------------- */

function SkeletonDetalhe() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-sm border border-nue-taupe bg-white" />
      <div className="mx-auto max-w-[880px] space-y-4 px-2">
        <div className="h-24 animate-pulse rounded-sm border border-nue-taupe bg-white" />
        <div className="h-24 animate-pulse rounded-sm border border-nue-taupe bg-white" />
        <div className="h-40 animate-pulse rounded-sm border border-nue-taupe bg-white" />
      </div>
    </div>
  );
}

function RdoNaoEncontrado({ id }: { id: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-3xl text-nue-black">RDO não encontrado</h1>
      <p
        className="mt-2 text-sm text-nue-graphite"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {id}
      </p>
      <p className="mt-1 text-sm text-nue-graphite">
        O RDO solicitado não existe ou foi removido.
      </p>
      <div className="mt-6">
        <Link
          to="/"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite hover:opacity-90"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Obras
        </Link>
      </div>
    </div>
  );
}

/* ------------------------- View principal ------------------------- */

const TIPO_VISITA_STYLES: Record<TipoVisita, { bg: string; fg: string; label: string }> = {
  medicao: { bg: "#E6E4DF", fg: "#41423E", label: "Medição" },
  supervisao_montagem: {
    bg: "#E8ECE4",
    fg: "#4A5D43",
    label: "Supervisão de montagem",
  },
};

const CONDICAO_STYLES: Record<CondicaoLocal, { bg: string; fg: string; label: string }> = {
  praticavel: { bg: "#E8ECE4", fg: "#4A5D43", label: "Praticável" },
  parcialmente_praticavel: {
    bg: "#F1E9DA",
    fg: "#A07B3F",
    label: "Parcialmente praticável",
  },
  impraticavel: { bg: "#F1DDD8", fg: "#8C3A2E", label: "Impraticável" },
};

const PRIORIDADE_STYLES: Record<Prioridade, { bg: string; fg: string; label: string }> = {
  alta: { bg: "#F1DDD8", fg: "#8C3A2E", label: "Alta" },
  media: { bg: "#F1E9DA", fg: "#A07B3F", label: "Média" },
  baixa: { bg: "#E6E4DF", fg: "#41423E", label: "Baixa" },
};

function MiniBadge({
  bg,
  fg,
  children,
}: {
  bg: string;
  fg: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] uppercase"
      style={{
        backgroundColor: bg,
        color: fg,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.06em",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

function formatarDataHora(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Recife",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function DetalheRdoView({
  rdo,
  obra,
  totalVersoes,
  versoes,
}: {
  rdo: RdoCompleto;
  obra: ObraComSupervisor;
  totalVersoes: number;
  versoes: ReturnType<typeof Array<unknown>> extends infer _ ? import("@/lib/rdo").RdoVersao[] : never;
}) {
  const [versoesAberto, setVersoesAberto] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const tipo = TIPO_VISITA_STYLES[rdo.tipo_visita];
  const cond = CONDICAO_STYLES[rdo.condicao_local];
  const horario = formatarIntervaloHorario(rdo.hora_chegada, rdo.hora_saida);

  const ultimaEdicao = versoes[0]?.editado_em ?? rdo.updated_at;

  return (
    <div className="space-y-4">
      <Cabecalho
        rdo={rdo}
        obra={obra}
        totalVersoes={totalVersoes}
        ultimaEdicaoIso={ultimaEdicao}
        tipo={tipo}
        cond={cond}
        horario={horario}
        onAbrirVersoes={() => setVersoesAberto(true)}
      />

      <div className="mx-auto w-full max-w-[880px] space-y-4 px-2 sm:px-0">
        <SecaoTexto label="Registros do dia" texto={rdo.registros} />
        {rdo.proximos_passos.trim() !== "" && (
          <SecaoTexto label="Próximos passos" texto={rdo.proximos_passos} />
        )}

        {rdo.equipe_nue.length > 0 && (
          <CardSecao label="Equipe NUE">
            <ListaPessoas
              itens={rdo.equipe_nue.map((e) => ({
                nome: e.nome,
                detalhe: e.funcao,
              }))}
            />
          </CardSecao>
        )}

        {rdo.terceiros.length > 0 && (
          <CardSecao label="Terceiros">
            <ListaPessoas
              itens={rdo.terceiros.map((t) => ({
                nome: t.nome,
                detalhe: t.papel,
              }))}
            />
          </CardSecao>
        )}

        {(() => {
          const pendGerais = rdo.pendencias.filter((p) => p.ambiente_id == null);
          const pontosGerais = rdo.pontos_atencao.filter((p) => p.ambiente_id == null);
          return (
            <>
              {pendGerais.length > 0 && (
                <CardSecao label="Pendências gerais">
                  <ul className="space-y-2">
                    {pendGerais.map((p) => {
                      const s = PRIORIDADE_STYLES[p.prioridade];
                      return (
                        <li key={p.id} className="flex items-start gap-2.5">
                          <MiniBadge bg={s.bg} fg={s.fg}>
                            {s.label}
                          </MiniBadge>
                          <span className="text-[14px] text-nue-black">{p.descricao}</span>
                        </li>
                      );
                    })}
                  </ul>
                </CardSecao>
              )}

              {pontosGerais.length > 0 && (
                <CardSecao label="Pontos de atenção gerais">
                  <ul className="list-disc space-y-1.5 pl-5 text-[14px] text-nue-black">
                    {pontosGerais.map((p) => (
                      <li key={p.id}>{p.descricao}</li>
                    ))}
                  </ul>
                </CardSecao>
              )}
            </>
          );
        })()}

        {(() => {
          type GrupoAmb = {
            id: string;
            nome: string;
            ordem: number;
            fotos: typeof rdo.fotos;
            pendencias: typeof rdo.pendencias;
            pontos: typeof rdo.pontos_atencao;
            obs: string;
          };
          const mapa = new Map<string, GrupoAmb>();
          function getOrInit(id: string, nome: string, ordem: number): GrupoAmb {
            let g = mapa.get(id);
            if (!g) {
              g = { id, nome, ordem, fotos: [], pendencias: [], pontos: [], obs: "" };
              mapa.set(id, g);
            }
            return g;
          }
          for (const f of rdo.fotos)
            if (f.ambiente_id) {
              const g = getOrInit(f.ambiente_id, f.ambiente?.nome ?? "Ambiente removido", f.ambiente?.ordem ?? 999999);
              g.fotos.push(f);
            }
          for (const p of rdo.pendencias)
            if (p.ambiente_id) {
              const g = getOrInit(p.ambiente_id, p.ambiente?.nome ?? "Ambiente removido", p.ambiente?.ordem ?? 999999);
              g.pendencias.push(p);
            }
          for (const p of rdo.pontos_atencao)
            if (p.ambiente_id) {
              const g = getOrInit(p.ambiente_id, p.ambiente?.nome ?? "Ambiente removido", p.ambiente?.ordem ?? 999999);
              g.pontos.push(p);
            }
          for (const o of rdo.observacoes_ambiente)
            if (o.ambiente_id && (o.texto ?? "").trim() !== "") {
              const g = getOrInit(o.ambiente_id, "Ambiente", 999999);
              g.obs = o.texto;
            }
          const grupos = Array.from(mapa.values()).sort((a, b) => a.ordem - b.ordem);
          const fotosSemAmb = rdo.fotos.filter((f) => f.ambiente_id == null);

          return (
            <>
              {grupos.map((g) => (
                <CardSecao key={g.id} label={g.nome}>
                  {g.obs.trim() !== "" && (
                    <p
                      className="whitespace-pre-wrap text-[15px] text-nue-black"
                      style={{ lineHeight: 1.6 }}
                    >
                      {g.obs}
                    </p>
                  )}
                  {g.pendencias.length > 0 && (
                    <div className={g.obs.trim() !== "" ? "mt-4" : ""}>
                      <h4
                        className="mb-2 text-[11px] uppercase text-nue-graphite"
                        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}
                      >
                        Pendências
                      </h4>
                      <ul className="space-y-2">
                        {g.pendencias.map((p) => {
                          const s = PRIORIDADE_STYLES[p.prioridade];
                          return (
                            <li key={p.id} className="flex items-start gap-2.5">
                              <MiniBadge bg={s.bg} fg={s.fg}>
                                {s.label}
                              </MiniBadge>
                              <span className="text-[14px] text-nue-black">{p.descricao}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {g.pontos.length > 0 && (
                    <div className="mt-4">
                      <h4
                        className="mb-2 text-[11px] uppercase text-nue-graphite"
                        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}
                      >
                        Pontos de atenção
                      </h4>
                      <ul className="list-disc space-y-1.5 pl-5 text-[14px] text-nue-black">
                        {g.pontos.map((p) => (
                          <li key={p.id}>{p.descricao}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {g.fotos.length > 0 && (
                    <div className="mt-4">
                      <h4
                        className="mb-2 text-[11px] uppercase text-nue-graphite"
                        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}
                      >
                        Fotos
                      </h4>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {g.fotos.map((f) => {
                          const i = rdo.fotos.findIndex((x) => x.id === f.id);
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setLightboxIdx(i)}
                              className="group relative block overflow-hidden rounded-sm border border-nue-taupe text-left"
                            >
                              <div className="aspect-square w-full overflow-hidden bg-nue-taupe/20">
                                <img
                                  src={f.url}
                                  alt={f.legenda || "Foto"}
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              {f.legenda && (
                                <p
                                  className="truncate px-1.5 py-1 text-[11px] text-nue-graphite"
                                  style={{ fontFamily: "var(--font-mono)" }}
                                  title={f.legenda}
                                >
                                  {f.legenda}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardSecao>
              ))}

              {fotosSemAmb.length > 0 && (
                <CardSecao label={`Fotos sem ambiente (${fotosSemAmb.length})`}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {fotosSemAmb.map((f) => {
                      const i = rdo.fotos.findIndex((x) => x.id === f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setLightboxIdx(i)}
                          className="group relative block overflow-hidden rounded-sm border border-nue-taupe text-left"
                        >
                          <div className="aspect-square w-full overflow-hidden bg-nue-taupe/20">
                            <img
                              src={f.url}
                              alt={f.legenda || "Foto"}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          {f.legenda && (
                            <p
                              className="truncate px-1.5 py-1 text-[11px] text-nue-graphite"
                              style={{ fontFamily: "var(--font-mono)" }}
                              title={f.legenda}
                            >
                              {f.legenda}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </CardSecao>
              )}
            </>
          );
        })()}

        <CardSecao label="Assinatura do supervisor">
          {rdo.assinatura_url ? (
            <div className="space-y-2">
              <div className="inline-block max-w-[400px] rounded-sm border border-nue-taupe bg-white p-3">
                <img
                  src={rdo.assinatura_url}
                  alt="Assinatura"
                  className="block max-h-[140px] w-full object-contain"
                />
              </div>
              <p className="text-[13px] text-nue-graphite">
                Assinada por {rdo.supervisor?.nome ?? "—"}
              </p>
              <p className="text-[13px] text-nue-graphite">
                Em {formatarDataHora(rdo.updated_at)}
              </p>
            </div>
          ) : (
            <div className="rounded-sm border border-nue-taupe bg-nue-taupe/10 px-4 py-3 text-[13px] text-nue-graphite">
              Sem assinatura registrada
            </div>
          )}
        </CardSecao>
      </div>

      <ModalVersoesRdo
        open={versoesAberto}
        onClose={() => setVersoesAberto(false)}
        versoes={versoes}
        rdoAtual={rdo}
      />

      {lightboxIdx !== null && (
        <Lightbox
          fotos={rdo.fotos}
          indiceInicial={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}

/* ------------------------- Cabeçalho ------------------------- */

function Cabecalho({
  rdo,
  obra,
  totalVersoes,
  ultimaEdicaoIso,
  tipo,
  cond,
  horario,
  onAbrirVersoes,
}: {
  rdo: RdoCompleto;
  obra: ObraComSupervisor;
  totalVersoes: number;
  ultimaEdicaoIso: string;
  tipo: { bg: string; fg: string; label: string };
  cond: { bg: string; fg: string; label: string };
  horario: string;
  onAbrirVersoes: () => void;
}) {
  return (
    <section
      className="rounded-sm border border-nue-taupe bg-white"
      style={{ padding: 24 }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <nav
          className="text-[12px] text-nue-graphite"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <Link to="/" className="hover:text-nue-black hover:underline">
            Obras
          </Link>
          <span className="mx-1">/</span>
          <Link
            to="/obra/$id"
            params={{ id: obra.id }}
            className="hover:text-nue-black hover:underline"
          >
            {obra.id}
          </Link>
          <span className="mx-1">/</span>
          <span className="text-nue-black">{rdo.id}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/rdo/$id/editar"
            params={{ id: rdo.id }}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-sm bg-nue-black px-3 text-sm font-medium text-nue-offwhite hover:opacity-90"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Link>
          <ImprimirDropdown />
          <Link
            to="/obra/$id"
            params={{ id: obra.id }}
            className="inline-flex h-9 items-center gap-1.5 px-2 text-sm text-nue-graphite hover:text-nue-black hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para diário
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className="text-[13px] text-nue-graphite"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {rdo.id}
        </span>
        <MiniBadge
          bg={rdo.finalizado ? "#E8ECE4" : "#E6E4DF"}
          fg={rdo.finalizado ? "#4A5D43" : "#41423E"}
        >
          {rdo.finalizado ? "Finalizado" : "Rascunho"}
        </MiniBadge>
        {totalVersoes > 0 && (
          <button
            type="button"
            onClick={onAbrirVersoes}
            title={`Última edição em ${formatarDataHora(ultimaEdicaoIso)}`}
          >
            <MiniBadge bg="#E6E4DF" fg="#41423E">
              Editado
            </MiniBadge>
          </button>
        )}
      </div>

      <div className="mt-2">
        <h2
          className="text-nue-black"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 30,
            lineHeight: 1.15,
          }}
        >
          {obra.nome_cliente}
        </h2>
        <p className="mt-1 text-[14px] text-nue-graphite">{obra.endereco}</p>
        <Link
          to="/obra/$id"
          params={{ id: obra.id }}
          className="mt-1 inline-block text-[12px] text-nue-graphite hover:text-nue-black hover:underline"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {obra.id}
        </Link>
      </div>

      <div
        className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] text-nue-graphite"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <span className="text-nue-black">
          {formatarDataCurta(rdo.data)} · {horario}
        </span>
        <span aria-hidden>•</span>
        <MiniBadge bg={tipo.bg} fg={tipo.fg}>
          {tipo.label}
        </MiniBadge>
        <span aria-hidden>•</span>
        <MiniBadge bg={cond.bg} fg={cond.fg}>
          {cond.label}
        </MiniBadge>
        <span aria-hidden>•</span>
        {rdo.supervisor ? (
          <span className="inline-flex items-center gap-1.5 text-nue-black">
            <SupervisorAvatar
              iniciais={rdo.supervisor.iniciais}
              nome={rdo.supervisor.nome}
              size={24}
            />
            {rdo.supervisor.nome}
          </span>
        ) : (
          <span className="text-nue-graphite/60">Sem supervisor</span>
        )}
      </div>
    </section>
  );
}

function ImprimirDropdown() {
  const [aberto, setAberto] = useState(false);
  const opcoes = [
    "Exportar PDF",
    "Exportar Excel",
    "Exportar fotos (.zip)",
    "Compartilhar link",
  ];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-nue-graphite bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30"
      >
        <Printer className="h-4 w-4" />
        Imprimir
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {aberto && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setAberto(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[220px] rounded-sm border border-nue-taupe bg-white shadow-md">
            <ul className="py-1">
              {opcoes.map((label) => (
                <li key={label}>
                  <button
                    type="button"
                    disabled
                    className="flex w-full cursor-not-allowed items-center justify-between gap-2 px-3 py-2 text-left text-sm text-nue-graphite/60"
                  >
                    <span>{label}</span>
                    <span
                      className="text-[10px] uppercase"
                      style={{
                        fontFamily: "var(--font-mono)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Em breve
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------- Blocos ------------------------- */

function CardSecao({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-sm border border-nue-taupe bg-white"
      style={{ padding: 20 }}
    >
      <h3
        className="mb-3 text-[11px] uppercase text-nue-graphite"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}
      >
        {label}
      </h3>
      {children}
    </section>
  );
}

function SecaoTexto({ label, texto }: { label: string; texto: string }) {
  if (!texto || texto.trim() === "") return null;
  return (
    <CardSecao label={label}>
      <p
        className="whitespace-pre-wrap text-[15px] text-nue-black"
        style={{ lineHeight: 1.6 }}
      >
        {texto}
      </p>
    </CardSecao>
  );
}

function ListaPessoas({
  itens,
}: {
  itens: { nome: string; detalhe: string }[];
}) {
  return (
    <ul className="divide-y divide-nue-taupe/60">
      {itens.map((it, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
          <span className="text-[14px] font-medium text-nue-black">{it.nome}</span>
          {it.detalhe.trim() !== "" && (
            <span className="text-[13px] text-nue-graphite">({it.detalhe})</span>
          )}
        </li>
      ))}
    </ul>
  );
}

// Avoid unused-import error if ImageIcon ever stripped
void ImageIcon;

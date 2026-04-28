import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Image as ImageIcon,
  AlertTriangle,
  ListChecks,
  FileText,
  Eye,
  Pencil,
  ArrowLeft,
  Settings,
} from "lucide-react";
import {
  fetchDiarioObraResumo,
  fetchRdoDetalhes,
  ObraNaoEncontradaError,
  type RdoCompleto,
  type RdoResumo,
  type ObraComSupervisor,
  type CondicaoLocal,
  type TipoVisita,
  type Prioridade,
} from "@/lib/diario";
import {
  formatarDataCurta,
  formatarIntervaloHorario,
  partesDiaMesAno,
} from "@/lib/datas";

import { StatusBadge, SupervisorAvatar } from "@/components/ObraBadges";
import { Lightbox } from "@/components/Lightbox";
import { ModalGerenciarAmbientes } from "@/components/ModalGerenciarAmbientes";
import { ExportarMenu } from "@/components/ExportarMenu";
import { AlterarStatusObra } from "@/components/AlterarStatusObra";

export const Route = createFileRoute("/obra/$id")({
  component: DiarioObra,
});

const PAGINA = 10;

export const rdoDetalhesQueryKey = (rdoId: string) => ["rdo-detalhes", rdoId];
export const diarioResumoQueryKey = (obraId: string) => ["diario-obra-resumo", obraId];

function DiarioObra() {
  const { id } = Route.useParams();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: diarioResumoQueryKey(id),
    queryFn: () => fetchDiarioObraResumo(id),
    retry: (count, err) => !(err instanceof ObraNaoEncontradaError) && count < 2,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonHeader />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (isError && error instanceof ObraNaoEncontradaError) {
    return <ObraNaoEncontrada />;
  }

  if (isError) {
    return (
      <div className="rounded-md border border-[#8C3A2E]/30 bg-[#F1DDD8] px-4 py-3 text-sm text-[#8C3A2E]">
        {error instanceof Error ? error.message : "Erro ao carregar diário."}{" "}
        <button
          type="button"
          onClick={() => refetch()}
          className="ml-2 underline underline-offset-2"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  return <DiarioObraView obra={data.obra} rdos={data.rdos} />;
}

/* ----------------------------- Sub-views ----------------------------- */

function ObraNaoEncontrada() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-3xl text-nue-black">Obra não encontrada</h1>
      <p className="mt-2 text-sm text-nue-graphite">
        A obra solicitada não existe ou foi removida.
      </p>
      <div className="mt-6">
        <Link
          to="/obras"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite transition-opacity hover:opacity-90"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Obras
        </Link>
      </div>
    </div>
  );
}

function DiarioObraView({
  obra,
  rdos,
}: {
  obra: ObraComSupervisor;
  rdos: RdoResumo[];
}) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [gerenciarAmbientesAberto, setGerenciarAmbientesAberto] = useState(false);
  const [visiveis, setVisiveis] = useState(PAGINA);

  const periodo = useMemo(() => {
    if (rdos.length === 0) return "—";
    const datas = rdos.map((r) => r.data).sort();
    const primeiro = datas[0];
    const ultimo = datas[datas.length - 1];
    if (primeiro === ultimo) return formatarDataCurta(primeiro);
    return `${formatarDataCurta(primeiro)} – ${formatarDataCurta(ultimo)}`;
  }, [rdos]);

  function toggle(rdoId: string) {
    setExpandidos((prev) => {
      const novo = new Set(prev);
      if (novo.has(rdoId)) novo.delete(rdoId);
      else novo.add(rdoId);
      return novo;
    });
  }

  const rdosVisiveis = rdos.slice(0, visiveis);
  const restantes = rdos.length - rdosVisiveis.length;

  /** Resolver para o ExportarMenu do diário inteiro: carrega todos os RDOs completos sob demanda. */
  async function resolveEscopoDiario() {
    const detalhes = await Promise.all(rdos.map((r) => fetchRdoDetalhes(r.id)));
    return { tipo: "diario" as const, obra, rdos: detalhes };
  }

  return (
    <div className="space-y-4">
      <CabecalhoObra
        obra={obra}
        totalRdos={rdos.length}
        periodo={periodo}
        onGerenciarAmbientes={() => setGerenciarAmbientesAberto(true)}
        resolveEscopoDiario={resolveEscopoDiario}
      />

      {rdos.length === 0 ? (
        <EmptyStateRdos obraId={obra.id} />
      ) : (
        <div className="space-y-3">
          {rdosVisiveis.map((rdo) => (
            <CardRdo
              key={rdo.id}
              rdo={rdo}
              obra={obra}
              expandido={expandidos.has(rdo.id)}
              onToggle={() => toggle(rdo.id)}
            />
          ))}
          {restantes > 0 && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisiveis((v) => v + PAGINA)}
                className="inline-flex h-9 items-center justify-center rounded-sm border border-nue-graphite bg-white px-4 text-sm text-nue-black hover:bg-nue-taupe/30"
              >
                Carregar mais ({restantes} restantes)
              </button>
            </div>
          )}
        </div>
      )}

      <ModalGerenciarAmbientes
        open={gerenciarAmbientesAberto}
        onClose={() => setGerenciarAmbientesAberto(false)}
        obraId={obra.id}
        nomeCliente={obra.nome_cliente}
      />
    </div>
  );
}

function CabecalhoObra({
  obra,
  totalRdos,
  periodo,
  onGerenciarAmbientes,
  resolveEscopoDiario,
}: {
  obra: ObraComSupervisor;
  totalRdos: number;
  periodo: string;
  onGerenciarAmbientes: () => void;
  resolveEscopoDiario: () => Promise<{ tipo: "diario"; obra: ObraComSupervisor; rdos: RdoCompleto[] }>;
}) {
  return (
    <section className="rounded-sm border border-nue-taupe bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <nav
          className="text-[12px] text-nue-graphite"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <Link to="/obras" className="hover:text-nue-black hover:underline">
            Obras
          </Link>
          <span className="mx-1">/</span>
          <span className="text-nue-black">{obra.id}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/obra/$id/rdo/novo"
            params={{ id: obra.id }}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-sm bg-nue-black px-3 text-sm font-medium text-nue-offwhite transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Novo RDO
          </Link>
          <button
            type="button"
            onClick={onGerenciarAmbientes}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-nue-graphite bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30"
          >
            <Settings className="h-4 w-4" />
            Gerenciar ambientes
          </button>
          <ExportarMenu
            resolveEscopo={resolveEscopoDiario}
            rotulo="Exportar diário"
          />
          <AlterarStatusObra
            obraId={obra.id}
            statusAtual={obra.status}
            motivoPausaAtual={obra.motivo_pausa ?? ""}
          />
        </div>
      </div>

      <div className="mt-3">
        <div
          className="text-[13px] text-nue-graphite"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {obra.id}
        </div>
        <h2
          className="mt-0.5 text-2xl text-nue-black sm:text-[30px]"
          style={{ fontFamily: "var(--font-display)", lineHeight: 1.15 }}
        >
          {obra.nome_cliente}
        </h2>
        <p className="mt-1 text-[14px] text-nue-graphite">{obra.endereco}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Metadado>
          <span className="text-nue-graphite">Supervisor:</span>{" "}
          {obra.supervisor ? (
            <span className="inline-flex items-center gap-1.5 align-middle text-nue-black">
              <SupervisorAvatar
                iniciais={obra.supervisor.iniciais}
                nome={obra.supervisor.nome}
                size={20}
              />
              {obra.supervisor.nome}
            </span>
          ) : (
            <span className="text-nue-graphite/60">Sem supervisor</span>
          )}
        </Metadado>
        <Divisor />
        <Metadado>
          <span className="text-nue-graphite">Status:</span>{" "}
          <StatusBadge status={obra.status} />
          {obra.status === "pausada" && obra.motivo_pausa && (
            <span
              className="ml-1.5 text-nue-graphite/80"
              title={obra.motivo_pausa}
            >
              · {obra.motivo_pausa}
            </span>
          )}
        </Metadado>
        <Divisor />
        <Metadado>
          <span className="text-nue-graphite">Total RDOs:</span>{" "}
          <span className="text-nue-black">
            {totalRdos === 0 ? "Sem RDOs" : totalRdos}
          </span>
        </Metadado>
        <Divisor />
        <Metadado>
          <span className="text-nue-graphite">Período:</span>{" "}
          <span className="text-nue-black">{periodo}</span>
        </Metadado>
      </div>
    </section>
  );
}

function Metadado({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[12px]"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {children}
    </span>
  );
}

function Divisor() {
  return <span className="hidden h-4 w-px bg-nue-taupe sm:inline-block" aria-hidden />;
}

/* ExportarDropdown removido — substituído por <ExportarMenu /> */

/* ----------------------------- Card RDO ----------------------------- */

const TIPO_VISITA_STYLES: Record<TipoVisita, { bg: string; fg: string; label: string }> = {
  medicao: { bg: "#E6E4DF", fg: "#41423E", label: "Medição" },
  supervisao_montagem: { bg: "#E8ECE4", fg: "#4A5D43", label: "Supervisão" },
};

const CONDICAO_STYLES: Record<CondicaoLocal, { bg: string; fg: string; label: string }> = {
  praticavel: { bg: "#E8ECE4", fg: "#4A5D43", label: "Praticável" },
  parcialmente_praticavel: { bg: "#F1E9DA", fg: "#A07B3F", label: "Parc. praticável" },
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

function CardRdo({
  rdo,
  obra,
  expandido,
  onToggle,
}: {
  rdo: RdoResumo;
  obra: ObraComSupervisor;
  expandido: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const { dia, mesAno } = partesDiaMesAno(rdo.data);
  const tipo = TIPO_VISITA_STYLES[rdo.tipo_visita];
  const cond = CONDICAO_STYLES[rdo.condicao_local];
  const horario = formatarIntervaloHorario(rdo.hora_chegada, rdo.hora_saida);

  const nFotos = rdo.total_fotos;
  const nPend = rdo.total_pendencias;
  const nPontos = rdo.total_pontos;

  // Carrega detalhes só quando expandido (lazy)
  const detalhesQuery = useQuery({
    queryKey: rdoDetalhesQueryKey(rdo.id),
    queryFn: () => fetchRdoDetalhes(rdo.id),
    enabled: expandido,
    staleTime: 60_000,
  });

  function prefetchDetalhes() {
    queryClient.prefetchQuery({
      queryKey: rdoDetalhesQueryKey(rdo.id),
      queryFn: () => fetchRdoDetalhes(rdo.id),
      staleTime: 60_000,
    });
  }

  return (
    <article className="overflow-hidden rounded-sm border border-nue-taupe bg-white">
      {/* Topo (clicável) */}
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={prefetchDetalhes}
        onFocus={prefetchDetalhes}
        aria-expanded={expandido}
        className="flex w-full items-stretch gap-3 px-4 py-3.5 text-left transition-colors hover:bg-nue-offwhite"
      >
        {/* Data */}
        <div
          className="flex w-14 shrink-0 flex-col items-center justify-center"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span className="text-[24px] leading-none text-nue-black">{dia}</span>
          <span
            className="mt-1 text-[11px] text-nue-graphite"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}
          >
            {mesAno}
          </span>
        </div>

        <div className="w-px shrink-0 bg-nue-taupe" aria-hidden />

        {/* Bloco texto */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <MiniBadge bg={tipo.bg} fg={tipo.fg}>
              {tipo.label}
            </MiniBadge>
            <span
              className="text-[12px] text-nue-graphite"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {horario}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[11px] text-nue-graphite"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {rdo.id}
            </span>
            {rdo.supervisor && (
              <span className="inline-flex items-center gap-1.5">
                <SupervisorAvatar
                  iniciais={rdo.supervisor.iniciais}
                  nome={rdo.supervisor.nome}
                  size={20}
                />
                <span className="text-[13px] text-nue-black">{rdo.supervisor.nome}</span>
              </span>
            )}
            <MiniBadge bg={cond.bg} fg={cond.fg}>
              {cond.label}
            </MiniBadge>
            {!rdo.finalizado && (
              <MiniBadge bg="#E6E4DF" fg="#6E6E68">
                Rascunho
              </MiniBadge>
            )}
          </div>
        </div>

        {/* Contadores + chevron */}
        <div className="flex shrink-0 items-center gap-3">
          <div
            className="hidden flex-wrap items-center justify-end gap-3 text-[12px] text-nue-graphite sm:flex"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {nFotos > 0 && (
              <span className="inline-flex items-center gap-1">
                <ImageIcon className="h-3.5 w-3.5" />
                {nFotos} {nFotos === 1 ? "foto" : "fotos"}
              </span>
            )}
            {nPend > 0 && (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {nPend} {nPend === 1 ? "pendência" : "pendências"}
              </span>
            )}
            {nPontos > 0 && (
              <span className="inline-flex items-center gap-1">
                <ListChecks className="h-3.5 w-3.5" />
                {nPontos} {nPontos === 1 ? "ponto" : "pontos"}
              </span>
            )}
          </div>
          <span className="flex h-7 w-7 items-center justify-center text-nue-graphite">
            {expandido ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        </div>
      </button>

      {/* Conteúdo expandido (lazy) */}
      {expandido && (
        <div className="border-t border-nue-taupe bg-nue-offwhite/40">
          {detalhesQuery.isLoading && (
            <div className="px-4 py-6 text-center text-[13px] text-nue-graphite">
              Carregando detalhes...
            </div>
          )}
          {detalhesQuery.isError && (
            <div className="px-4 py-4 text-[13px] text-[#8C3A2E]">
              Erro ao carregar detalhes.{" "}
              <button
                type="button"
                onClick={() => detalhesQuery.refetch()}
                className="underline"
              >
                Tentar novamente
              </button>
            </div>
          )}
          {detalhesQuery.data && (
            <ConteudoRdo rdo={detalhesQuery.data} obra={obra} />
          )}
        </div>
      )}
    </article>
  );
}

/* ----------------------------- Conteúdo expandido ----------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-1.5 text-[11px] uppercase text-nue-graphite"
      style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
    >
      {children}
    </div>
  );
}

function ConteudoRdo({ rdo, obra }: { rdo: RdoCompleto; obra: ObraComSupervisor }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const pendGerais = rdo.pendencias.filter((p) => p.ambiente_id == null);
  const pontosGerais = rdo.pontos_atencao.filter((p) => p.ambiente_id == null);

  // Agrupar conteúdo por ambiente
  type GrupoAmb = {
    id: string;
    nome: string;
    ordem: number;
    fotos: typeof rdo.fotos;
    pendencias: typeof rdo.pendencias;
    pontos: typeof rdo.pontos_atencao;
    obs: string;
  };
  const mapaAmb = new Map<string, GrupoAmb>();
  function getOrInit(id: string, nome: string, ordem: number): GrupoAmb {
    let g = mapaAmb.get(id);
    if (!g) {
      g = { id, nome, ordem, fotos: [], pendencias: [], pontos: [], obs: "" };
      mapaAmb.set(id, g);
    }
    return g;
  }
  for (const f of rdo.fotos) {
    if (f.ambiente_id) {
      const g = getOrInit(f.ambiente_id, f.ambiente?.nome ?? "Ambiente removido", f.ambiente?.ordem ?? 999999);
      g.fotos.push(f);
    }
  }
  for (const p of rdo.pendencias) {
    if (p.ambiente_id) {
      const g = getOrInit(p.ambiente_id, p.ambiente?.nome ?? "Ambiente removido", p.ambiente?.ordem ?? 999999);
      g.pendencias.push(p);
    }
  }
  for (const p of rdo.pontos_atencao) {
    if (p.ambiente_id) {
      const g = getOrInit(p.ambiente_id, p.ambiente?.nome ?? "Ambiente removido", p.ambiente?.ordem ?? 999999);
      g.pontos.push(p);
    }
  }
  for (const o of rdo.observacoes_ambiente) {
    if (o.ambiente_id && (o.texto ?? "").trim() !== "") {
      const g = getOrInit(o.ambiente_id, "Ambiente", 999999);
      g.obs = o.texto;
    }
  }
  // Fotos sem ambiente (legado)
  const fotosSemAmb = rdo.fotos.filter((f) => f.ambiente_id == null);
  const gruposAmbiente = Array.from(mapaAmb.values()).sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="px-4 py-4">
      <div className="space-y-4">
        {rdo.registros.trim() && (
          <section>
            <SectionLabel>Registros do dia</SectionLabel>
            <p className="whitespace-pre-line text-[14px] text-nue-black">{rdo.registros}</p>
          </section>
        )}

        {rdo.proximos_passos.trim() && (
          <section>
            <SectionLabel>Próximos passos</SectionLabel>
            <p className="whitespace-pre-line text-[14px] text-nue-black">
              {rdo.proximos_passos}
            </p>
          </section>
        )}

        {rdo.equipe_nue.length > 0 && (
          <section>
            <SectionLabel>Equipe NUE</SectionLabel>
            <ChipsInline
              items={rdo.equipe_nue.map((e) => ({
                key: e.id,
                principal: e.nome,
                secundario: e.funcao,
              }))}
            />
          </section>
        )}

        {rdo.terceiros.length > 0 && (
          <section>
            <SectionLabel>Terceiros</SectionLabel>
            <ChipsInline
              items={rdo.terceiros.map((t) => ({
                key: t.id,
                principal: t.nome,
                secundario: t.papel,
              }))}
            />
          </section>
        )}

        {pendGerais.length > 0 && (
          <section>
            <SectionLabel>Pendências gerais</SectionLabel>
            <ul className="space-y-1.5">
              {pendGerais.map((p) => {
                const s = PRIORIDADE_STYLES[p.prioridade];
                return (
                  <li key={p.id} className="flex items-start gap-2 text-[14px] text-nue-black">
                    <MiniBadge bg={s.bg} fg={s.fg}>
                      {s.label}
                    </MiniBadge>
                    <span className="flex-1">{p.descricao}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {pontosGerais.length > 0 && (
          <section>
            <SectionLabel>Pontos de atenção gerais</SectionLabel>
            <ul className="list-disc space-y-1 pl-5 text-[14px] text-nue-black">
              {pontosGerais.map((p) => (
                <li key={p.id}>{p.descricao}</li>
              ))}
            </ul>
          </section>
        )}

        {gruposAmbiente.length > 0 && (
          <section>
            <SectionLabel>Ambientes</SectionLabel>
            <div className="space-y-4">
              {gruposAmbiente.map((g) => (
                <div
                  key={g.id}
                  className="rounded-sm border border-nue-taupe bg-white px-3 py-3"
                >
                  <h4
                    className="text-nue-black"
                    style={{ fontFamily: "var(--font-display)", fontSize: 17 }}
                  >
                    {g.nome}
                  </h4>
                  {g.obs.trim() !== "" && (
                    <p className="mt-2 whitespace-pre-line text-[14px] text-nue-black">
                      {g.obs}
                    </p>
                  )}
                  {g.pendencias.length > 0 && (
                    <div className="mt-3">
                      <SectionLabel>Pendências</SectionLabel>
                      <ul className="space-y-1.5">
                        {g.pendencias.map((p) => {
                          const s = PRIORIDADE_STYLES[p.prioridade];
                          return (
                            <li
                              key={p.id}
                              className="flex items-start gap-2 text-[14px] text-nue-black"
                            >
                              <MiniBadge bg={s.bg} fg={s.fg}>
                                {s.label}
                              </MiniBadge>
                              <span className="flex-1">{p.descricao}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {g.pontos.length > 0 && (
                    <div className="mt-3">
                      <SectionLabel>Pontos de atenção</SectionLabel>
                      <ul className="list-disc space-y-1 pl-5 text-[14px] text-nue-black">
                        {g.pontos.map((p) => (
                          <li key={p.id}>{p.descricao}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {g.fotos.length > 0 && (
                    <div className="mt-3">
                      <SectionLabel>Fotos</SectionLabel>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {g.fotos.map((f) => {
                          const idxOriginal = rdo.fotos.findIndex((x) => x.id === f.id);
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setLightboxIdx(idxOriginal)}
                              className="group relative block aspect-square overflow-hidden rounded-[2px] border border-nue-taupe bg-nue-taupe"
                            >
                              <img
                                src={f.url}
                                alt={f.legenda || "Foto do RDO"}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                              {f.legenda && (
                                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-left text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                                  {f.legenda}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {fotosSemAmb.length > 0 && (
          <section>
            <SectionLabel>Fotos sem ambiente</SectionLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {fotosSemAmb.map((f) => {
                const idxOriginal = rdo.fotos.findIndex((x) => x.id === f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setLightboxIdx(idxOriginal)}
                    className="group relative block aspect-square overflow-hidden rounded-[2px] border border-nue-taupe bg-nue-taupe"
                  >
                    <img
                      src={f.url}
                      alt={f.legenda || "Foto do RDO"}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    {f.legenda && (
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-left text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {f.legenda}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Rodapé com ações */}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-nue-taupe pt-3">
        <Link
          to="/rdo/$id"
          params={{ id: rdo.id }}
          className="inline-flex items-center gap-1.5 text-[13px] text-nue-black hover:underline"
        >
          <Eye className="h-3.5 w-3.5" />
          Ver completo
        </Link>
        <Link
          to="/rdo/$id/editar"
          params={{ id: rdo.id }}
          className="inline-flex items-center gap-1.5 text-[13px] text-nue-black hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </Link>
        <ExportarMenu
          escopo={{ tipo: "rdo", obra, rdo }}
          variante="inline"
          rotulo="Imprimir RDO"
        />
      </div>

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

function ChipsInline({
  items,
}: {
  items: { key: string; principal: string; secundario?: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-nue-black">
      {items.map((it, i) => (
        <span key={it.key} className="inline-flex items-center">
          <span>
            {it.principal}
            {it.secundario && it.secundario.trim() && (
              <span className="text-nue-graphite"> ({it.secundario})</span>
            )}
          </span>
          {i < items.length - 1 && (
            <span className="mx-2 text-nue-graphite/60" aria-hidden>
              •
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/* ImprimirDropdown removido — substituído por <ExportarMenu /> */

/* ----------------------------- Empty / Skeleton ----------------------------- */

function EmptyStateRdos({ obraId }: { obraId: string }) {
  return (
    <div className="rounded-sm border border-dashed border-nue-taupe bg-white px-6 py-12 text-center">
      <FileText
        className="mx-auto text-nue-graphite"
        style={{ width: 48, height: 48, strokeWidth: 1 }}
      />
      <h3 className="mt-4 text-[17px] text-nue-black">
        Esta obra ainda não tem registros
      </h3>
      <p className="mt-1 text-[14px] text-nue-graphite">
        Cadastre o primeiro RDO para começar o histórico desta obra
      </p>
      <div className="mt-5">
        <Link
          to="/obra/$id/rdo/novo"
          params={{ id: obraId }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Criar primeiro RDO
        </Link>
      </div>
    </div>
  );
}

function SkeletonHeader() {
  return (
    <div className="rounded-sm border border-nue-taupe bg-white p-5">
      <div className="h-3 w-32 animate-pulse rounded-sm bg-nue-taupe/60" />
      <div className="mt-3 h-7 w-2/3 animate-pulse rounded-sm bg-nue-taupe/60" />
      <div className="mt-2 h-4 w-1/2 animate-pulse rounded-sm bg-nue-taupe/40" />
      <div className="mt-4 flex gap-3">
        <div className="h-4 w-32 animate-pulse rounded-sm bg-nue-taupe/40" />
        <div className="h-4 w-24 animate-pulse rounded-sm bg-nue-taupe/40" />
        <div className="h-4 w-28 animate-pulse rounded-sm bg-nue-taupe/40" />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-nue-taupe bg-white px-4 py-3.5">
      <div className="h-12 w-14 animate-pulse rounded-sm bg-nue-taupe/60" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 animate-pulse rounded-sm bg-nue-taupe/60" />
        <div className="h-3 w-1/2 animate-pulse rounded-sm bg-nue-taupe/40" />
      </div>
    </div>
  );
}


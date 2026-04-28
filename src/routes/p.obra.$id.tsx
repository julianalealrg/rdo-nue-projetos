import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Image as ImageIcon } from "lucide-react";
import { fetchDiarioObra } from "@/lib/diario";
import type { RdoCompleto, ObraComSupervisor } from "@/lib/diario";
import { resolverShareToken } from "@/lib/share";
import {
  formatarDataCurta,
  formatarIntervaloHorario,
  partesDiaMesAno,
} from "@/lib/datas";
import { StatusBadge, SupervisorAvatar } from "@/components/ObraBadges";
import logoUrl from "@/assets/logo-nue-projetos.svg";

type SearchParams = { t?: string };

export const Route = createFileRoute("/p/obra/$id")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    t: typeof search.t === "string" ? search.t : undefined,
  }),
  component: PublicaObraPage,
});

function PublicaObraPage() {
  const { id } = Route.useParams();
  const { t } = Route.useSearch();

  const [tokenValido, setTokenValido] = useState<boolean | null>(null);

  useEffect(() => {
    if (!t) {
      setTokenValido(false);
      return;
    }
    let ativo = true;
    void resolverShareToken(t)
      .then((obraId) => {
        if (!ativo) return;
        setTokenValido(obraId === id);
      })
      .catch(() => ativo && setTokenValido(false));
    return () => {
      ativo = false;
    };
  }, [t, id]);

  if (tokenValido === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-nue-offwhite">
        <p className="text-sm text-nue-graphite">Validando link…</p>
      </div>
    );
  }

  if (!tokenValido) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-nue-offwhite px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl text-nue-black">Link inválido ou revogado</h1>
          <p className="mt-2 text-sm text-nue-graphite">
            Este link de compartilhamento não é mais válido. Entre em contato com a NUE Projetos
            pra receber um novo.
          </p>
        </div>
      </div>
    );
  }

  return <DiarioPublico obraId={id} />;
}

function DiarioPublico({ obraId }: { obraId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["publico-obra", obraId],
    queryFn: () => fetchDiarioObra(obraId),
  });

  if (isLoading) {
    return <ChromePublico><p className="p-8 text-center text-sm text-nue-graphite">Carregando…</p></ChromePublico>;
  }
  if (isError || !data) {
    return (
      <ChromePublico>
        <p className="p-8 text-center text-sm text-danger">
          {error instanceof Error ? error.message : "Erro ao carregar"}
        </p>
      </ChromePublico>
    );
  }

  return (
    <ChromePublico>
      <div className="mx-auto max-w-[880px] space-y-4 px-4 py-6">
        <CabecalhoObraPublico obra={data.obra} totalRdos={data.rdos.length} />
        {data.rdos.length === 0 ? (
          <div className="rounded-sm border border-nue-taupe bg-white p-8 text-center text-sm text-nue-graphite">
            Nenhum RDO registrado nesta obra ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {data.rdos.map((rdo) => (
              <CardRdoPublico key={rdo.id} rdo={rdo} />
            ))}
          </div>
        )}
      </div>
    </ChromePublico>
  );
}

function ChromePublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-nue-offwhite">
      <header className="border-b border-nue-taupe bg-white">
        <div className="mx-auto flex max-w-[880px] items-center justify-between gap-3 px-4 py-3">
          <img src={logoUrl} alt="NUE Projetos" className="h-8 w-auto" />
          <span
            className="rounded-sm bg-nue-taupe/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-nue-graphite"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Visualização compartilhada
          </span>
        </div>
      </header>
      {children}
      <footer className="mx-auto max-w-[880px] px-4 py-6 text-center text-[11px] text-nue-graphite/70">
        NUE Projetos — Sistema RDO
      </footer>
    </div>
  );
}

function CabecalhoObraPublico({
  obra,
  totalRdos,
}: {
  obra: ObraComSupervisor;
  totalRdos: number;
}) {
  return (
    <section className="rounded-sm border border-nue-taupe bg-white p-5">
      <p
        className="text-[12px] text-nue-graphite"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {obra.id}
      </p>
      <h1
        className="mt-1 text-2xl text-nue-black sm:text-[30px]"
        style={{ fontFamily: "var(--font-display)", lineHeight: 1.15 }}
      >
        {obra.nome_cliente}
      </h1>
      <p className="mt-1 text-sm text-nue-graphite">{obra.endereco}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[12px]" style={{ fontFamily: "var(--font-mono)" }}>
          <span className="text-nue-graphite">Status:</span> <StatusBadge status={obra.status} />
        </span>
        <span className="text-[12px]" style={{ fontFamily: "var(--font-mono)" }}>
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
        </span>
        <span className="text-[12px]" style={{ fontFamily: "var(--font-mono)" }}>
          <span className="text-nue-graphite">RDOs:</span>{" "}
          <span className="text-nue-black">{totalRdos}</span>
        </span>
      </div>
    </section>
  );
}

function CardRdoPublico({ rdo }: { rdo: RdoCompleto }) {
  const [aberto, setAberto] = useState(false);
  const dia = partesDiaMesAno(rdo.data);

  return (
    <article className="rounded-sm border border-nue-taupe bg-white">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-nue-offwhite"
      >
        <div
          className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-sm bg-nue-taupe/40 text-nue-black"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <span className="text-lg font-medium leading-none">{dia.dia}</span>
          <span className="text-[9px] tracking-wider">{dia.mesAno}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-nue-black">
            {rdo.id} · {formatarIntervaloHorario(rdo.hora_chegada, rdo.hora_saida)}
          </p>
          <p className="truncate text-[12px] text-nue-graphite">
            {rdo.supervisor?.nome ?? "—"}
            {rdo.fotos.length > 0 ? ` · ${rdo.fotos.length} fotos` : ""}
            {rdo.pendencias.length > 0 ? ` · ${rdo.pendencias.length} pendências` : ""}
          </p>
        </div>
        {aberto ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-nue-graphite" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-nue-graphite" />
        )}
      </button>

      {aberto && (
        <div className="space-y-4 border-t border-nue-taupe/60 px-4 py-4">
          {rdo.registros.trim() && (
            <Bloco titulo="Registros do dia" texto={rdo.registros} />
          )}
          {rdo.proximos_passos.trim() && (
            <Bloco titulo="Próximos passos" texto={rdo.proximos_passos} />
          )}

          {rdo.pendencias.length > 0 && (
            <div>
              <h3 className="mb-2 text-[13px] font-medium text-nue-black">Pendências</h3>
              <ul className="space-y-1.5 text-[13px] text-nue-black">
                {rdo.pendencias.map((p) => (
                  <li key={p.id} className="flex gap-2">
                    <span className="text-nue-graphite/60">•</span>
                    <span>
                      {p.descricao}
                      {p.ambiente && (
                        <span className="ml-1 text-[11px] text-nue-graphite">
                          ({p.ambiente.nome})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rdo.pontos_atencao.length > 0 && (
            <div>
              <h3 className="mb-2 text-[13px] font-medium text-nue-black">Pontos de atenção</h3>
              <ul className="space-y-1.5 text-[13px] text-nue-black">
                {rdo.pontos_atencao.map((p) => (
                  <li key={p.id} className="flex gap-2">
                    <span className="text-nue-graphite/60">•</span>
                    <span>{p.descricao}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rdo.fotos.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-nue-black">
                <ImageIcon className="h-3.5 w-3.5" />
                Fotos ({rdo.fotos.length})
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {rdo.fotos.map((foto) => (
                  <a
                    key={foto.id}
                    href={foto.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square overflow-hidden rounded-sm border border-nue-taupe bg-nue-taupe"
                  >
                    <img
                      src={foto.url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {rdo.assinatura_url && (
            <div>
              <h3 className="mb-2 text-[13px] font-medium text-nue-black">Assinatura</h3>
              <div className="rounded-sm border border-nue-taupe bg-white p-3">
                <img
                  src={rdo.assinatura_url}
                  alt="Assinatura"
                  className="max-h-[120px] object-contain"
                />
              </div>
              {rdo.supervisor && (
                <p
                  className="mt-2 text-[12px] text-nue-graphite"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {rdo.supervisor.nome}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Bloco({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-nue-black">
        <FileText className="h-3.5 w-3.5" />
        {titulo}
      </h3>
      <p className="whitespace-pre-wrap text-[13px] text-nue-black">{texto}</p>
    </div>
  );
}

// silence unused for Link import in case future usage
void Link;

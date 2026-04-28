import { useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, LayoutGrid, List, Plus, Building2, ChevronDown } from "lucide-react";
import { fetchPainelObras } from "@/lib/painel";
import type { ObraComResumo } from "@/lib/painel";
import { fetchDiarioObraResumo } from "@/lib/diario";
import { diarioResumoQueryKey } from "@/routes/obra.$id";
import { formatarDataRelativa } from "@/lib/datas";
import { ModalNovaObra } from "@/components/ModalNovaObra";
import { StatusBadge, SupervisorAvatar } from "@/components/ObraBadges";

export const Route = createFileRoute("/")({
  component: PainelObras,
});

type Vista = "lista" | "grid";
type StatusFiltro = "ativa" | "pausada" | "concluida";

function PainelObras() {
  const navigate = useNavigate();
  const router = useRouter();
  const [modalAberto, setModalAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro[]>([]);
  const [supervisorFiltro, setSupervisorFiltro] = useState<string[]>([]);
  const [vista, setVista] = useState<Vista>("lista");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["painel-obras"],
    queryFn: fetchPainelObras,
  });

  const obrasFiltradas = useMemo(() => {
    if (!data) return [];
    const termo = busca.trim().toLowerCase();
    return data.obras.filter((o) => {
      if (statusFiltro.length > 0 && !statusFiltro.includes(o.status)) return false;
      if (supervisorFiltro.length > 0) {
        if (!o.supervisor_id || !supervisorFiltro.includes(o.supervisor_id)) return false;
      }
      if (termo) {
        const matchCliente = o.nome_cliente.toLowerCase().includes(termo);
        const matchId = o.id.toLowerCase().includes(termo);
        if (!matchCliente && !matchId) return false;
      }
      return true;
    });
  }, [data, busca, statusFiltro, supervisorFiltro]);

  const temFiltrosAtivos =
    busca.trim().length > 0 || statusFiltro.length > 0 || supervisorFiltro.length > 0;

  function limparFiltros() {
    setBusca("");
    setStatusFiltro([]);
    setSupervisorFiltro([]);
  }

  function handleObraCriada(idObra: string) {
    setModalAberto(false);
    router.invalidate();
    navigate({ to: "/obra/$id", params: { id: idObra } });
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl text-nue-black">Relatório Diário de Obra</h1>
          <p className="text-[15px] text-nue-graphite">
            Acompanhamento das obras em medição e montagem
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Nova obra
        </button>
      </header>

      {/* Stat tiles */}
      <StatTiles loading={isLoading} stats={data?.stats} />

      {/* Filterbar */}
      <FilterBar
        busca={busca}
        onBuscaChange={setBusca}
        statusFiltro={statusFiltro}
        onStatusChange={setStatusFiltro}
        supervisorFiltro={supervisorFiltro}
        onSupervisorChange={setSupervisorFiltro}
        supervisores={data?.supervisores ?? []}
        vista={vista}
        onVistaChange={setVista}
      />

      {/* Estado de erro */}
      {isError && (
        <div className="rounded-md border border-[#8C3A2E]/30 bg-[#F1DDD8] px-4 py-3 text-sm text-[#8C3A2E]">
          {error instanceof Error ? error.message : "Erro ao carregar painel."}{" "}
          <button
            type="button"
            onClick={() => refetch()}
            className="ml-2 underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Conteúdo principal */}
      {isLoading ? (
        vista === "lista" ? (
          <SkeletonTabela />
        ) : (
          <SkeletonGrid />
        )
      ) : data && data.obras.length === 0 ? (
        <EmptyStateNenhumaObra onCadastrar={() => setModalAberto(true)} />
      ) : obrasFiltradas.length === 0 ? (
        <EmptyStateFiltros onLimpar={limparFiltros} />
      ) : vista === "lista" ? (
        <TabelaObras obras={obrasFiltradas} />
      ) : (
        <GridObras obras={obrasFiltradas} />
      )}

      <ModalNovaObra
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        supervisores={data?.supervisores ?? []}
        onCreated={handleObraCriada}
      />
    </div>
  );
}

/* ----------------------------- Stat Tiles ----------------------------- */

function StatTile({
  label,
  valor,
  loading,
}: {
  label: string;
  valor: number;
  loading?: boolean;
}) {
  return (
    <div className="rounded-sm border border-nue-taupe bg-white p-4">
      <div
        className="text-[11px] uppercase text-nue-graphite"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      {loading ? (
        <div className="mt-2 h-10 w-16 animate-pulse rounded-sm bg-nue-taupe/50" />
      ) : (
        <div
          className="mt-1 text-nue-black leading-none"
          style={{ fontFamily: "var(--font-display)", fontSize: 40 }}
        >
          {valor}
        </div>
      )}
    </div>
  );
}

function StatTiles({
  stats,
  loading,
}: {
  stats?: { obrasAtivas: number; rdosSemana: number; pendenciasAbertas: number; semRegistro7Dias: number };
  loading: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label="Obras ativas" valor={stats?.obrasAtivas ?? 0} loading={loading} />
      <StatTile label="RDOs esta semana" valor={stats?.rdosSemana ?? 0} loading={loading} />
      <StatTile
        label="Pendências abertas"
        valor={stats?.pendenciasAbertas ?? 0}
        loading={loading}
      />
      <StatTile
        label="Sem registro há 7+ dias"
        valor={stats?.semRegistro7Dias ?? 0}
        loading={loading}
      />
    </div>
  );
}

/* ----------------------------- Filterbar ----------------------------- */

function FilterBar({
  busca,
  onBuscaChange,
  statusFiltro,
  onStatusChange,
  supervisorFiltro,
  onSupervisorChange,
  supervisores,
  vista,
  onVistaChange,
}: {
  busca: string;
  onBuscaChange: (v: string) => void;
  statusFiltro: StatusFiltro[];
  onStatusChange: (v: StatusFiltro[]) => void;
  supervisorFiltro: string[];
  onSupervisorChange: (v: string[]) => void;
  supervisores: { id: string; nome: string }[];
  vista: Vista;
  onVistaChange: (v: Vista) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-nue-taupe bg-white p-3 lg:flex-row lg:items-center">
      <MultiSelect
        label="Status"
        options={[
          { value: "ativa", label: "Ativa" },
          { value: "pausada", label: "Pausada" },
          { value: "concluida", label: "Concluída" },
        ]}
        selected={statusFiltro}
        onChange={(v) => onStatusChange(v as StatusFiltro[])}
      />
      <MultiSelect
        label="Supervisor"
        options={supervisores.map((s) => ({ value: s.id, label: s.nome }))}
        selected={supervisorFiltro}
        onChange={onSupervisorChange}
        emptyLabel="Sem supervisores ativos"
      />

      <div className="relative flex-1 min-w-[200px]">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-nue-graphite/60" />
        <input
          type="search"
          placeholder="Cliente ou ID"
          value={busca}
          onChange={(e) => onBuscaChange(e.target.value)}
          className="h-9 w-full rounded-sm border border-nue-taupe bg-white pl-8 pr-3 text-sm text-nue-black placeholder:text-nue-graphite/60 focus:border-nue-graphite focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-1 self-start lg:self-auto">
        <button
          type="button"
          onClick={() => onVistaChange("lista")}
          aria-label="Vista lista"
          aria-pressed={vista === "lista"}
          className={`flex h-9 w-9 items-center justify-center rounded-sm border ${
            vista === "lista"
              ? "border-nue-graphite bg-nue-taupe text-nue-black"
              : "border-nue-taupe bg-white text-nue-graphite hover:bg-nue-taupe/40"
          }`}
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onVistaChange("grid")}
          aria-label="Vista grid"
          aria-pressed={vista === "grid"}
          className={`flex h-9 w-9 items-center justify-center rounded-sm border ${
            vista === "grid"
              ? "border-nue-graphite bg-nue-taupe text-nue-black"
              : "border-nue-taupe bg-white text-nue-graphite hover:bg-nue-taupe/40"
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyLabel,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  emptyLabel?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const desabilitado = options.length === 0;

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !desabilitado && setAberto((a) => !a)}
        disabled={desabilitado}
        className="flex h-9 min-w-[140px] items-center justify-between gap-2 rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>
          {label}
          {selected.length > 0 && (
            <span
              className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-sm bg-nue-black px-1 text-[11px] text-nue-offwhite"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {selected.length}
            </span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-nue-graphite" />
      </button>
      {aberto && !desabilitado && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setAberto(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded-sm border border-nue-taupe bg-white shadow-md">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-nue-graphite">
                {emptyLabel ?? "Sem opções"}
              </div>
            ) : (
              <ul className="max-h-60 overflow-auto py-1">
                {options.map((opt) => {
                  const ativo = selected.includes(opt.value);
                  return (
                    <li key={opt.value}>
                      <button
                        type="button"
                        onClick={() => toggle(opt.value)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-nue-black hover:bg-nue-taupe/40"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                            ativo
                              ? "border-nue-black bg-nue-black text-nue-offwhite"
                              : "border-nue-taupe bg-white"
                          }`}
                        >
                          {ativo && (
                            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        {opt.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------------------- Tabela ----------------------------- */

function TabelaObras({ obras }: { obras: ObraComResumo[] }) {
  return (
    <div className="overflow-hidden rounded-sm border border-nue-taupe bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-nue-taupe bg-nue-offwhite">
            <tr
              className="text-left text-[11px] uppercase text-nue-graphite"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
            >
              <Th>ID</Th>
              <Th>Cliente</Th>
              <Th>Endereço</Th>
              <Th>Supervisor</Th>
              <Th>Status</Th>
              <Th>Último RDO</Th>
              <Th className="text-right">Total RDOs</Th>
            </tr>
          </thead>
          <tbody>
            {obras.map((o) => (
              <LinhaObra key={o.id} obra={o} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>;
}

function LinhaObra({ obra }: { obra: ObraComResumo }) {
  const navigate = useNavigate();
  return (
    <tr
      onClick={() => navigate({ to: "/obra/$id", params: { id: obra.id } })}
      className="cursor-pointer border-b border-nue-taupe/60 transition-colors last:border-0 hover:bg-nue-taupe/30"
    >
      <td
        className="px-3 py-3 text-[13px] text-nue-graphite"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {obra.id}
      </td>
      <td className="px-3 py-3 text-sm font-medium text-nue-black">{obra.nome_cliente}</td>
      <td className="px-3 py-3 text-[13px] text-nue-graphite">
        <span className="block max-w-[260px] truncate" title={obra.endereco}>
          {obra.endereco}
        </span>
      </td>
      <td className="px-3 py-3">
        {obra.supervisor ? (
          <div className="flex items-center gap-2">
            <SupervisorAvatar
              iniciais={obra.supervisor.iniciais}
              nome={obra.supervisor.nome}
            />
            <span className="text-[13px] text-nue-black">{obra.supervisor.nome}</span>
          </div>
        ) : (
          <span className="text-[13px] text-nue-graphite">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={obra.status} />
      </td>
      <td className="px-3 py-3 text-[13px] text-nue-graphite">
        {formatarDataRelativa(obra.ultimo_rdo)}
      </td>
      <td
        className="px-3 py-3 text-right text-[13px] text-nue-black"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {obra.total_rdos}
      </td>
    </tr>
  );
}

/* ----------------------------- Grid ----------------------------- */

function GridObras({ obras }: { obras: ObraComResumo[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {obras.map((o) => (
        <CardObra key={o.id} obra={o} />
      ))}
    </div>
  );
}

function CardObra({ obra }: { obra: ObraComResumo }) {
  return (
    <Link
      to="/obra/$id"
      params={{ id: obra.id }}
      className="block rounded-sm border border-nue-taupe bg-white p-4 transition-colors hover:bg-nue-taupe/20"
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[12px] text-nue-graphite"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {obra.id}
        </span>
        <StatusBadge status={obra.status} />
      </div>
      <div className="mt-2 text-[15px] font-medium text-nue-black">{obra.nome_cliente}</div>
      <p
        className="mt-1 text-[13px] text-nue-graphite"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {obra.endereco}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-nue-taupe/60 pt-3">
        {obra.supervisor ? (
          <div className="flex items-center gap-2 min-w-0">
            <SupervisorAvatar
              iniciais={obra.supervisor.iniciais}
              nome={obra.supervisor.nome}
            />
            <span className="truncate text-[12px] text-nue-black">
              {obra.supervisor.nome}
            </span>
          </div>
        ) : (
          <span className="text-[12px] text-nue-graphite">— Sem supervisor</span>
        )}
        <div
          className="flex shrink-0 items-center gap-3 text-[12px] text-nue-graphite"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <span>Total: {obra.total_rdos}</span>
          <span>Último: {formatarDataRelativa(obra.ultimo_rdo)}</span>
        </div>
      </div>
    </Link>
  );
}

/* ----------------------------- Skeletons ----------------------------- */

function SkeletonTabela() {
  return (
    <div className="overflow-hidden rounded-sm border border-nue-taupe bg-white">
      <div className="border-b border-nue-taupe bg-nue-offwhite px-3 py-2">
        <div className="h-3 w-24 animate-pulse rounded-sm bg-nue-taupe/60" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-7 items-center gap-3 border-b border-nue-taupe/60 px-3 py-3 last:border-0"
        >
          {Array.from({ length: 7 }).map((__, j) => (
            <div
              key={j}
              className="h-3 animate-pulse rounded-sm bg-nue-taupe/40"
              style={{ width: `${50 + ((i + j) % 4) * 10}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-sm border border-nue-taupe bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="h-3 w-16 animate-pulse rounded-sm bg-nue-taupe/50" />
            <div className="h-4 w-14 animate-pulse rounded-sm bg-nue-taupe/50" />
          </div>
          <div className="mt-3 h-4 w-2/3 animate-pulse rounded-sm bg-nue-taupe/50" />
          <div className="mt-2 h-3 w-full animate-pulse rounded-sm bg-nue-taupe/40" />
          <div className="mt-1 h-3 w-1/2 animate-pulse rounded-sm bg-nue-taupe/40" />
          <div className="mt-4 h-3 w-1/3 animate-pulse rounded-sm bg-nue-taupe/40" />
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- Empty states ----------------------------- */

function EmptyStateNenhumaObra({ onCadastrar }: { onCadastrar: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-sm border border-nue-taupe bg-white px-6 py-16 text-center">
      <Building2 className="h-12 w-12 text-nue-graphite" strokeWidth={1.25} />
      <p className="mt-4 text-[17px] text-nue-black">
        Você ainda não cadastrou nenhuma obra
      </p>
      <p className="mt-1 max-w-sm text-sm text-nue-graphite">
        Comece cadastrando a primeira obra para registrar seus RDOs
      </p>
      <button
        type="button"
        onClick={onCadastrar}
        className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite transition-opacity hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        Cadastrar primeira obra
      </button>
    </div>
  );
}

function EmptyStateFiltros({ onLimpar }: { onLimpar: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-sm border border-nue-taupe bg-white px-6 py-12 text-center">
      <p className="text-[17px] text-nue-black">
        Nenhuma obra atende aos filtros aplicados
      </p>
      <button
        type="button"
        onClick={onLimpar}
        className="mt-4 inline-flex h-9 items-center justify-center rounded-sm border border-nue-taupe bg-white px-4 text-sm text-nue-black transition-colors hover:bg-nue-taupe/40"
      >
        Limpar filtros
      </button>
    </div>
  );
}

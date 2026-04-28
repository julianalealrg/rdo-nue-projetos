import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  Users,
  ArrowRight,
} from "lucide-react";
import { fetchDashboardData } from "@/lib/dashboard";
import { formatarDataRelativa, formatarDataCurta } from "@/lib/datas";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardData,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl text-nue-black sm:text-3xl">Início</h1>
          <p className="text-[15px] text-nue-graphite">Carregando dashboard…</p>
        </header>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl text-nue-black sm:text-3xl">Início</h1>
          <p className="text-[15px] text-danger">
            {error instanceof Error ? error.message : "Erro ao carregar dashboard."}
          </p>
        </header>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl text-nue-black">Início</h1>
        <p className="text-[15px] text-nue-graphite">
          Visão geral das obras e atividade da equipe
        </p>
      </header>

      <Grafico14Dias serie={data.serie14Dias} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RdosRecentes rdos={data.rdosRecentes} />
        <ObrasSemRegistro obras={data.obrasSemRegistro} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PendenciasCriticas pendencias={data.pendenciasCriticas} />
        <AtividadeSupervisores supervisores={data.atividadeSupervisores} />
      </div>
    </div>
  );
}

type CardProps = {
  titulo: string;
  icone: React.ReactNode;
  acessorio?: React.ReactNode;
  vazio?: string | null;
  itens: number;
  children: React.ReactNode;
};

function Card({ titulo, icone, acessorio, vazio, itens, children }: CardProps) {
  return (
    <section className="flex flex-col rounded-sm border border-nue-taupe bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-nue-taupe px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-nue-graphite">{icone}</span>
          <h2 className="text-[15px] font-medium text-nue-black">{titulo}</h2>
        </div>
        {acessorio}
      </header>
      <div className="flex-1 p-0">
        {itens === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-nue-graphite/70">
            {vazio ?? "Sem registros."}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function RdosRecentes({
  rdos,
}: {
  rdos: import("@/lib/dashboard").DashboardRdoRecente[];
}) {
  return (
    <Card
      titulo="RDOs recentes"
      icone={<ClipboardList className="h-4 w-4" />}
      itens={rdos.length}
      vazio="Nenhum RDO registrado ainda."
    >
      <ul className="divide-y divide-nue-taupe/60">
        {rdos.map((r) => (
          <li key={r.id}>
            <Link
              to="/rdo/$id"
              params={{ id: r.id }}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-nue-offwhite"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-nue-black">{r.cliente}</p>
                <p className="text-[12px] text-nue-graphite">
                  {formatarDataCurta(r.data)}
                  {r.supervisor_iniciais
                    ? ` · ${r.supervisor_iniciais}`
                    : ""}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-nue-graphite/60" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ObrasSemRegistro({
  obras,
}: {
  obras: import("@/lib/dashboard").DashboardObraSemRegistro[];
}) {
  return (
    <Card
      titulo="Obras sem registro 7+ dias"
      icone={<AlertTriangle className="h-4 w-4 text-warning" />}
      itens={obras.length}
      vazio="Todas as obras ativas têm RDO recente."
    >
      <ul className="divide-y divide-nue-taupe/60">
        {obras.map((o) => (
          <li key={o.id}>
            <Link
              to="/obra/$id"
              params={{ id: o.id }}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-nue-offwhite"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-nue-black">{o.cliente}</p>
                <p className="text-[12px] text-nue-graphite">
                  {o.dias_sem_registro === null
                    ? "Sem RDO"
                    : `${o.dias_sem_registro} dias sem registro`}
                  {o.supervisor_iniciais ? ` · ${o.supervisor_iniciais}` : ""}
                </p>
              </div>
              <span className="shrink-0 rounded-sm bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                {o.dias_sem_registro === null
                  ? "—"
                  : `${o.dias_sem_registro}d`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PendenciasCriticas({
  pendencias,
}: {
  pendencias: import("@/lib/dashboard").DashboardPendenciaCritica[];
}) {
  return (
    <Card
      titulo="Pendências críticas"
      icone={<AlertTriangle className="h-4 w-4 text-danger" />}
      itens={pendencias.length}
      vazio="Sem pendências de prioridade alta abertas."
    >
      <ul className="divide-y divide-nue-taupe/60">
        {pendencias.slice(0, 8).map((p) => (
          <li key={p.id}>
            <Link
              to="/rdo/$id"
              params={{ id: p.rdo_id }}
              className="block px-4 py-3 hover:bg-nue-offwhite"
            >
              <p className="text-sm text-nue-black line-clamp-2">{p.descricao}</p>
              <p className="mt-1 text-[12px] text-nue-graphite">
                {p.cliente}
                {p.ambiente_nome ? ` · ${p.ambiente_nome}` : ""}
                {p.data_rdo ? ` · ${formatarDataRelativa(p.data_rdo)}` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AtividadeSupervisores({
  supervisores,
}: {
  supervisores: import("@/lib/dashboard").DashboardAtividadeSupervisor[];
}) {
  const max = Math.max(1, ...supervisores.map((s) => s.rdos_semana));
  return (
    <Card
      titulo="Atividade por supervisor (esta semana)"
      icone={<Users className="h-4 w-4" />}
      itens={supervisores.length}
      vazio="Nenhum supervisor cadastrado."
    >
      <ul className="space-y-3 px-4 py-4">
        {supervisores.map((s) => {
          const pct = (s.rdos_semana / max) * 100;
          return (
            <li key={s.supervisor_id} className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-nue-black">{s.nome}</span>
                <span className="text-[12px] text-nue-graphite">
                  {s.rdos_semana} RDO{s.rdos_semana === 1 ? "" : "s"}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-sm bg-nue-taupe/40">
                <div
                  className="h-full bg-nue-graphite"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Grafico14Dias({
  serie,
}: {
  serie: import("@/lib/dashboard").DashboardSerieDia[];
}) {
  const max = useMemo(
    () => Math.max(1, ...serie.map((d) => d.total)),
    [serie],
  );
  const totalPeriodo = serie.reduce((acc, d) => acc + d.total, 0);

  return (
    <section className="rounded-sm border border-nue-taupe bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-nue-taupe px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-nue-graphite" />
          <h2 className="text-[15px] font-medium text-nue-black">
            RDOs por dia (últimos 14 dias)
          </h2>
        </div>
        <span className="text-[12px] text-nue-graphite">
          Total: {totalPeriodo}
        </span>
      </header>
      <div className="px-4 py-4">
        <div className="flex h-32 items-end gap-1.5">
          {serie.map((d) => {
            const altura = (d.total / max) * 100;
            const [, m, dia] = d.data.split("-");
            return (
              <div
                key={d.data}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${formatarDataCurta(d.data)} · ${d.total} RDO${d.total === 1 ? "" : "s"}`}
              >
                <div className="flex h-full w-full items-end">
                  <div
                    className={
                      d.total === 0
                        ? "h-[2px] w-full bg-nue-taupe/60"
                        : "w-full rounded-t-sm bg-nue-graphite"
                    }
                    style={d.total > 0 ? { height: `${altura}%` } : undefined}
                  />
                </div>
                <span className="text-[10px] text-nue-graphite/70">
                  {dia}/{m}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

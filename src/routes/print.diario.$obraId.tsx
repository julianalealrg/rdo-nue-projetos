import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { fetchDiarioObra, type RdoCompleto } from "@/lib/diario";
import { Cover, Sheet } from "@/components/print/PageChrome";
import { RDOv1, RDOv3 } from "@/components/print/RdoVariants";
import { formatarDataCurta, horaAgoraRecife } from "@/lib/datas";
import "@/styles/print.css";

type SearchParams = {
  variant?: "v1" | "v3";
  auto?: "1" | "0";
};

export const Route = createFileRoute("/print/diario/$obraId")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    variant: search.variant === "v3" ? "v3" : "v1",
    auto: search.auto === "0" ? "0" : "1",
  }),
  component: PrintDiarioPage,
});

function PrintDiarioPage() {
  const { obraId } = Route.useParams();
  const { variant = "v1", auto = "1" } = Route.useSearch();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["print-diario", obraId],
    queryFn: () => fetchDiarioObra(obraId),
  });

  const periodo = useMemo(() => {
    if (!data) return "—";
    const datas = data.rdos.map((r) => r.data).sort();
    if (datas.length === 0) return "—";
    const primeiro = formatarDataCurta(datas[0]);
    const ultimo = formatarDataCurta(datas[datas.length - 1]);
    return primeiro === ultimo ? primeiro : `${primeiro} – ${ultimo}`;
  }, [data]);

  const exportadoEm = useMemo(() => {
    const hoje = formatarDataCurta(new Date().toISOString().slice(0, 10));
    return `${hoje}, ${horaAgoraRecife()}`;
  }, []);

  // Auto-print quando carregado
  useEffect(() => {
    if (!data || auto !== "1") return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [data, auto]);

  if (isLoading) {
    return (
      <div className="print-root">
        <div className="print-doc">
          <div className="print-sheet">
            <div style={{ padding: "20mm", textAlign: "center" }}>
              Carregando relatório…
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="print-root">
        <div className="print-doc">
          <div className="print-sheet">
            <div style={{ padding: "20mm", textAlign: "center" }}>
              {error instanceof Error
                ? error.message
                : "Erro ao carregar diário."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { obra, rdos } = data;
  const sheets: Array<{ kind: "cover" } | { kind: "rdo"; rdo: RdoCompleto }> =
    [{ kind: "cover" }, ...rdos.map((r) => ({ kind: "rdo" as const, rdo: r }))];
  const total = sheets.length;

  return (
    <div className="print-root">
      <div className="print-doc">
        {sheets.map((s, i) => (
          <Sheet
            key={i}
            pageNum={i + 1}
            totalPages={total}
            obra={obra}
            periodo={periodo}
            exportadoEm={exportadoEm}
            showFooter={s.kind !== "cover"}
          >
            {s.kind === "cover" ? (
              <Cover obra={obra} rdos={rdos} periodo={periodo} />
            ) : variant === "v3" ? (
              <RDOv3 rdo={s.rdo} />
            ) : (
              <RDOv1 rdo={s.rdo} />
            )}
          </Sheet>
        ))}
      </div>
    </div>
  );
}

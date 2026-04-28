import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { fetchRdoCompleto } from "@/lib/rdo";
import { Cover, Sheet } from "@/components/print/PageChrome";
import { RDOv1, RDOv3 } from "@/components/print/RdoVariants";
import { formatarDataCurta, horaAgoraRecife } from "@/lib/datas";
import "@/styles/print.css";

type SearchParams = {
  variant?: "v1" | "v3";
  auto?: "1" | "0";
};

export const Route = createFileRoute("/print/rdo/$rdoId")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    variant: search.variant === "v3" ? "v3" : "v1",
    auto: search.auto === "0" ? "0" : "1",
  }),
  component: PrintRdoPage,
});

function PrintRdoPage() {
  const { rdoId } = Route.useParams();
  const { variant = "v1", auto = "1" } = Route.useSearch();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["print-rdo", rdoId],
    queryFn: () => fetchRdoCompleto(rdoId),
  });

  const periodo = useMemo(() => {
    if (!data) return "—";
    return formatarDataCurta(data.rdo.data);
  }, [data]);

  const exportadoEm = useMemo(() => {
    const hoje = formatarDataCurta(new Date().toISOString().slice(0, 10));
    return `${hoje}, ${horaAgoraRecife()}`;
  }, []);

  useEffect(() => {
    if (!data) return;
    const cliente = data.obra.nome_cliente.replace(/[^a-zA-Z0-9 ]/g, "").trim();
    const dataCurta = formatarDataCurta(data.rdo.data).replace(/\//g, "-");
    document.title = `${data.rdo.id} - ${cliente} - ${dataCurta}`;
  }, [data]);

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
              Carregando RDO…
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
              {error instanceof Error ? error.message : "Erro ao carregar RDO."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { rdo, obra } = data;

  return (
    <div className="print-root">
      <div className="print-doc">
        <Sheet
          pageNum={1}
          totalPages={1}
          obra={obra}
          periodo={periodo}
          exportadoEm={exportadoEm}
          showFooter={true}
        >
          {variant === "v3" ? <RDOv3 rdo={rdo} /> : <RDOv1 rdo={rdo} />}
        </Sheet>
      </div>
    </div>
  );
}

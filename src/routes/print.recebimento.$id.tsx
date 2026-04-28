import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { fetchRecebimentoCompleto } from "@/lib/recebimentos";
import { fetchDiarioObraResumo } from "@/lib/diario";
import { Sheet } from "@/components/print/PageChrome";
import { formatarDataCurta, horaAgoraRecife } from "@/lib/datas";
import "@/styles/print.css";

type SearchParams = { auto?: "1" | "0" };

export const Route = createFileRoute("/print/recebimento/$id")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    auto: search.auto === "0" ? "0" : "1",
  }),
  component: PrintRecebimentoPage,
});

function PrintRecebimentoPage() {
  const { id } = Route.useParams();
  const { auto = "1" } = Route.useSearch();

  const { data: rec, isLoading: loadRec, isError: errRec, error: errR } = useQuery({
    queryKey: ["print-recebimento", id],
    queryFn: () => fetchRecebimentoCompleto(id),
  });

  const { data: obraData, isLoading: loadObra } = useQuery({
    queryKey: ["print-recebimento-obra", rec?.obra_id],
    queryFn: () => fetchDiarioObraResumo(rec!.obra_id),
    enabled: !!rec?.obra_id,
  });

  const periodo = useMemo(() => {
    if (!rec) return "—";
    return formatarDataCurta(rec.data);
  }, [rec]);

  const exportadoEm = useMemo(() => {
    const hoje = formatarDataCurta(new Date().toISOString().slice(0, 10));
    return `${hoje}, ${horaAgoraRecife()}`;
  }, []);

  useEffect(() => {
    if (!rec || !obraData || auto !== "1") return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [rec, obraData, auto]);

  if (loadRec || loadObra) {
    return (
      <div className="print-root">
        <div className="print-doc">
          <div className="print-sheet">
            <div style={{ padding: "20mm", textAlign: "center" }}>Carregando…</div>
          </div>
        </div>
      </div>
    );
  }

  if (errRec || !rec || !obraData) {
    return (
      <div className="print-root">
        <div className="print-doc">
          <div className="print-sheet">
            <div style={{ padding: "20mm", textAlign: "center" }}>
              {errR instanceof Error ? errR.message : "Erro ao carregar"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="print-root">
      <div className="print-doc">
        <Sheet
          pageNum={1}
          totalPages={1}
          obra={obraData.obra}
          periodo={periodo}
          exportadoEm={exportadoEm}
          showFooter={true}
        >
          <article className="rdo">
            <header className="rdo-head">
              <div>
                <div className="rdo-eyebrow">Relatório de Recebimento</div>
                <div className="rdo-id">{rec.id.slice(0, 8).toUpperCase()}</div>
              </div>
              <div className="rdo-meta">
                <div>
                  <b>{formatarDataCurta(rec.data)}</b>
                </div>
                <div>{obraData.obra.nome_cliente}</div>
              </div>
            </header>

            {rec.teve_avaria && (
              <div
                style={{
                  marginTop: "4mm",
                  padding: "3mm 4mm",
                  border: "0.4mm solid #A07B3F",
                  background: "#F1E9DA",
                  fontSize: "10pt",
                }}
              >
                <strong>Atenção:</strong> recebimento com avaria.
              </div>
            )}

            {rec.descricao.trim() && (
              <section style={{ marginTop: "5mm" }}>
                <h3
                  style={{
                    fontSize: "9pt",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#6B6E63",
                    marginBottom: "2mm",
                  }}
                >
                  Descrição
                </h3>
                <p style={{ whiteSpace: "pre-wrap", fontSize: "10pt", lineHeight: 1.4 }}>
                  {rec.descricao}
                </p>
              </section>
            )}

            {rec.teve_avaria && rec.observacao_avaria.trim() && (
              <section style={{ marginTop: "5mm" }}>
                <h3
                  style={{
                    fontSize: "9pt",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#A07B3F",
                    marginBottom: "2mm",
                  }}
                >
                  Detalhes da avaria
                </h3>
                <p style={{ whiteSpace: "pre-wrap", fontSize: "10pt", lineHeight: 1.4 }}>
                  {rec.observacao_avaria}
                </p>
              </section>
            )}

            {rec.fotos.length > 0 && (
              <section style={{ marginTop: "6mm" }}>
                <h3
                  style={{
                    fontSize: "9pt",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#6B6E63",
                    marginBottom: "2mm",
                  }}
                >
                  Fotos ({rec.fotos.length})
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "3mm",
                  }}
                >
                  {rec.fotos.map((foto) => (
                    <div
                      key={foto.id}
                      style={{
                        border: "0.3mm solid #D6D1CC",
                        borderRadius: "1mm",
                        overflow: "hidden",
                        aspectRatio: "4 / 3",
                        background: "#F7F8F4",
                      }}
                    >
                      <img
                        src={foto.url}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </article>
        </Sheet>
      </div>
    </div>
  );
}

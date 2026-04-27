import { useState } from "react";
import { ChevronDown, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { exportar, type EscopoArg, type TipoExport } from "@/lib/export";

type Variante = "header" | "inline";

const OPCOES: { tipo: TipoExport; label: string }[] = [
  { tipo: "pdf-completo", label: "Imprimir relatório (PDF)" },
  { tipo: "pdf-detalhado", label: "Imprimir relatório detalhado (PDF)" },
  { tipo: "pdf-sem-fotos", label: "Imprimir relatório sem fotos (PDF)" },
  { tipo: "excel", label: "Excel (xlsx)" },
];

export function ExportarMenu({
  escopo,
  variante = "header",
  rotulo,
}: {
  escopo: EscopoArg;
  variante?: Variante;
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [gerando, setGerando] = useState(false);

  async function handle(tipo: TipoExport) {
    setAberto(false);
    if (gerando) return;
    setGerando(true);
    const toastId = toast.loading("Gerando relatório...");
    try {
      await exportar({ tipo, escopo });
      toast.success("Relatório baixado", { id: toastId });
    } catch (err) {
      toast.error(
        `Não foi possível gerar o relatório: ${
          err instanceof Error ? err.message : "erro desconhecido"
        }`,
        { id: toastId },
      );
    } finally {
      setGerando(false);
    }
  }

  const labelBotao =
    rotulo ?? (variante === "header" ? "Exportar" : "Imprimir");
  const Icon = variante === "header" ? Download : Printer;

  const triggerCls =
    variante === "header"
      ? "inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-nue-graphite bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30 disabled:opacity-60"
      : "inline-flex items-center gap-1.5 text-[13px] text-nue-black hover:underline disabled:opacity-60";

  return (
    <div className="relative">
      <button
        type="button"
        disabled={gerando}
        onClick={() => setAberto((a) => !a)}
        className={triggerCls}
      >
        <Icon className={variante === "header" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {gerando ? "Gerando..." : labelBotao}
        <ChevronDown className={variante === "header" ? "h-3.5 w-3.5" : "h-3 w-3"} />
      </button>
      {aberto && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setAberto(false)}
            aria-hidden
          />
          <div
            className={
              "absolute top-full z-20 mt-1 min-w-[260px] rounded-sm border border-nue-taupe bg-white shadow-md " +
              (variante === "header" ? "right-0" : "left-0")
            }
          >
            <ul className="py-1">
              {OPCOES.map((o) => (
                <li key={o.tipo}>
                  <button
                    type="button"
                    onClick={() => handle(o.tipo)}
                    className="block w-full px-3 py-2 text-left text-sm text-nue-black hover:bg-nue-offwhite"
                  >
                    {o.label}
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

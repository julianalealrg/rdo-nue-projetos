import type { RdoCompleto, ObraComSupervisor } from "@/lib/diario";
import { exportarExcel } from "./excel";

export type TipoExport = "pdf-cliente" | "pdf-tecnico" | "excel";

export type EscopoArg =
  | { tipo: "diario"; obra: ObraComSupervisor; rdos: RdoCompleto[] }
  | { tipo: "rdo"; obra: ObraComSupervisor; rdo: RdoCompleto };

function variantFor(tipo: Exclude<TipoExport, "excel">): "v1" | "v3" {
  return tipo === "pdf-tecnico" ? "v3" : "v1";
}

function urlPrint(args: {
  escopo: EscopoArg;
  variant: "v1" | "v3";
}): string {
  const { escopo, variant } = args;
  if (escopo.tipo === "diario") {
    return `/print/diario/${encodeURIComponent(escopo.obra.id)}?variant=${variant}`;
  }
  return `/print/rdo/${encodeURIComponent(escopo.rdo.id)}?variant=${variant}`;
}

export async function exportar(args: {
  tipo: TipoExport;
  escopo: EscopoArg;
}): Promise<void> {
  const { tipo, escopo } = args;

  if (tipo === "excel") {
    await exportarExcel(
      escopo.tipo === "diario"
        ? { escopo: "diario", obra: escopo.obra, rdos: escopo.rdos }
        : {
            escopo: "rdo",
            obra: escopo.obra,
            rdos: [escopo.rdo],
            rdo: escopo.rdo,
          },
    );
    return;
  }

  // PDF: abre rota de print em nova aba; auto-print acontece após carregar
  const url = urlPrint({ escopo, variant: variantFor(tipo) });
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    throw new Error(
      "O navegador bloqueou a nova aba. Permita pop-ups para este site.",
    );
  }
}

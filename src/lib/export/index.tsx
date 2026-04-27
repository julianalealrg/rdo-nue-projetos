import type { RdoCompleto, ObraComSupervisor } from "@/lib/diario";
import {
  hojeRecifeArquivo,
  preloadImagens,
  sanitize,
} from "./utils";
import { exportarExcel } from "./excel";
import logoUrl from "@/assets/logo-nue-projetos.svg?url";

export type TipoExport =
  | "pdf-completo"
  | "pdf-detalhado"
  | "pdf-sem-fotos"
  | "excel";

export type EscopoArg =
  | { tipo: "diario"; obra: ObraComSupervisor; rdos: RdoCompleto[] }
  | { tipo: "rdo"; obra: ObraComSupervisor; rdo: RdoCompleto };

function nomePdf(args: {
  escopo: "diario" | "rdo";
  obra: ObraComSupervisor;
  rdoId?: string;
  variant: "completo" | "detalhado" | "sem-fotos";
}): string {
  const cliente = sanitize(args.obra.nome_cliente);
  const sufixo =
    args.variant === "detalhado"
      ? "-detalhado"
      : args.variant === "sem-fotos"
        ? "-sem-fotos"
        : "";
  if (args.escopo === "rdo" && args.rdoId) {
    return `rdo-${sanitize(args.rdoId)}-${cliente}${sufixo}.pdf`;
  }
  return `diario-${sanitize(args.obra.id)}-${cliente}-${hojeRecifeArquivo()}${sufixo}.pdf`;
}

async function carregarLogoComoDataUrl(): Promise<string | null> {
  try {
    const r = await fetch(logoUrl);
    if (!r.ok) return null;
    const text = await r.text();
    // Inline SVG como dataURL (react-pdf aceita PNG/JPG; pra SVG precisamos rasterizar)
    return await rasterizarSvg(text);
  } catch {
    return null;
  }
}

async function rasterizarSvg(svgText: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([svgText], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const w = img.width || 240;
        const h = img.height || 80;
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
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
        : { escopo: "rdo", obra: escopo.obra, rdos: [escopo.rdo], rdo: escopo.rdo },
    );
    return;
  }

  const variant: "completo" | "detalhado" | "sem-fotos" =
    tipo === "pdf-detalhado"
      ? "detalhado"
      : tipo === "pdf-sem-fotos"
        ? "sem-fotos"
        : "completo";

  const rdos = escopo.tipo === "diario" ? escopo.rdos : [escopo.rdo];

  // Pré-carregar imagens (se variante usa fotos)
  const urls: string[] = [];
  if (variant !== "sem-fotos") {
    for (const r of rdos) for (const f of r.fotos) urls.push(f.url);
  }
  for (const r of rdos) if (r.assinatura_url) urls.push(r.assinatura_url);

  const fotosCache = await preloadImagens(urls);
  const logoDataUrl = await carregarLogoComoDataUrl();

  const [{ pdf }, { DocumentoPdf }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./pdf-completo"),
  ]);

  const doc = (
    <DocumentoPdf
      obra={escopo.obra}
      rdos={rdos}
      escopo={escopo.tipo}
      rdoUnico={escopo.tipo === "rdo" ? escopo.rdo : undefined}
      fotosCache={fotosCache}
      logoDataUrl={logoDataUrl}
      variant={variant}
    />
  );

  const blob = await pdf(doc).toBlob();
  const { saveAs } = await import("file-saver");
  saveAs(
    blob,
    nomePdf({
      escopo: escopo.tipo,
      obra: escopo.obra,
      rdoId: escopo.tipo === "rdo" ? escopo.rdo.id : undefined,
      variant,
    }),
  );
}

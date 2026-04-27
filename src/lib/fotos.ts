import { supabase } from "@/integrations/supabase/client";
import type { RdoFoto } from "@/lib/diario";

const BUCKET = "rdo-fotos";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DIM = 2000;
const QUALITY = 0.85;

export class ArquivoMuitoGrandeError extends Error {
  constructor(public nomeArquivo: string) {
    super(`Arquivo muito grande: ${nomeArquivo}`);
    this.name = "ArquivoMuitoGrandeError";
  }
}

function uuidv4(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Comprime a imagem para no máximo MAX_DIM no maior lado, JPEG quality 0.85. */
async function comprimirImagem(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Falha ao carregar imagem"));
      i.src = url;
    });

    const maior = Math.max(img.width, img.height);
    if (maior <= MAX_DIM && file.type === "image/jpeg") {
      return file;
    }

    const ratio = maior > MAX_DIM ? MAX_DIM / maior : 1;
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    ctx.drawImage(img, 0, 0, w, h);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error("Falha ao comprimir"));
          else resolve(blob);
        },
        "image/jpeg",
        QUALITY,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadFoto(args: {
  file: File;
  obra_id: string;
  rdo_id: string;
  ordem: number;
  ambiente?: string;
}): Promise<RdoFoto> {
  if (args.file.size > MAX_BYTES) {
    throw new ArquivoMuitoGrandeError(args.file.name);
  }
  const blob = await comprimirImagem(args.file);
  const id = uuidv4();
  const path = `${args.obra_id}/${args.rdo_id}/${id}.jpg`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw new Error(`Falha no upload: ${upErr.message}`);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const { data: inserted, error: insErr } = await supabase
    .from("rdo_fotos")
    .insert({
      rdo_id: args.rdo_id,
      url,
      legenda: "",
      ambiente: args.ambiente ?? "",
      ordem: args.ordem,
    })
    .select("*")
    .single();
  if (insErr || !inserted) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`Falha ao registrar foto: ${insErr?.message ?? "erro"}`);
  }
  return inserted as RdoFoto;
}

/** Extrai o caminho do bucket a partir da URL pública. */
export function extrairPathFoto(url: string): string | null {
  const idx = url.indexOf(`/${BUCKET}/`);
  if (idx === -1) return null;
  return url.slice(idx + BUCKET.length + 2);
}

export async function removerFoto(foto: RdoFoto): Promise<void> {
  const path = extrairPathFoto(foto.url);
  const { error } = await supabase.from("rdo_fotos").delete().eq("id", foto.id);
  if (error) throw new Error(`Falha ao remover foto: ${error.message}`);
  if (path) {
    await supabase.storage.from("rdo-fotos").remove([path]);
  }
}

export async function atualizarFotoCampos(args: {
  id: string;
  legenda?: string;
  ambiente?: string;
}): Promise<void> {
  const patch: { legenda?: string; ambiente?: string } = {};
  if (args.legenda !== undefined) patch.legenda = args.legenda;
  if (args.ambiente !== undefined) patch.ambiente = args.ambiente;
  const { error } = await supabase
    .from("rdo_fotos")
    .update(patch)
    .eq("id", args.id);
  if (error) throw new Error(`Falha ao atualizar foto: ${error.message}`);
}

export async function persistirOrdemFotos(fotos: RdoFoto[]): Promise<void> {
  const updates = fotos.map((f, i) =>
    supabase.from("rdo_fotos").update({ ordem: i }).eq("id", f.id),
  );
  const results = await Promise.all(updates);
  for (const r of results) {
    if (r.error) throw new Error(`Falha ao reordenar: ${r.error.message}`);
  }
}

/** Renomeia em massa todas as fotos de um RDO de um ambiente para outro. */
export async function renomearAmbienteRdo(args: {
  rdo_id: string;
  de: string;
  para: string;
}): Promise<void> {
  const { error } = await supabase
    .from("rdo_fotos")
    .update({ ambiente: args.para })
    .eq("rdo_id", args.rdo_id)
    .eq("ambiente", args.de);
  if (error) throw new Error(`Falha ao renomear ambiente: ${error.message}`);
}

/** Move todas as fotos de um ambiente do RDO para "" (sem ambiente). */
export async function limparAmbienteRdo(args: {
  rdo_id: string;
  ambiente: string;
}): Promise<void> {
  const { error } = await supabase
    .from("rdo_fotos")
    .update({ ambiente: "" })
    .eq("rdo_id", args.rdo_id)
    .eq("ambiente", args.ambiente);
  if (error) throw new Error(`Falha ao limpar ambiente: ${error.message}`);
}

/** Lista os nomes de ambientes já usados nos RDOs da mesma obra (sem repetir, sem vazios). */
export async function fetchAmbientesDaObra(obra_id: string): Promise<string[]> {
  const { data: rdosObra, error: errRdos } = await supabase
    .from("rdos")
    .select("id")
    .eq("obra_id", obra_id);
  if (errRdos) throw new Error(`Falha ao listar RDOs: ${errRdos.message}`);
  const ids = (rdosObra ?? []).map((r) => r.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("rdo_fotos")
    .select("ambiente")
    .in("rdo_id", ids)
    .neq("ambiente", "");
  if (error) throw new Error(`Falha ao listar ambientes: ${error.message}`);

  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.ambiente) set.add(row.ambiente);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/* ------------- Assinatura ------------- */

const BUCKET_ASS = "rdo-assinaturas";

export async function uploadAssinatura(args: {
  rdo_id: string;
  blob: Blob;
}): Promise<string> {
  const path = `${args.rdo_id}.png`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET_ASS)
    .upload(path, args.blob, {
      contentType: "image/png",
      upsert: true,
    });
  if (upErr) throw new Error(`Falha ao salvar assinatura: ${upErr.message}`);

  const { data: pub } = supabase.storage.from(BUCKET_ASS).getPublicUrl(path);
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updErr } = await supabase
    .from("rdos")
    .update({ assinatura_url: url })
    .eq("id", args.rdo_id);
  if (updErr) throw new Error(`Falha ao atualizar RDO: ${updErr.message}`);

  return url;
}

import { supabase } from "@/integrations/supabase/client";

// NOTE: tipos manuais até regenerar types do Supabase. Lovable
// vai regenerar quando aplicar a migration; aí esses tipos podem
// ser substituídos por Tables<"recebimentos"> e Tables<"recebimento_fotos">.
export type Recebimento = {
  id: string;
  obra_id: string;
  data: string;
  descricao: string;
  teve_avaria: boolean;
  observacao_avaria: string;
  criado_por_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RecebimentoFoto = {
  id: string;
  recebimento_id: string;
  url: string;
  legenda: string;
  ordem: number;
  created_at: string;
};

export type RecebimentoCompleto = Recebimento & {
  fotos: RecebimentoFoto[];
};

export type RecebimentoResumo = Recebimento & {
  total_fotos: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const BUCKET = "rdo-fotos";

export async function listarRecebimentosPorObra(
  obraId: string,
): Promise<RecebimentoResumo[]> {
  const { data: recs, error } = await sb
    .from("recebimentos")
    .select("*")
    .eq("obra_id", obraId)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar recebimentos: ${error.message}`);

  const recebimentos = (recs ?? []) as Recebimento[];
  if (recebimentos.length === 0) return [];

  const ids = recebimentos.map((r) => r.id);
  const { data: fotos, error: errF } = await sb
    .from("recebimento_fotos")
    .select("recebimento_id")
    .in("recebimento_id", ids);
  if (errF) throw new Error(`Falha ao contar fotos: ${errF.message}`);

  const totalPorRec = new Map<string, number>();
  for (const f of (fotos ?? []) as { recebimento_id: string }[]) {
    totalPorRec.set(f.recebimento_id, (totalPorRec.get(f.recebimento_id) ?? 0) + 1);
  }

  return recebimentos.map((r) => ({
    ...r,
    total_fotos: totalPorRec.get(r.id) ?? 0,
  }));
}

export async function fetchRecebimentoCompleto(id: string): Promise<RecebimentoCompleto> {
  const { data: rec, error } = await sb
    .from("recebimentos")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !rec) throw new Error(`Recebimento não encontrado`);

  const { data: fotos, error: errF } = await sb
    .from("recebimento_fotos")
    .select("*")
    .eq("recebimento_id", id)
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (errF) throw new Error(`Falha ao carregar fotos: ${errF.message}`);

  return { ...(rec as Recebimento), fotos: (fotos ?? []) as RecebimentoFoto[] };
}

export async function criarRecebimento(args: {
  obra_id: string;
  data: string;
  descricao: string;
  teve_avaria: boolean;
  observacao_avaria: string;
}): Promise<string> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;

  const { data, error } = await sb
    .from("recebimentos")
    .insert({
      obra_id: args.obra_id,
      data: args.data,
      descricao: args.descricao,
      teve_avaria: args.teve_avaria,
      observacao_avaria: args.observacao_avaria,
      criado_por_user_id: userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Falha ao criar: ${error?.message ?? "erro"}`);
  return (data as { id: string }).id;
}

export async function atualizarRecebimento(
  id: string,
  campos: {
    data?: string;
    descricao?: string;
    teve_avaria?: boolean;
    observacao_avaria?: string;
  },
): Promise<void> {
  const { error } = await sb.from("recebimentos").update(campos).eq("id", id);
  if (error) throw new Error(`Falha ao atualizar: ${error.message}`);
}

export async function deletarRecebimento(id: string): Promise<void> {
  // CASCADE no banco já deleta recebimento_fotos
  const { error } = await sb.from("recebimentos").delete().eq("id", id);
  if (error) throw new Error(`Falha ao deletar: ${error.message}`);
}

const MAX_BYTES = 10 * 1024 * 1024;
const TARGET_LONG = 1920;
const QUALITY = 0.85;

async function comprimirImagem(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Imagem inválida"));
      i.src = url;
    });
    const ratio = Math.min(1, TARGET_LONG / Math.max(img.width, img.height));
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
        (b) => (b ? resolve(b) : reject(new Error("Falha ao comprimir"))),
        "image/jpeg",
        QUALITY,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadFotoRecebimento(args: {
  file: File;
  obra_id: string;
  recebimento_id: string;
  ordem: number;
}): Promise<RecebimentoFoto> {
  if (args.file.size > MAX_BYTES) {
    throw new Error(`Arquivo "${args.file.name}" maior que 10 MB`);
  }
  const blob = await comprimirImagem(args.file);
  const path = `${args.obra_id}/recebimentos/${args.recebimento_id}/${crypto.randomUUID()}.jpg`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw new Error(`Upload: ${upErr.message}`);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const { data: inserted, error: insErr } = await sb
    .from("recebimento_fotos")
    .insert({
      recebimento_id: args.recebimento_id,
      url,
      legenda: "",
      ordem: args.ordem,
    })
    .select("*")
    .single();
  if (insErr || !inserted) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`Falha ao registrar foto: ${insErr?.message ?? "erro"}`);
  }
  return inserted as RecebimentoFoto;
}

function extrairPathFoto(url: string): string | null {
  const idx = url.indexOf(`/${BUCKET}/`);
  if (idx === -1) return null;
  return url.slice(idx + BUCKET.length + 2);
}

export async function removerFotoRecebimento(foto: RecebimentoFoto): Promise<void> {
  const path = extrairPathFoto(foto.url);
  const { error } = await sb.from("recebimento_fotos").delete().eq("id", foto.id);
  if (error) throw new Error(`Falha ao remover foto: ${error.message}`);
  if (path) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
  }
}

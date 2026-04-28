import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ObraStatus = Tables<"obras">["status"];

export async function atualizarStatusObra(
  obraId: string,
  status: ObraStatus,
  motivoPausa: string,
): Promise<void> {
  const { error } = await supabase
    .from("obras")
    .update({
      status,
      motivo_pausa: status === "pausada" ? motivoPausa : "",
    })
    .eq("id", obraId);
  if (error) throw new Error(`Falha ao atualizar status: ${error.message}`);
}

export async function atualizarOneDriveUrl(obraId: string, url: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("obras")
    .update({ onedrive_url: url })
    .eq("id", obraId);
  if (error) throw new Error(`Falha ao atualizar link OneDrive: ${error.message}`);
}

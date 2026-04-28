import { supabase } from "@/integrations/supabase/client";

/** Gera (ou retorna o existente ativo) token compartilhável da obra. */
export async function gerarShareTokenObra(obraId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("gerar_share_token_obra", {
    p_obra_id: obraId,
  });
  if (error) throw new Error(`Falha ao gerar token: ${error.message}`);
  return data as string;
}

/** Revoga o token ativo da obra (próxima geração cria um novo). */
export async function revogarShareTokenObra(obraId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("revogar_share_token_obra", {
    p_obra_id: obraId,
  });
  if (error) throw new Error(`Falha ao revogar token: ${error.message}`);
}

/** Resolve um token público pra obra_id (usado na rota /p/obra). */
export async function resolverShareToken(token: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("resolver_share_token", {
    p_token: token,
  });
  if (error) throw new Error(`Falha ao resolver token: ${error.message}`);
  return (data as string) ?? null;
}

export function urlPublicaObra(obraId: string, token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/p/obra/${encodeURIComponent(obraId)}?t=${encodeURIComponent(token)}`;
}

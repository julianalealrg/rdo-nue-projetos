import { supabase } from "@/integrations/supabase/client";
import type { Papel } from "@/lib/auth";

export type UsuarioPainel = {
  user_id: string;
  email: string;
  papel: Papel;
  nome: string;
  iniciais: string | null;
  ativo: boolean;
  criado_em: string;
};

// NOTE: até regenerar types do Supabase, usamos cast pra qualquer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export async function listarUsuarios(): Promise<UsuarioPainel[]> {
  const { data, error } = await sb
    .from("user_papeis")
    .select("user_id, papel, nome, iniciais, ativo, criado_em")
    .order("criado_em", { ascending: false });
  if (error) throw new Error(`Falha ao listar usuários: ${error.message}`);

  // Email vem do auth.users — não acessível direto pelo client. Vamos buscar via RPC depois,
  // ou adicionar uma view "v_usuarios" que junte. Por enquanto, mostra só nome/papel/iniciais.
  return ((data ?? []) as Array<Omit<UsuarioPainel, "email">>).map((u) => ({
    ...u,
    email: "",
  }));
}

export async function atualizarPapel(userId: string, papel: Papel): Promise<void> {
  const { error } = await sb
    .from("user_papeis")
    .update({ papel })
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao atualizar papel: ${error.message}`);
}

export async function alternarAtivo(userId: string, ativo: boolean): Promise<void> {
  const { error } = await sb
    .from("user_papeis")
    .update({ ativo })
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao atualizar status: ${error.message}`);
}

export async function atualizarPerfil(
  userId: string,
  campos: { nome?: string; iniciais?: string | null },
): Promise<void> {
  const { error } = await sb
    .from("user_papeis")
    .update(campos)
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao atualizar perfil: ${error.message}`);
}

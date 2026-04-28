import { supabase } from "@/integrations/supabase/client";
import type { Papel } from "@/lib/auth";

const FUNCTION_URL = (() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env: any = (import.meta as any).env ?? {};
  const url = env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return "";
  return `${url.replace(/\/$/, "")}/functions/v1/convidar-usuario`;
})();

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

export type ConviteInput = {
  email: string;
  nome: string;
  iniciais: string | null;
  papel: Papel;
};

export async function convidarUsuario(input: ConviteInput): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sem sessão ativa");

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Falha ${res.status}`);
  }
}

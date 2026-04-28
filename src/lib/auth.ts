import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Papel = "admin" | "supervisor" | "viewer";

// NOTE: tipo definido manualmente até regenerar types do Supabase após migration
type UserPapelRow = {
  user_id: string;
  papel: Papel;
  ativo: boolean;
  nome: string;
  iniciais: string | null;
};

export type UserSession = {
  userId: string;
  email: string;
  papel: Papel | null;
  nome: string;
  iniciais: string | null;
  ativo: boolean;
};

export async function fetchSessao(): Promise<UserSession | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: papelData } = (await sb
    .from("user_papeis")
    .select("user_id, papel, ativo, nome, iniciais")
    .eq("user_id", authData.user.id)
    .maybeSingle()) as { data: UserPapelRow | null };

  return {
    userId: authData.user.id,
    email: authData.user.email ?? "",
    papel: papelData?.papel ?? null,
    nome: papelData?.nome || authData.user.email || "",
    iniciais: papelData?.iniciais ?? null,
    ativo: papelData?.ativo ?? true,
  };
}

export function useSessao() {
  const [sessao, setSessao] = useState<UserSession | null | undefined>(undefined);

  useEffect(() => {
    let ativo = true;
    void fetchSessao().then((s) => {
      if (ativo) setSessao(s);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void fetchSessao().then((s) => {
        if (ativo) setSessao(s);
      });
    });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return sessao;
}

export async function login(email: string, senha: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(error.message);
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function enviarResetSenha(email: string) {
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
}

export function podeEscrever(sessao: UserSession | null): boolean {
  if (!sessao) return false;
  if (!sessao.ativo) return false;
  return sessao.papel === "admin" || sessao.papel === "supervisor";
}

export function ehAdmin(sessao: UserSession | null): boolean {
  if (!sessao || !sessao.ativo) return false;
  return sessao.papel === "admin";
}

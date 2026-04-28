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

async function carregarPapel(userId: string, fallbackEmail: string): Promise<{
  papel: Papel | null;
  nome: string;
  iniciais: string | null;
  ativo: boolean;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: papelData } = (await sb
    .from("user_papeis")
    .select("user_id, papel, ativo, nome, iniciais")
    .eq("user_id", userId)
    .maybeSingle()) as { data: UserPapelRow | null };
  return {
    papel: papelData?.papel ?? null,
    nome: papelData?.nome || fallbackEmail,
    iniciais: papelData?.iniciais ?? null,
    ativo: papelData?.ativo ?? true,
  };
}

export async function fetchSessao(): Promise<UserSession | null> {
  // getSession() lê do storage local (sem HTTP), evitando loops e lentidão
  const { data: sessData } = await supabase.auth.getSession();
  const user = sessData.session?.user;
  if (!user) return null;
  const extra = await carregarPapel(user.id, user.email ?? "");
  return {
    userId: user.id,
    email: user.email ?? "",
    ...extra,
  };
}

export function useSessao() {
  const [sessao, setSessao] = useState<UserSession | null | undefined>(undefined);

  useEffect(() => {
    let ativo = true;

    async function aplicar(user: { id: string; email?: string | null } | null | undefined) {
      if (!ativo) return;
      if (!user) {
        setSessao(null);
        return;
      }
      const extra = await carregarPapel(user.id, user.email ?? "");
      if (!ativo) return;
      setSessao({ userId: user.id, email: user.email ?? "", ...extra });
    }

    void supabase.auth.getSession().then(({ data }) => aplicar(data.session?.user ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // sem await aqui — só dispara fetch e atualiza estado
      void aplicar(session?.user ?? null);
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

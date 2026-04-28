// Edge Function: convidar-usuario
// Cria convite por email + popula user_papeis (e supervisores se papel=supervisor).
// Apenas admin pode chamar.

// @ts-expect-error Deno runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-expect-error Deno global
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
// @ts-expect-error Deno global
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// @ts-expect-error Deno global
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  email: string;
  nome: string;
  iniciais?: string | null;
  papel: "admin" | "supervisor" | "viewer";
  // Se senha for fornecida: cria conta direto com a senha (email_confirm=true).
  // Se vazio: manda email de invite padrão Supabase.
  senha?: string | null;
};

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResp(405, { error: "Method not allowed" });
  }

  // Valida que quem chamou é admin
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResp(401, { error: "Sem token de autenticação" });
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResp(401, { error: "Sessão inválida" });
  }
  const { data: papelCaller } = await userClient
    .from("user_papeis")
    .select("papel, ativo")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (papelCaller?.papel !== "admin" || !papelCaller.ativo) {
    return jsonResp(403, { error: "Apenas admin pode convidar" });
  }

  // Parse body
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "Body inválido" });
  }
  const { email, nome, iniciais, papel, senha } = body;
  const emailNorm = (email ?? "").trim().toLowerCase();
  if (!emailNorm || !nome || !papel) {
    return jsonResp(400, { error: "Campos obrigatórios: email, nome, papel" });
  }
  if (!["admin", "supervisor", "viewer"].includes(papel)) {
    return jsonResp(400, { error: "Papel inválido" });
  }

  // Service client (bypass RLS)
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId: string;

  if (senha && senha.length >= 6) {
    // Modo "senha definida": cria conta já confirmada, sem precisar email de convite.
    const { data: createData, error: createErr } = await sb.auth.admin.createUser({
      email: emailNorm,
      password: senha,
      email_confirm: true,
      user_metadata: { nome, iniciais: iniciais ?? null, papel },
    });
    if (createErr || !createData?.user) {
      return jsonResp(400, { error: createErr?.message ?? "Falha ao criar usuário" });
    }
    userId = createData.user.id;
  } else {
    // Modo "convite por email" (fluxo padrão Supabase invite)
    const { data: inviteData, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(emailNorm, {
      data: { nome, iniciais: iniciais ?? null, papel },
    });
    if (inviteErr || !inviteData?.user) {
      return jsonResp(400, { error: inviteErr?.message ?? "Falha ao enviar convite" });
    }
    userId = inviteData.user.id;
  }

  // Upsert em user_papeis
  const { error: papelErr } = await sb.from("user_papeis").upsert({
    user_id: userId,
    papel,
    ativo: true,
    nome,
    iniciais: iniciais ?? null,
  });
  if (papelErr) {
    return jsonResp(500, { error: `Falha ao gravar papel: ${papelErr.message}` });
  }

  // Se for supervisor, cria/upsert entry em supervisores
  if (papel === "supervisor") {
    const { data: supExistente } = await sb
      .from("supervisores")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!supExistente) {
      await sb.from("supervisores").insert({
        nome,
        iniciais: iniciais ?? "??",
        user_id: userId,
        ativo: true,
      });
    }
  }

  return jsonResp(200, { user_id: userId, email, papel });
});

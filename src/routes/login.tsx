import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { login, enviarResetSenha } from "@/lib/auth";
import logoUrl from "@/assets/logo-nue-projetos.svg";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [modoReset, setModoReset] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (carregando) return;
    setCarregando(true);
    try {
      await login(email.trim(), senha);
      router.invalidate();
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setCarregando(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (carregando) return;
    if (!email.trim()) {
      toast.error("Informe o email para receber o link de reset");
      return;
    }
    setCarregando(true);
    try {
      await enviarResetSenha(email.trim());
      toast.success("Email de reset enviado. Verifique sua caixa de entrada.");
      setModoReset(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar reset");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-nue-offwhite px-4">
      <div className="w-full max-w-sm space-y-6 rounded-sm border border-nue-taupe bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <img src={logoUrl} alt="NUE Projetos" className="h-10 w-auto" />
          <div className="text-center">
            <h1 className="text-xl text-nue-black">Sistema RDO</h1>
            <p className="text-[13px] text-nue-graphite">
              {modoReset ? "Recuperar senha" : "Entre com sua conta"}
            </p>
          </div>
        </div>

        <form onSubmit={modoReset ? handleReset : handleLogin} className="space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-nue-graphite">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="mt-1 h-10 w-full rounded-sm border border-nue-taupe bg-nue-offwhite px-3 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
            />
          </div>

          {!modoReset && (
            <div>
              <label className="block text-[12px] font-medium text-nue-graphite">Senha</label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                autoComplete="current-password"
                className="mt-1 h-10 w-full rounded-sm border border-nue-taupe bg-nue-offwhite px-3 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="inline-flex h-10 w-full items-center justify-center rounded-sm bg-nue-black text-sm font-medium text-nue-offwhite hover:opacity-90 disabled:opacity-60"
          >
            {carregando ? "Aguarde..." : modoReset ? "Enviar email de reset" : "Entrar"}
          </button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setModoReset((m) => !m)}
            className="text-[12px] text-nue-graphite hover:text-nue-black hover:underline"
          >
            {modoReset ? "Voltar para login" : "Esqueci minha senha"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, UserPlus } from "lucide-react";
import { ehAdmin, useSessao, type Papel } from "@/lib/auth";
import {
  listarUsuarios,
  atualizarPapel,
  alternarAtivo,
  atualizarPerfil,
  convidarUsuario,
  type UsuarioPainel,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/usuarios")({
  component: AdminUsuariosPage,
});

const PAPEIS: { value: Papel; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "supervisor", label: "Supervisor" },
  { value: "viewer", label: "Viewer" },
];

function AdminUsuariosPage() {
  const sessao = useSessao();

  if (sessao === undefined) {
    return <p className="p-6 text-sm text-nue-graphite">Carregando…</p>;
  }
  if (!ehAdmin(sessao ?? null)) {
    return <Navigate to="/" replace />;
  }
  return <PainelAdmin />;
}

function PainelAdmin() {
  const [convidarAberto, setConvidarAberto] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-usuarios"],
    queryFn: listarUsuarios,
  });

  function refetch() {
    void queryClient.invalidateQueries({ queryKey: ["admin-usuarios"] });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl text-nue-black sm:text-3xl">Usuários</h1>
          <p className="text-[15px] text-nue-graphite">
            Gerenciar contas, papéis e status dos membros da equipe
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConvidarAberto(true)}
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" />
          Convidar usuário
        </button>
      </header>

      {isLoading ? (
        <p className="text-sm text-nue-graphite">Carregando usuários…</p>
      ) : isError ? (
        <p className="text-sm text-danger">
          {error instanceof Error ? error.message : "Erro ao carregar"}
        </p>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="rounded-sm border border-nue-taupe bg-white p-8 text-center">
          <p className="text-sm text-nue-graphite">
            Nenhum usuário cadastrado ainda. Use "Convidar usuário" para começar.
          </p>
        </div>
      ) : (
        <ListaUsuarios usuarios={data ?? []} onChange={refetch} />
      )}

      {convidarAberto && (
        <ModalConvidar
          onClose={() => setConvidarAberto(false)}
          onConvidado={refetch}
        />
      )}
    </div>
  );
}

function ListaUsuarios({
  usuarios,
  onChange,
}: {
  usuarios: UsuarioPainel[];
  onChange: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-sm border border-nue-taupe bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-nue-taupe bg-nue-offwhite">
          <tr
            className="text-left text-[11px] uppercase text-nue-graphite"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
          >
            <th className="px-3 py-2 font-medium">Nome</th>
            <th className="px-3 py-2 font-medium">Iniciais</th>
            <th className="px-3 py-2 font-medium">Papel</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <LinhaUsuario key={u.user_id} usuario={u} onChange={onChange} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaUsuario({
  usuario,
  onChange,
}: {
  usuario: UsuarioPainel;
  onChange: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(usuario.nome);
  const [iniciais, setIniciais] = useState(usuario.iniciais ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvarPapel(novo: Papel) {
    if (novo === usuario.papel) return;
    try {
      await atualizarPapel(usuario.user_id, novo);
      toast.success("Papel atualizado");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function alternar() {
    try {
      await alternarAtivo(usuario.user_id, !usuario.ativo);
      toast.success(usuario.ativo ? "Usuário desativado" : "Usuário reativado");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function salvarPerfil() {
    setSalvando(true);
    try {
      await atualizarPerfil(usuario.user_id, {
        nome: nome.trim(),
        iniciais: iniciais.trim() || null,
      });
      toast.success("Perfil atualizado");
      setEditando(false);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <tr className="border-b border-nue-taupe/60 last:border-0">
      <td className="px-3 py-3">
        {editando ? (
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="h-8 w-full rounded-sm border border-nue-taupe bg-nue-offwhite px-2 text-sm focus:border-nue-graphite focus:outline-none"
          />
        ) : (
          <span className="text-sm text-nue-black">{usuario.nome || "—"}</span>
        )}
      </td>
      <td className="px-3 py-3">
        {editando ? (
          <input
            value={iniciais}
            onChange={(e) => setIniciais(e.target.value.toUpperCase().slice(0, 3))}
            className="h-8 w-16 rounded-sm border border-nue-taupe bg-nue-offwhite px-2 text-sm uppercase focus:border-nue-graphite focus:outline-none"
            style={{ fontFamily: "var(--font-mono)" }}
          />
        ) : (
          <span
            className="text-[12px] uppercase text-nue-graphite"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {usuario.iniciais ?? "—"}
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <select
          value={usuario.papel}
          onChange={(e) => salvarPapel(e.target.value as Papel)}
          className="h-8 rounded-sm border border-nue-taupe bg-white px-2 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
        >
          {PAPEIS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {usuario.papel === "admin" && (
          <ShieldCheck className="ml-1 inline h-3.5 w-3.5 text-nue-graphite" />
        )}
      </td>
      <td className="px-3 py-3">
        <span
          className={
            usuario.ativo
              ? "inline-flex items-center rounded-sm bg-success/15 px-2 py-0.5 text-[11px] font-medium uppercase text-success"
              : "inline-flex items-center rounded-sm bg-nue-taupe/40 px-2 py-0.5 text-[11px] font-medium uppercase text-nue-graphite"
          }
        >
          {usuario.ativo ? "Ativo" : "Inativo"}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        {editando ? (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditando(false);
                setNome(usuario.nome);
                setIniciais(usuario.iniciais ?? "");
              }}
              disabled={salvando}
              className="text-[12px] text-nue-graphite hover:underline disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvarPerfil}
              disabled={salvando}
              className="text-[12px] text-nue-black hover:underline disabled:opacity-60"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-[12px] text-nue-graphite hover:text-nue-black hover:underline"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={alternar}
              className="text-[12px] text-nue-graphite hover:text-nue-black hover:underline"
            >
              {usuario.ativo ? "Desativar" : "Reativar"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function ModalConvidar({ onClose, onConvidado }: { onClose: () => void; onConvidado: () => void }) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [iniciais, setIniciais] = useState("");
  const [papel, setPapel] = useState<Papel>("supervisor");
  const [senha, setSenha] = useState("Nue@2026");
  const [enviando, setEnviando] = useState(false);

  function gerarIniciaisAuto(nomeCompleto: string): string {
    const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (!email.trim() || !nome.trim()) {
      toast.error("Email e nome são obrigatórios");
      return;
    }
    if (senha.trim().length > 0 && senha.trim().length < 6) {
      toast.error("Senha inicial deve ter pelo menos 6 caracteres");
      return;
    }
    setEnviando(true);
    try {
      const senhaEnviada = senha.trim();
      await convidarUsuario({
        email: email.trim().toLowerCase(),
        nome: nome.trim(),
        iniciais: iniciais.trim() || gerarIniciaisAuto(nome),
        papel,
        senha: senhaEnviada || null,
      });
      if (senhaEnviada) {
        toast.success(
          `${nome} cadastrado. Passe pra ele: email "${email
            .trim()
            .toLowerCase()}", senha "${senhaEnviada}".`,
          { duration: 12000 },
        );
      } else {
        toast.success(`Convite enviado para ${email}. ${nome} vai receber o email pra criar a senha.`);
      }
      onConvidado();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar convite");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-nue-black/60 px-4">
      <div className="w-full max-w-md rounded-sm bg-white p-5 shadow-lg">
        <h2 className="text-xl text-nue-black">Convidar usuário</h2>
        <p className="mt-1 text-[13px] text-nue-graphite">
          A pessoa vai receber um email pra criar a senha. Nome e papel já ficam preenchidos.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-nue-graphite">Nome completo</label>
            <input
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (!iniciais) setIniciais(gerarIniciaisAuto(e.target.value));
              }}
              placeholder="Ex: Gustavo Braga"
              required
              className="mt-1 h-10 w-full rounded-sm border border-nue-taupe bg-nue-offwhite px-3 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-nue-graphite">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@nuesuperficies.com.br"
              required
              className="mt-1 h-10 w-full rounded-sm border border-nue-taupe bg-nue-offwhite px-3 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-nue-graphite">Iniciais</label>
              <input
                value={iniciais}
                onChange={(e) => setIniciais(e.target.value.toUpperCase().slice(0, 3))}
                placeholder="GB"
                className="mt-1 h-10 w-full rounded-sm border border-nue-taupe bg-nue-offwhite px-3 text-sm uppercase text-nue-black focus:border-nue-graphite focus:outline-none"
                style={{ fontFamily: "var(--font-mono)" }}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-nue-graphite">Papel</label>
              <select
                value={papel}
                onChange={(e) => setPapel(e.target.value as Papel)}
                className="mt-1 h-10 w-full rounded-sm border border-nue-taupe bg-white px-2 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
              >
                {PAPEIS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-nue-graphite">
              Senha inicial
            </label>
            <input
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres (deixe vazio pra mandar email de convite)"
              className="mt-1 h-10 w-full rounded-sm border border-nue-taupe bg-nue-offwhite px-3 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-nue-graphite">
              Se preencher: a conta é criada já ativa com essa senha — você passa pra pessoa via WhatsApp. Se deixar vazio: dispara email de convite (cai mais em spam).
            </p>
          </div>
          <p className="text-[11px] text-nue-graphite">
            <strong>Supervisor</strong>: cria/edita RDOs, assina como ele.{" "}
            <strong>Viewer</strong>: só lê.{" "}
            <strong>Admin</strong>: tudo.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={enviando}
              className="inline-flex h-9 items-center justify-center rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="inline-flex h-9 items-center justify-center rounded-sm bg-nue-black px-3 text-sm font-medium text-nue-offwhite hover:opacity-90 disabled:opacity-60"
            >
              {enviando ? "Enviando..." : "Enviar convite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

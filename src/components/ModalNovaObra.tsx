import { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { gerarProximoIdObra } from "@/lib/ids";
import { criarAmbientesEmLote } from "@/lib/ambientes";
import type { Supervisor } from "@/lib/painel";

const obraSchema = z.object({
  nome_cliente: z
    .string()
    .trim()
    .min(1, "Informe o nome do cliente")
    .max(200, "Nome muito longo (máx. 200 caracteres)"),
  endereco: z
    .string()
    .trim()
    .min(1, "Informe o endereço da obra")
    .max(500, "Endereço muito longo (máx. 500 caracteres)"),
  supervisor_id: z.string().uuid().nullable(),
});

type Props = {
  open: boolean;
  onClose: () => void;
  supervisores: Supervisor[];
  onCreated: (idObra: string) => void;
};

export function ModalNovaObra({ open, onClose, supervisores, onCreated }: Props) {
  const [nomeCliente, setNomeCliente] = useState("");
  const [endereco, setEndereco] = useState("");
  const [supervisorId, setSupervisorId] = useState<string>("");
  const [ambientes, setAmbientes] = useState<string[]>([]);
  const [erros, setErros] = useState<{ nome_cliente?: string; endereco?: string }>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ambienteRefs = useRef<Array<HTMLInputElement | null>>([]);
  const focarUltimoAmbienteRef = useRef(false);

  useEffect(() => {
    if (open) {
      setNomeCliente("");
      setEndereco("");
      setSupervisorId("");
      setAmbientes([]);
      setErros({});
      setErroGeral(null);
      setEnviando(false);
      // autoFocus
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (focarUltimoAmbienteRef.current && ambientes.length > 0) {
      const ultimo = ambienteRefs.current[ambientes.length - 1];
      ultimo?.focus();
      focarUltimoAmbienteRef.current = false;
    }
  }, [ambientes.length]);

  // Fechar com ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !enviando) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, enviando, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;

    const parsed = obraSchema.safeParse({
      nome_cliente: nomeCliente,
      endereco,
      supervisor_id: supervisorId || null,
    });

    if (!parsed.success) {
      const fieldErrors: typeof erros = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (path === "nome_cliente") fieldErrors.nome_cliente = issue.message;
        if (path === "endereco") fieldErrors.endereco = issue.message;
      }
      setErros(fieldErrors);
      return;
    }

    setErros({});
    setErroGeral(null);
    setEnviando(true);

    try {
      const novoId = await gerarProximoIdObra();
      const { error } = await supabase.from("obras").insert({
        id: novoId,
        nome_cliente: parsed.data.nome_cliente,
        endereco: parsed.data.endereco,
        supervisor_id: parsed.data.supervisor_id,
        status: "ativa",
      });
      if (error) {
        setErroGeral(`Não foi possível cadastrar a obra: ${error.message}`);
        setEnviando(false);
        return;
      }
      toast.success(`Obra ${novoId} cadastrada`);
      try {
        await criarAmbientesEmLote(novoId, ambientes);
      } catch (errAmb) {
        const msg = errAmb instanceof Error ? errAmb.message : "Erro";
        toast.error(`Obra criada, mas falhou ao salvar ambientes: ${msg}`);
      }
      onCreated(novoId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setErroGeral(`Não foi possível cadastrar a obra: ${msg}`);
      setEnviando(false);
    }
  }

  const semSupervisores = supervisores.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-nova-obra"
    >
      <div
        className="absolute inset-0 bg-nue-black/60"
        onClick={() => !enviando && onClose()}
        aria-hidden
      />
      <div className="relative w-full max-w-[480px] rounded-md bg-white shadow-lg">
        <header className="flex items-center justify-between border-b border-nue-taupe px-5 py-4">
          <h2
            id="titulo-modal-nova-obra"
            className="text-lg text-nue-black"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Cadastrar nova obra
          </h2>
          <button
            type="button"
            onClick={() => !enviando && onClose()}
            disabled={enviando}
            className="rounded-sm p-1 text-nue-graphite hover:bg-nue-taupe/40 disabled:opacity-40"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="px-5 py-4">
          {erroGeral && (
            <div className="mb-4 rounded-sm border border-[#8C3A2E]/30 bg-[#F1DDD8] px-3 py-2 text-sm text-[#8C3A2E]">
              {erroGeral}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="nome_cliente"
                className="mb-1 block text-xs font-medium text-nue-graphite uppercase tracking-wider"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Nome do cliente
              </label>
              <input
                ref={inputRef}
                id="nome_cliente"
                type="text"
                value={nomeCliente}
                onChange={(e) => setNomeCliente(e.target.value)}
                maxLength={200}
                disabled={enviando}
                className={`h-10 w-full rounded-sm border bg-white px-3 text-sm text-nue-black focus:outline-none focus:border-nue-graphite ${
                  erros.nome_cliente ? "border-[#8C3A2E]" : "border-nue-taupe"
                }`}
              />
              {erros.nome_cliente && (
                <p className="mt-1 text-xs text-[#8C3A2E]">{erros.nome_cliente}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="endereco"
                className="mb-1 block text-xs font-medium text-nue-graphite uppercase tracking-wider"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Endereço
              </label>
              <input
                id="endereco"
                type="text"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                maxLength={500}
                disabled={enviando}
                className={`h-10 w-full rounded-sm border bg-white px-3 text-sm text-nue-black focus:outline-none focus:border-nue-graphite ${
                  erros.endereco ? "border-[#8C3A2E]" : "border-nue-taupe"
                }`}
              />
              {erros.endereco && (
                <p className="mt-1 text-xs text-[#8C3A2E]">{erros.endereco}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="supervisor"
                className="mb-1 block text-xs font-medium text-nue-graphite uppercase tracking-wider"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Supervisor (opcional)
              </label>
              <select
                id="supervisor"
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                disabled={enviando || semSupervisores}
                className="h-10 w-full rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black focus:outline-none focus:border-nue-graphite disabled:bg-nue-taupe/20 disabled:text-nue-graphite"
              >
                <option value="">— Sem supervisor —</option>
                {supervisores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
              {semSupervisores && (
                <p className="mt-1 text-xs text-nue-graphite">
                  Cadastre supervisores em Configurações para atribuir a obra a alguém
                </p>
              )}
            </div>

            <div>
              <label
                className="mb-1 block text-xs font-medium text-nue-graphite uppercase tracking-wider"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Ambientes (opcional)
              </label>
              <p className="mb-2 text-xs text-nue-graphite">
                Cadastre os ambientes que serão trabalhados nesta obra. Você pode
                adicionar mais depois.
              </p>
              {ambientes.length > 0 && (
                <div className="space-y-2">
                  {ambientes.map((nome, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        ref={(el) => {
                          ambienteRefs.current[idx] = el;
                        }}
                        type="text"
                        value={nome}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAmbientes((prev) => {
                            const novo = [...prev];
                            novo[idx] = v;
                            return novo;
                          });
                        }}
                        disabled={enviando}
                        placeholder="Ex.: Cozinha"
                        className="h-9 flex-1 rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={enviando}
                        onClick={() => {
                          setAmbientes((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        className="rounded-sm p-1.5 text-nue-graphite hover:bg-[#F1DDD8] hover:text-[#8C3A2E] disabled:opacity-40"
                        aria-label="Remover ambiente"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                disabled={enviando}
                onClick={() => {
                  focarUltimoAmbienteRef.current = true;
                  setAmbientes((prev) => [...prev, ""]);
                }}
                className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-sm border border-nue-taupe bg-white px-3 text-xs text-nue-black hover:bg-nue-taupe/30 disabled:opacity-40"
              >
                <Plus className="h-3 w-3" />
                Adicionar ambiente
              </button>
            </div>
          </div>

          <footer className="mt-6 flex items-center justify-end gap-2 border-t border-nue-taupe pt-4 -mx-5 px-5">
            <button
              type="button"
              onClick={onClose}
              disabled={enviando}
              className="h-9 rounded-sm border border-nue-taupe bg-white px-4 text-sm text-nue-black transition-colors hover:bg-nue-taupe/40 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="h-9 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {enviando ? "Cadastrando..." : "Cadastrar obra"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

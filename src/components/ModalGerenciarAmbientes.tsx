import { useEffect, useRef, useState } from "react";
import { X, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Trash2, RotateCcw, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchAmbientesObra,
  criarAmbiente,
  renomearAmbiente,
  desativarAmbiente,
  reativarAmbiente,
  reordenarAmbientes,
  type Ambiente,
} from "@/lib/ambientes";

type Props = {
  open: boolean;
  onClose: () => void;
  obraId: string;
  nomeCliente: string;
};

export function ModalGerenciarAmbientes({ open, onClose, obraId, nomeCliente }: Props) {
  const queryClient = useQueryClient();
  const [ambientes, setAmbientes] = useState<Ambiente[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [mostrarDesativados, setMostrarDesativados] = useState(false);
  const novoInputRef = useRef<HTMLInputElement>(null);

  async function recarregar() {
    setCarregando(true);
    try {
      const lista = await fetchAmbientesObra(obraId, { incluirInativos: true });
      setAmbientes(lista);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(`Falha ao carregar ambientes: ${msg}`);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (open) {
      void recarregar();
      setNovoNome("");
      setMostrarDesativados(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, obraId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function invalidarDiario() {
    void queryClient.invalidateQueries({ queryKey: ["diario-obra", obraId] });
  }

  async function handleAdicionar() {
    const nome = novoNome.trim();
    if (!nome || criando) return;
    setCriando(true);
    try {
      await criarAmbiente(obraId, nome);
      setNovoNome("");
      await recarregar();
      invalidarDiario();
      novoInputRef.current?.focus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg);
    } finally {
      setCriando(false);
    }
  }

  async function handleDesativar(id: string) {
    try {
      await desativarAmbiente(id);
      await recarregar();
      invalidarDiario();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg);
    }
  }

  async function handleReativar(id: string) {
    try {
      await reativarAmbiente(id);
      await recarregar();
      invalidarDiario();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg);
    }
  }

  async function handleMover(idx: number, direcao: -1 | 1) {
    const ativos = ambientes.filter((a) => a.ativo);
    const novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= ativos.length) return;
    const reordenados = [...ativos];
    const [item] = reordenados.splice(idx, 1);
    reordenados.splice(novoIdx, 0, item);
    // Otimista
    const inativos = ambientes.filter((a) => !a.ativo);
    setAmbientes([...reordenados.map((a, i) => ({ ...a, ordem: i })), ...inativos]);
    try {
      await reordenarAmbientes(obraId, reordenados.map((a) => a.id));
      invalidarDiario();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg);
      await recarregar();
    }
  }

  if (!open) return null;

  const ativos = ambientes.filter((a) => a.ativo);
  const inativos = ambientes.filter((a) => !a.ativo);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-ambientes"
    >
      <div className="absolute inset-0 bg-nue-black/60" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[85vh] w-full max-w-[560px] flex-col rounded-md bg-white shadow-lg">
        <header className="flex items-center justify-between border-b border-nue-taupe px-5 py-4">
          <h2
            id="titulo-modal-ambientes"
            className="text-lg text-nue-black"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Ambientes da obra {nomeCliente}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-nue-graphite hover:bg-nue-taupe/40"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {carregando && ambientes.length === 0 ? (
            <p className="text-sm text-nue-graphite">Carregando...</p>
          ) : (
            <>
              <div className="space-y-2">
                {ativos.length === 0 && (
                  <p className="text-sm text-nue-graphite">
                    Nenhum ambiente cadastrado ainda.
                  </p>
                )}
                {ativos.map((amb, idx) => (
                  <LinhaAmbiente
                    key={amb.id}
                    ambiente={amb}
                    podeSubir={idx > 0}
                    podeDescer={idx < ativos.length - 1}
                    onSubir={() => handleMover(idx, -1)}
                    onDescer={() => handleMover(idx, 1)}
                    onDesativar={() => handleDesativar(amb.id)}
                    onRenomeado={() => {
                      void recarregar();
                      invalidarDiario();
                    }}
                  />
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  ref={novoInputRef}
                  type="text"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAdicionar();
                    }
                  }}
                  placeholder="Nome do ambiente"
                  disabled={criando}
                  className="h-9 flex-1 rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAdicionar}
                  disabled={criando || !novoNome.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-nue-graphite bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar ambiente
                </button>
              </div>

              {inativos.length > 0 && (
                <div className="mt-6 border-t border-nue-taupe pt-4">
                  <button
                    type="button"
                    onClick={() => setMostrarDesativados((s) => !s)}
                    className="flex w-full items-center gap-2 text-left text-sm text-nue-graphite hover:text-nue-black"
                  >
                    {mostrarDesativados ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    Ambientes desativados ({inativos.length})
                  </button>
                  {mostrarDesativados && (
                    <ul className="mt-2 space-y-1">
                      {inativos.map((amb) => (
                        <li
                          key={amb.id}
                          className="flex items-center justify-between rounded-sm border border-nue-taupe/60 bg-nue-taupe/10 px-3 py-2 text-sm"
                        >
                          <span className="text-nue-graphite">{amb.nome}</span>
                          <button
                            type="button"
                            onClick={() => handleReativar(amb.id)}
                            className="inline-flex items-center gap-1 text-xs text-nue-black hover:underline"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Reativar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-nue-taupe px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite transition-opacity hover:opacity-90"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}

function LinhaAmbiente({
  ambiente,
  podeSubir,
  podeDescer,
  onSubir,
  onDescer,
  onDesativar,
  onRenomeado,
}: {
  ambiente: Ambiente;
  podeSubir: boolean;
  podeDescer: boolean;
  onSubir: () => void;
  onDescer: () => void;
  onDesativar: () => void;
  onRenomeado: () => void;
}) {
  const [valor, setValor] = useState(ambiente.nome);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoSalvoRef = useRef(ambiente.nome);

  useEffect(() => {
    setValor(ambiente.nome);
    ultimoSalvoRef.current = ambiente.nome;
  }, [ambiente.nome, ambiente.id]);

  async function salvar(nome: string) {
    const limpo = nome.trim();
    if (!limpo || limpo === ultimoSalvoRef.current) return;
    try {
      await renomearAmbiente(ambiente.id, limpo);
      ultimoSalvoRef.current = limpo;
      onRenomeado();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg);
    }
  }

  function handleChange(v: string) {
    setValor(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void salvar(v);
    }, 800);
  }

  function handleBlur() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    void salvar(valor);
  }

  return (
    <div className="flex items-center gap-2 rounded-sm border border-nue-taupe bg-white px-2 py-1.5">
      <input
        type="text"
        value={valor}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className="h-8 flex-1 rounded-sm border border-transparent bg-transparent px-2 text-sm text-nue-black focus:border-nue-taupe focus:outline-none"
      />
      <button
        type="button"
        onClick={onSubir}
        disabled={!podeSubir}
        className="rounded-sm p-1.5 text-nue-graphite hover:bg-nue-taupe/40 disabled:opacity-30"
        aria-label="Subir"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDescer}
        disabled={!podeDescer}
        className="rounded-sm p-1.5 text-nue-graphite hover:bg-nue-taupe/40 disabled:opacity-30"
        aria-label="Descer"
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDesativar}
        className="rounded-sm p-1.5 text-nue-graphite hover:bg-[#F1DDD8] hover:text-[#8C3A2E]"
        aria-label="Desativar"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

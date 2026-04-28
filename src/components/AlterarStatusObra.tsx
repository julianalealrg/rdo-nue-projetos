import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { atualizarStatusObra, type ObraStatus } from "@/lib/obras";
import { diarioResumoQueryKey } from "@/routes/obra.$id";

const OPCOES: { value: ObraStatus; label: string; descricao: string }[] = [
  { value: "ativa", label: "Ativa", descricao: "Obra em andamento" },
  { value: "pausada", label: "Pausada", descricao: "Pausada por algum motivo" },
  { value: "concluida", label: "Concluída", descricao: "Montagem finalizada" },
];

export function AlterarStatusObra({
  obraId,
  statusAtual,
  motivoPausaAtual,
}: {
  obraId: string;
  statusAtual: ObraStatus;
  motivoPausaAtual: string;
}) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [pendente, setPendente] = useState<ObraStatus | null>(null);
  const [motivo, setMotivo] = useState(motivoPausaAtual ?? "");
  const [salvando, setSalvando] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, []);

  function abrirModal(novo: ObraStatus) {
    setAberto(false);
    if (novo === statusAtual) return;
    if (novo === "ativa") {
      void executar(novo, "");
    } else {
      setPendente(novo);
      setMotivo(novo === "pausada" ? motivoPausaAtual ?? "" : "");
    }
  }

  async function executar(novo: ObraStatus, motivoFinal: string) {
    setSalvando(true);
    try {
      await atualizarStatusObra(obraId, novo, motivoFinal);
      await queryClient.invalidateQueries({ queryKey: diarioResumoQueryKey(obraId) });
      await queryClient.invalidateQueries({ queryKey: ["painel-obras"] });
      await queryClient.invalidateQueries({ queryKey: ["painel-obras-busca"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(
        novo === "ativa"
          ? "Obra reativada"
          : novo === "pausada"
          ? "Obra pausada"
          : "Obra marcada como concluída",
      );
      setPendente(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status");
    } finally {
      setSalvando(false);
    }
  }

  function confirmarPendente() {
    if (!pendente) return;
    if (pendente === "pausada" && motivo.trim().length === 0) {
      toast.error("Informe o motivo da pausa.");
      return;
    }
    void executar(pendente, motivo.trim());
  }

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          disabled={salvando}
          onClick={() => setAberto((a) => !a)}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-nue-graphite bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30 disabled:opacity-60"
        >
          Alterar status
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {aberto && (
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[220px] rounded-sm border border-nue-taupe bg-white shadow-md">
            <ul className="py-1">
              {OPCOES.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => abrirModal(o.value)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-nue-offwhite"
                  >
                    <span>
                      <span className="block text-nue-black">{o.label}</span>
                      <span className="block text-[11px] text-nue-graphite">{o.descricao}</span>
                    </span>
                    {o.value === statusAtual && <Check className="h-4 w-4 text-nue-graphite" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {pendente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-nue-black/60 px-4">
          <div className="w-full max-w-md rounded-sm bg-white p-5 shadow-lg">
            <h2 className="text-xl text-nue-black">
              {pendente === "pausada" ? "Pausar obra" : "Concluir obra"}
            </h2>
            {pendente === "pausada" ? (
              <>
                <p className="mt-2 text-sm text-nue-graphite">
                  Informe o motivo da pausa. Esse texto fica registrado no histórico da obra.
                </p>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex: aguardando liberação do cliente, atraso na obra civil etc."
                  rows={4}
                  className="mt-3 w-full rounded-sm border border-nue-taupe bg-nue-offwhite px-3 py-2 text-sm text-nue-black placeholder:text-nue-graphite/60 focus:border-nue-graphite focus:outline-none"
                />
              </>
            ) : (
              <p className="mt-2 text-sm text-nue-graphite">
                Tem certeza que deseja marcar essa obra como <strong>concluída</strong>? Você pode
                reverter depois alterando o status novamente.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendente(null)}
                disabled={salvando}
                className="inline-flex h-9 items-center justify-center rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarPendente}
                disabled={salvando}
                className="inline-flex h-9 items-center justify-center rounded-sm bg-nue-black px-3 text-sm font-medium text-nue-offwhite hover:opacity-90 disabled:opacity-60"
              >
                {salvando
                  ? "Salvando..."
                  : pendente === "pausada"
                  ? "Pausar obra"
                  : "Concluir obra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

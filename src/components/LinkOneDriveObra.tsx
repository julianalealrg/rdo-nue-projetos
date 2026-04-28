import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Folder, Pencil } from "lucide-react";
import { toast } from "sonner";
import { atualizarOneDriveUrl } from "@/lib/obras";
import { diarioResumoQueryKey } from "@/routes/obra.$id";
import { useSessao, podeEscrever } from "@/lib/auth";

export function LinkOneDriveObra({
  obraId,
  urlAtual,
}: {
  obraId: string;
  urlAtual: string;
}) {
  const sessao = useSessao();
  const escrever = podeEscrever(sessao ?? null);
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(urlAtual);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setValor(urlAtual);
  }, [urlAtual]);

  async function salvar() {
    if (salvando) return;
    const limpo = valor.trim();
    if (limpo && !/^https?:\/\//i.test(limpo)) {
      toast.error("URL inválida — deve começar com https://");
      return;
    }
    setSalvando(true);
    try {
      await atualizarOneDriveUrl(obraId, limpo);
      await queryClient.invalidateQueries({ queryKey: diarioResumoQueryKey(obraId) });
      await queryClient.invalidateQueries({ queryKey: ["painel-obras"] });
      toast.success(limpo ? "Link OneDrive salvo" : "Link OneDrive removido");
      setEditando(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <div className="rounded-sm border border-nue-taupe bg-nue-offwhite p-3">
        <label className="text-[12px] font-medium text-nue-graphite">
          Link da pasta OneDrive
        </label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="https://nuesuperficies-my.sharepoint.com/..."
            autoFocus
            className="h-9 w-full flex-1 rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setValor(urlAtual);
                setEditando(false);
              }}
              disabled={salvando}
              className="inline-flex h-9 items-center justify-center rounded-sm border border-nue-taupe bg-white px-3 text-[13px] text-nue-black hover:bg-nue-taupe/30 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="inline-flex h-9 items-center justify-center rounded-sm bg-nue-black px-3 text-[13px] font-medium text-nue-offwhite hover:opacity-90 disabled:opacity-60"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!urlAtual) {
    if (!escrever) return null;
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-dashed border-nue-taupe bg-white px-3 text-[13px] text-nue-graphite hover:border-nue-graphite hover:text-nue-black"
      >
        <Folder className="h-3.5 w-3.5" />
        Adicionar pasta OneDrive
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <a
        href={urlAtual}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-nue-graphite bg-white px-3 text-[13px] text-nue-black hover:bg-nue-taupe/30"
      >
        <Folder className="h-3.5 w-3.5" />
        Pasta OneDrive
        <ExternalLink className="h-3 w-3 text-nue-graphite" />
      </a>
      {escrever && (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="inline-flex h-8 items-center gap-1 rounded-sm border border-nue-taupe bg-white px-2 text-[12px] text-nue-graphite hover:bg-nue-taupe/30"
          title="Editar link"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

import { useState } from "react";
import { Share2, Copy, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { gerarShareTokenObra, revogarShareTokenObra, urlPublicaObra } from "@/lib/share";

export function CompartilharObra({ obraId }: { obraId: string }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function abrir() {
    setAberto(true);
    if (link) return;
    setCarregando(true);
    try {
      const token = await gerarShareTokenObra(obraId);
      setLink(urlPublicaObra(obraId, token));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar link");
      setAberto(false);
    } finally {
      setCarregando(false);
    }
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  }

  async function revogarEGerarNovo() {
    if (!confirm("Revogar o link atual? Quem já tiver o link antigo perderá acesso.")) return;
    setCarregando(true);
    try {
      await revogarShareTokenObra(obraId);
      const token = await gerarShareTokenObra(obraId);
      setLink(urlPublicaObra(obraId, token));
      toast.success("Novo link gerado. O antigo foi revogado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao revogar");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-nue-graphite bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30"
      >
        <Share2 className="h-4 w-4" />
        Compartilhar
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-nue-black/60 px-4">
          <div className="w-full max-w-lg rounded-sm bg-white p-5 shadow-lg">
            <h2 className="text-xl text-nue-black">Link compartilhável</h2>
            <p className="mt-2 text-sm text-nue-graphite">
              Qualquer pessoa com este link consegue ver o diário da obra (somente leitura), sem
              precisar de login. Use no ClickUp ou pra envio interno.
            </p>

            {carregando ? (
              <p className="mt-4 text-sm text-nue-graphite">Gerando link…</p>
            ) : link ? (
              <>
                <div className="mt-4 flex items-center gap-2 rounded-sm border border-nue-taupe bg-nue-offwhite p-2">
                  <input
                    readOnly
                    value={link}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 bg-transparent px-1 text-[12px] text-nue-black focus:outline-none"
                    style={{ fontFamily: "var(--font-mono)" }}
                  />
                  <button
                    type="button"
                    onClick={copiar}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-nue-black px-2.5 text-[12px] font-medium text-nue-offwhite hover:opacity-90"
                  >
                    {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiado ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={revogarEGerarNovo}
                    className="inline-flex items-center gap-1.5 text-[13px] text-nue-graphite hover:text-nue-black hover:underline"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Revogar e gerar novo
                  </button>
                </div>
              </>
            ) : null}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="inline-flex h-9 items-center justify-center rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

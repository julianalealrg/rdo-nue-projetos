import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { fetchDiarioObraResumo, ObraNaoEncontradaError } from "@/lib/diario";
import {
  criarRecebimento,
  uploadFotoRecebimento,
  removerFotoRecebimento,
  type RecebimentoFoto,
} from "@/lib/recebimentos";
import { hojeRecife } from "@/lib/datas";

export const Route = createFileRoute("/obra_/$id/recebimento/novo")({
  component: NovoRecebimentoPage,
});

function NovoRecebimentoPage() {
  const { id } = Route.useParams();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["diario-obra-resumo", id],
    queryFn: () => fetchDiarioObraResumo(id),
    retry: (count, err) => !(err instanceof ObraNaoEncontradaError) && count < 2,
  });

  if (isLoading) {
    return <div className="text-sm text-nue-graphite">Carregando…</div>;
  }
  if (isError || !data) {
    if (error instanceof ObraNaoEncontradaError) return <ObraNaoEncontrada />;
    return (
      <p className="text-sm text-danger">
        {error instanceof Error ? error.message : "Erro ao carregar"}
      </p>
    );
  }

  return <FormularioNovoRecebimento obraId={data.obra.id} obraNome={data.obra.nome_cliente} />;
}

function ObraNaoEncontrada() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-3xl text-nue-black">Obra não encontrada</h1>
      <p className="mt-2 text-sm text-nue-graphite">
        Não é possível criar um recebimento para uma obra que não existe.
      </p>
      <div className="mt-6">
        <Link
          to="/obras"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite transition-opacity hover:opacity-90"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Obras
        </Link>
      </div>
    </div>
  );
}

function FormularioNovoRecebimento({ obraId, obraNome }: { obraId: string; obraNome: string }) {
  const navigate = useNavigate();
  const router = useRouter();

  const [data, setData] = useState(hojeRecife());
  const [descricao, setDescricao] = useState("");
  const [teveAvaria, setTeveAvaria] = useState(false);
  const [observacaoAvaria, setObservacaoAvaria] = useState("");

  // Recebimento é criado primeiro como rascunho ao subir a primeira foto
  const [recebimentoId, setRecebimentoId] = useState<string | null>(null);
  const recebimentoIdRef = useRef<string | null>(null);
  const [fotos, setFotos] = useState<RecebimentoFoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    recebimentoIdRef.current = recebimentoId;
  }, [recebimentoId]);

  async function garantirRecebimento(): Promise<string> {
    if (recebimentoIdRef.current) return recebimentoIdRef.current;
    const id = await criarRecebimento({
      obra_id: obraId,
      data,
      descricao,
      teve_avaria: teveAvaria,
      observacao_avaria: observacaoAvaria,
    });
    setRecebimentoId(id);
    recebimentoIdRef.current = id;
    return id;
  }

  async function adicionarFotos(files: FileList | File[]) {
    const arquivos = Array.from(files);
    if (arquivos.length === 0) return;
    setUploading(true);
    try {
      const recId = await garantirRecebimento();
      let ordemAtual = fotos.length;
      for (const file of arquivos) {
        const novaFoto = await uploadFotoRecebimento({
          file,
          obra_id: obraId,
          recebimento_id: recId,
          ordem: ordemAtual++,
        });
        setFotos((prev) => [...prev, novaFoto]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao subir foto");
    } finally {
      setUploading(false);
    }
  }

  async function removerFoto(foto: RecebimentoFoto) {
    try {
      await removerFotoRecebimento(foto);
      setFotos((prev) => prev.filter((f) => f.id !== foto.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  async function salvar() {
    if (salvando) return;
    if (!descricao.trim()) {
      toast.error("Informe uma descrição do recebimento");
      return;
    }
    setSalvando(true);
    try {
      let id = recebimentoIdRef.current;
      if (!id) {
        id = await criarRecebimento({
          obra_id: obraId,
          data,
          descricao,
          teve_avaria: teveAvaria,
          observacao_avaria: observacaoAvaria,
        });
      } else {
        // Já criado (porque tinha foto). Apenas atualiza com os campos finais.
        const { atualizarRecebimento } = await import("@/lib/recebimentos");
        await atualizarRecebimento(id, {
          data,
          descricao,
          teve_avaria: teveAvaria,
          observacao_avaria: observacaoAvaria,
        });
      }
      toast.success("Recebimento salvo");
      router.invalidate();
      navigate({ to: "/recebimento/$id", params: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav
          className="flex flex-wrap items-center gap-1 text-[12px] text-nue-graphite"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <Link to="/obras" className="hover:text-nue-black hover:underline">
            Obras
          </Link>
          <span>/</span>
          <Link
            to="/obra/$id"
            params={{ id: obraId }}
            className="hover:text-nue-black hover:underline"
          >
            {obraId}
          </Link>
          <span>/</span>
          <span className="text-nue-black">Novo recebimento</span>
        </nav>
      </div>

      <header className="rounded-sm border border-nue-taupe bg-white p-4 sm:p-5">
        <p
          className="text-[12px] text-nue-graphite"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {obraId}
        </p>
        <h1
          className="mt-0.5 text-2xl text-nue-black sm:text-[28px]"
          style={{ fontFamily: "var(--font-display)", lineHeight: 1.15 }}
        >
          Novo recebimento — {obraNome}
        </h1>
        <p className="mt-1 text-[13px] text-nue-graphite">
          Registro de recebimento de cubas, metais e outros itens da obra antes da fábrica.
        </p>
      </header>

      <section className="space-y-4 rounded-sm border border-nue-taupe bg-white p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-[12px] font-medium text-nue-graphite">Data</label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="mt-1 h-10 w-full rounded-sm border border-nue-taupe bg-nue-offwhite px-3 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-nue-black">
              <input
                type="checkbox"
                checked={teveAvaria}
                onChange={(e) => setTeveAvaria(e.target.checked)}
                className="h-4 w-4"
              />
              Teve avaria neste recebimento
            </label>
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-nue-graphite">
            Descrição do recebimento
          </label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Recebimento de cubas e acessórios. Verificadas a integridade da embalagem e os itens..."
            rows={4}
            className="mt-1 w-full rounded-sm border border-nue-taupe bg-nue-offwhite px-3 py-2 text-sm text-nue-black placeholder:text-nue-graphite/60 focus:border-nue-graphite focus:outline-none"
          />
        </div>

        {teveAvaria && (
          <div>
            <label className="block text-[12px] font-medium text-nue-graphite">
              Detalhes da avaria
            </label>
            <textarea
              value={observacaoAvaria}
              onChange={(e) => setObservacaoAvaria(e.target.value)}
              placeholder="Descreva o que veio com avaria, a gravidade e providências..."
              rows={3}
              className="mt-1 w-full rounded-sm border border-warning bg-warning/5 px-3 py-2 text-sm text-nue-black placeholder:text-nue-graphite/60 focus:border-warning focus:outline-none"
            />
          </div>
        )}

        {/* Fotos */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[12px] font-medium text-nue-graphite">Fotos</label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-nue-graphite bg-white px-2.5 text-[13px] text-nue-black hover:bg-nue-taupe/30 disabled:opacity-60"
            >
              {uploading ? (
                <>Carregando…</>
              ) : (
                <>
                  <Camera className="h-3.5 w-3.5" />
                  Adicionar
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) {
                  void adicionarFotos(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </div>
          {fotos.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-nue-taupe bg-nue-offwhite text-sm text-nue-graphite hover:bg-nue-taupe/30 disabled:opacity-60"
            >
              <Plus className="h-5 w-5" />
              {uploading ? "Carregando…" : "Adicionar fotos do recebimento"}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {fotos.map((foto) => (
                <div
                  key={foto.id}
                  className="group relative aspect-square overflow-hidden rounded-sm border border-nue-taupe bg-nue-taupe"
                >
                  <img
                    src={foto.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removerFoto(foto)}
                    className="absolute right-1 top-1 hidden rounded-sm bg-nue-black/80 p-1 text-nue-offwhite group-hover:block"
                    aria-label="Remover foto"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Ações */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          to="/obra/$id"
          params={{ id: obraId }}
          className="inline-flex h-10 items-center justify-center rounded-sm border border-nue-taupe bg-white px-4 text-sm text-nue-black hover:bg-nue-taupe/30"
        >
          Cancelar
        </Link>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || uploading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite hover:opacity-90 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {salvando ? "Salvando…" : "Salvar recebimento"}
        </button>
      </div>
    </div>
  );
}

// silence import not used in some branches
void Trash2;

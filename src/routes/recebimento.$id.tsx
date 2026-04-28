import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  Edit,
  Image as ImageIcon,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchRecebimentoCompleto,
  atualizarRecebimento,
  deletarRecebimento,
  uploadFotoRecebimento,
  removerFotoRecebimento,
  type RecebimentoFoto,
} from "@/lib/recebimentos";
import { fetchDiarioObraResumo } from "@/lib/diario";
import { formatarDataCurta } from "@/lib/datas";

export const Route = createFileRoute("/recebimento/$id")({
  component: RecebimentoDetalhePage,
});

function RecebimentoDetalhePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const [editando, setEditando] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["recebimento", id],
    queryFn: () => fetchRecebimentoCompleto(id),
  });

  const { data: obraData } = useQuery({
    queryKey: ["obra-resumo-do-recebimento", data?.obra_id],
    queryFn: () => fetchDiarioObraResumo(data!.obra_id),
    enabled: !!data?.obra_id,
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-nue-graphite">Carregando…</p>;
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-3xl text-nue-black">Recebimento não encontrado</h1>
        <p className="mt-2 text-sm text-nue-graphite">
          {error instanceof Error ? error.message : "O recebimento não existe."}
        </p>
        <div className="mt-6">
          <Link
            to="/obras"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite hover:opacity-90"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para Obras
          </Link>
        </div>
      </div>
    );
  }

  const obraId = data.obra_id;
  const obraNome = obraData?.obra.nome_cliente ?? "—";

  async function deletar() {
    if (!confirm("Tem certeza que deseja excluir este recebimento? A ação não pode ser desfeita."))
      return;
    try {
      await deletarRecebimento(id);
      toast.success("Recebimento excluído");
      router.invalidate();
      navigate({ to: "/obra/$id", params: { id: obraId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  return (
    <div className="space-y-4">
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
        <span className="text-nue-black">Recebimento</span>
      </nav>

      <header className="rounded-sm border border-nue-taupe bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p
              className="text-[12px] uppercase tracking-wider text-nue-graphite"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Recebimento
            </p>
            <h1
              className="mt-0.5 text-2xl text-nue-black sm:text-[28px]"
              style={{ fontFamily: "var(--font-display)", lineHeight: 1.15 }}
            >
              {obraNome}
            </h1>
            <p className="mt-1 text-[13px] text-nue-graphite">
              {formatarDataCurta(data.data)}
              {data.teve_avaria && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-sm bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  Teve avaria
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!editando ? (
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="inline-flex h-9 items-center gap-2 rounded-sm border border-nue-graphite bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30"
              >
                <Edit className="h-4 w-4" />
                Editar
              </button>
            ) : null}
            <button
              type="button"
              onClick={deletar}
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-nue-taupe bg-white px-3 text-sm text-danger hover:bg-danger/5"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </button>
          </div>
        </div>
      </header>

      {editando ? (
        <FormEdicao
          recebimentoId={id}
          inicial={data}
          onCancelar={() => setEditando(false)}
          onSalvar={() => {
            setEditando(false);
            router.invalidate();
          }}
        />
      ) : (
        <Visualizacao recebimento={data} obraId={obraId} onMudouFotos={() => router.invalidate()} />
      )}
    </div>
  );
}

function Visualizacao({
  recebimento,
  obraId,
  onMudouFotos,
}: {
  recebimento: import("@/lib/recebimentos").RecebimentoCompleto;
  obraId: string;
  onMudouFotos: () => void;
}) {
  const [fotos, setFotos] = useState<RecebimentoFoto[]>(recebimento.fotos);
  const [uploading, setUploading] = useState(false);

  async function adicionar(files: FileList | File[]) {
    const arquivos = Array.from(files);
    if (arquivos.length === 0) return;
    setUploading(true);
    try {
      let ordem = fotos.length;
      for (const file of arquivos) {
        const f = await uploadFotoRecebimento({
          file,
          obra_id: obraId,
          recebimento_id: recebimento.id,
          ordem: ordem++,
        });
        setFotos((prev) => [...prev, f]);
      }
      onMudouFotos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao subir foto");
    } finally {
      setUploading(false);
    }
  }

  async function remover(foto: RecebimentoFoto) {
    if (!confirm("Remover esta foto?")) return;
    try {
      await removerFotoRecebimento(foto);
      setFotos((prev) => prev.filter((f) => f.id !== foto.id));
      onMudouFotos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  return (
    <div className="space-y-4">
      {recebimento.descricao.trim() && (
        <section className="rounded-sm border border-nue-taupe bg-white p-4 sm:p-5">
          <h2 className="text-[13px] font-medium text-nue-graphite uppercase tracking-wider">
            Descrição
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-nue-black">{recebimento.descricao}</p>
        </section>
      )}

      {recebimento.teve_avaria && recebimento.observacao_avaria.trim() && (
        <section className="rounded-sm border border-warning/40 bg-warning/5 p-4 sm:p-5">
          <h2 className="flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-wider text-warning">
            <AlertTriangle className="h-4 w-4" />
            Detalhes da avaria
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-nue-black">
            {recebimento.observacao_avaria}
          </p>
        </section>
      )}

      <section className="rounded-sm border border-nue-taupe bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-wider text-nue-graphite">
            <ImageIcon className="h-4 w-4" />
            Fotos ({fotos.length})
          </h2>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border border-nue-graphite bg-white px-2.5 text-[13px] text-nue-black hover:bg-nue-taupe/30">
            {uploading ? (
              "Carregando…"
            ) : (
              <>
                <Camera className="h-3.5 w-3.5" />
                Adicionar
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={uploading}
              onChange={(e) => {
                if (e.target.files) {
                  void adicionar(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </label>
        </div>
        {fotos.length === 0 ? (
          <p className="text-sm text-nue-graphite/70">Nenhuma foto.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {fotos.map((foto) => (
              <div
                key={foto.id}
                className="group relative aspect-square overflow-hidden rounded-sm border border-nue-taupe bg-nue-taupe"
              >
                <a href={foto.url} target="_blank" rel="noreferrer">
                  <img
                    src={foto.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </a>
                <button
                  type="button"
                  onClick={() => remover(foto)}
                  className="absolute right-1 top-1 hidden rounded-sm bg-nue-black/80 p-1 text-nue-offwhite group-hover:block"
                  aria-label="Remover foto"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FormEdicao({
  recebimentoId,
  inicial,
  onCancelar,
  onSalvar,
}: {
  recebimentoId: string;
  inicial: import("@/lib/recebimentos").RecebimentoCompleto;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  const [data, setData] = useState(inicial.data);
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [teveAvaria, setTeveAvaria] = useState(inicial.teve_avaria);
  const [observacaoAvaria, setObservacaoAvaria] = useState(inicial.observacao_avaria);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (salvando) return;
    if (!descricao.trim()) {
      toast.error("Informe a descrição");
      return;
    }
    setSalvando(true);
    try {
      await atualizarRecebimento(recebimentoId, {
        data,
        descricao,
        teve_avaria: teveAvaria,
        observacao_avaria: observacaoAvaria,
      });
      toast.success("Recebimento atualizado");
      onSalvar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
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
            Teve avaria
          </label>
        </div>
      </div>

      <div>
        <label className="block text-[12px] font-medium text-nue-graphite">Descrição</label>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-sm border border-nue-taupe bg-nue-offwhite px-3 py-2 text-sm text-nue-black focus:border-nue-graphite focus:outline-none"
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
            rows={3}
            className="mt-1 w-full rounded-sm border border-warning bg-warning/5 px-3 py-2 text-sm text-nue-black focus:border-warning focus:outline-none"
          />
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancelar}
          disabled={salvando}
          className="inline-flex h-9 items-center justify-center rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black hover:bg-nue-taupe/30 disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-sm bg-nue-black px-3 text-sm font-medium text-nue-offwhite hover:opacity-90 disabled:opacity-60"
        >
          {salvando ? "Salvando…" : (
            <>
              <Save className="h-3.5 w-3.5" />
              Salvar
            </>
          )}
        </button>
      </div>
    </section>
  );
}

// silence
void Check;

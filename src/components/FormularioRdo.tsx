import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Eraser,
  Loader2,
  Maximize2,
  MoveLeft,
  MoveRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import SignatureCanvas from "react-signature-canvas";
import { hojeRecife, horaAgoraRecife, horaAgoraRecifeFormatada } from "@/lib/datas";
import type { ObraComSupervisor, RdoCompleto, CondicaoLocal, TipoVisita, Prioridade, RdoFoto, Ambiente } from "@/lib/diario";
import {
  atualizarRdoCampos,
  criarRdoInicial,
  criarVersaoSnapshot,
  rdoParaForm,
  sincronizarFilhos,
  type FormRdoState,
  type EquipeItem,
  type TerceiroItem,
  type PendenciaItem,
  type PontoAtencaoItem,
} from "@/lib/rdo";
import {
  ArquivoMuitoGrandeError,
  atualizarLegendaFoto,
  persistirOrdemFotos,
  removerFoto,
  uploadAssinatura,
  uploadFoto,
} from "@/lib/fotos";
import { criarAmbiente, fetchAmbientesObra } from "@/lib/ambientes";
import {
  removerAmbienteDoRdo,
  removerObservacaoAmbiente,
  upsertObservacaoAmbiente,
} from "@/lib/rdo";
import type { RdoObservacaoAmbiente } from "@/lib/diario";
import { Lightbox } from "@/components/Lightbox";


/* ---------------- Tipos ---------------- */

type Props =
  | { modo: "criar"; obra: ObraComSupervisor }
  | { modo: "editar"; obra: ObraComSupervisor; rdo: RdoCompleto };

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; hora: string }
  | { kind: "error"; msg: string };

type Erros = Partial<{
  data: string;
  hora_chegada: string;
  tipo_visita: string;
  condicao_local: string;
  registros: string;
}>;

/* ---------------- Estado inicial ---------------- */

function estadoInicialCriar(): FormRdoState {
  return {
    data: hojeRecife(),
    hora_chegada: horaAgoraRecife(),
    hora_saida: "",
    tipo_visita: "",
    condicao_local: "",
    registros: "",
    proximos_passos: "",
    equipe_nue: [],
    terceiros: [],
    pendencias: [],
    pontos_atencao: [],
  };
}

/* ---------------- Validação ---------------- */

const schemaFinalizar = z.object({
  data: z.string().min(1, "Informe a data"),
  hora_chegada: z.string().min(1, "Informe a hora de chegada"),
  tipo_visita: z.enum(["medicao", "supervisao_montagem"], {
    message: "Selecione o tipo de visita",
  }),
  condicao_local: z.enum(["praticavel", "parcialmente_praticavel", "impraticavel"], {
    message: "Selecione a condição do local",
  }),
  registros: z.string().trim().min(1, "Descreva os registros do dia"),
});

/* ---------------- Componente ---------------- */

export function FormularioRdo(props: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormRdoState>(() =>
    props.modo === "editar" ? rdoParaForm(props.rdo) : estadoInicialCriar(),
  );
  const [rdoId, setRdoId] = useState<string | null>(
    props.modo === "editar" ? props.rdo.id : null,
  );
  const [estavaFinalizado] = useState<boolean>(
    props.modo === "editar" ? props.rdo.finalizado : false,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });
  const [erros, setErros] = useState<Erros>({});
  const [dirty, setDirty] = useState(false);
  const [confirmandoSair, setConfirmandoSair] = useState(false);
  const [finalizando, setFinalizando] = useState(false);

  // Fotos: estado local refletindo o banco
  const [fotos, setFotos] = useState<RdoFoto[]>(
    props.modo === "editar" ? props.rdo.fotos : [],
  );

  // Observações por ambiente
  const [observacoesAmbiente, setObservacoesAmbiente] = useState<RdoObservacaoAmbiente[]>(
    props.modo === "editar" ? props.rdo.observacoes_ambiente : [],
  );

  // Ambientes "abertos manualmente" no RDO (fora dos derivados de fotos/obs/pend/pontos)
  const [ambientesAbertosNoRdo, setAmbientesAbertosNoRdo] = useState<Set<string>>(
    new Set(),
  );

  // Ambientes da obra
  const [ambientesObra, setAmbientesObra] = useState<
    Awaited<ReturnType<typeof fetchAmbientesObra>>
  >([]);
  const recarregarAmbientes = useCallback(async () => {
    try {
      const lista = await fetchAmbientesObra(props.obra.id);
      setAmbientesObra(lista);
    } catch (e) {
      console.error("Erro ao carregar ambientes da obra", e);
    }
  }, [props.obra.id]);
  useEffect(() => {
    void recarregarAmbientes();
  }, [recarregarAmbientes]);

  // Assinatura
  const [assinaturaUrl, setAssinaturaUrl] = useState<string | null>(
    props.modo === "editar" ? props.rdo.assinatura_url : null,
  );
  const [substituindoAssinatura, setSubstituindoAssinatura] = useState(false);
  const [assinaturaErroDestaque, setAssinaturaErroDestaque] = useState(false);
  const sigPadRef = useRef<SignatureCanvas | null>(null);
  const sigDirtyRef = useRef(false);
  const secaoAssinaturaRef = useRef<HTMLDivElement | null>(null);

  // Refs para controlar concorrência e debounce
  const ultimoSavePromise = useRef<Promise<void> | null>(null);
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const refsCampos = useRef<Map<keyof Erros, HTMLElement | null>>(new Map());
  const formRef = useRef(form);
  formRef.current = form;
  const rdoIdRef = useRef(rdoId);
  rdoIdRef.current = rdoId;

  /* -------- Helpers de mutação -------- */

  const podeIniciarRascunho = useCallback((f: FormRdoState) => {
    return (
      f.data.length > 0 &&
      f.hora_chegada.length > 0 &&
      f.tipo_visita.length > 0 &&
      f.condicao_local.length > 0
    );
  }, []);


  const persistir = useCallback(
    async (opcoes?: { finalizado?: boolean }): Promise<string | null> => {
      const f = formRef.current;
      if (!podeIniciarRascunho(f)) return rdoIdRef.current;

      setSaveStatus({ kind: "saving" });
      try {
        let id = rdoIdRef.current;

        // Snapshot ANTES de mudar (somente quando editando finalizado)
        if (id && estavaFinalizado) {
          await criarVersaoSnapshot({ rdo_id: id });
        }

        if (!id) {
          id = await criarRdoInicial({
            obra_id: props.obra.id,
            supervisor_id: props.obra.supervisor_id,
            form: f,
          });
          setRdoId(id);
          rdoIdRef.current = id;
        } else {
          await atualizarRdoCampos({ id, form: f, finalizado: opcoes?.finalizado });
        }

        await sincronizarFilhos({
          rdo_id: id,
          equipe_nue: f.equipe_nue,
          terceiros: f.terceiros,
          pendencias: f.pendencias,
          pontos_atencao: f.pontos_atencao,
        });

        // Marcar finalizado quando aplicável e ainda não chamamos o update acima
        if (opcoes?.finalizado && rdoIdRef.current && rdoIdRef.current === id) {
          // já tratado pelo update acima quando id existia; quando criou agora, força:
          if (!estavaFinalizado) {
            await atualizarRdoCampos({ id, form: f, finalizado: true });
          }
        }

        setSaveStatus({ kind: "saved", hora: horaAgoraRecifeFormatada() });
        setDirty(false);
        queryClient.invalidateQueries({ queryKey: ["diario-obra", props.obra.id] });
        router.invalidate();
        return id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        setSaveStatus({ kind: "error", msg });
        return null;
      }
    },
    [props.obra.id, props.obra.supervisor_id, podeIniciarRascunho, estavaFinalizado, queryClient, router],
  );

  // Auto-save imediato (com proteção contra concorrência)
  const agendarSaveImediato = useCallback(() => {
    if (!podeIniciarRascunho(formRef.current)) return;
    const prev = ultimoSavePromise.current ?? Promise.resolve();
    const next = prev.then(() => persistir().then(() => undefined));
    ultimoSavePromise.current = next;
  }, [persistir, podeIniciarRascunho]);

  // Auto-save com debounce (textareas)
  const agendarSaveDebounced = useCallback(
    (chave: string, ms = 800) => {
      const timers = debounceTimers.current;
      const t = timers.get(chave);
      if (t) clearTimeout(t);
      timers.set(
        chave,
        setTimeout(() => {
          timers.delete(chave);
          agendarSaveImediato();
        }, ms),
      );
    },
    [agendarSaveImediato],
  );

  // Limpa timers ao desmontar
  useEffect(() => {
    return () => {
      for (const t of debounceTimers.current.values()) clearTimeout(t);
      debounceTimers.current.clear();
    };
  }, []);

  // Aviso ao tentar sair com mudanças
  useEffect(() => {
    function before(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);

  /* -------- Mutadores de campo -------- */

  function atualizarCampo<K extends keyof FormRdoState>(chave: K, valor: FormRdoState[K]) {
    setForm((f) => ({ ...f, [chave]: valor }));
    setDirty(true);
  }

  /* -------- Operações de fotos -------- */

  const marcarSalvando = useCallback(() => {
    setSaveStatus({ kind: "saving" });
  }, []);
  const marcarSalvo = useCallback(() => {
    setSaveStatus({ kind: "saved", hora: horaAgoraRecifeFormatada() });
  }, []);
  const marcarErro = useCallback((msg: string) => {
    setSaveStatus({ kind: "error", msg });
  }, []);

  const ordemTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agendarPersistirOrdem = useCallback((lista: RdoFoto[]) => {
    if (ordemTimerRef.current) clearTimeout(ordemTimerRef.current);
    ordemTimerRef.current = setTimeout(async () => {
      marcarSalvando();
      try {
        await persistirOrdemFotos(lista);
        marcarSalvo();
      } catch (err) {
        marcarErro(err instanceof Error ? err.message : "Erro");
      }
    }, 500);
  }, [marcarSalvando, marcarSalvo, marcarErro]);

  /* -------- Persistência da assinatura -------- */

  async function salvarAssinaturaSeNecessario(rdoIdAtual: string): Promise<string | null> {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) return null;
    if (!sigDirtyRef.current) return null;
    const canvas = sigPadRef.current.getCanvas();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) throw new Error("Falha ao gerar imagem da assinatura");
    const url = await uploadAssinatura({ rdo_id: rdoIdAtual, blob });
    setAssinaturaUrl(url);
    setSubstituindoAssinatura(false);
    sigDirtyRef.current = false;
    return url;
  }

  /* -------- Handlers de saída -------- */

  function tentarSair() {
    if (dirty || sigDirtyRef.current || saveStatus.kind === "saving") {
      setConfirmandoSair(true);
      return;
    }
    navigate({ to: "/obra/$id", params: { id: props.obra.id } });
  }

  async function salvarRascunhoESair() {
    if (rdoIdRef.current || podeIniciarRascunho(formRef.current)) {
      const id = await persistir();
      if (id) {
        try {
          await salvarAssinaturaSeNecessario(id);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erro ao salvar assinatura");
          return;
        }
        toast.success("Rascunho salvo");
        navigate({ to: "/obra/$id", params: { id: props.obra.id } });
        return;
      }
      // se falhou, mantém na tela
      return;
    }
    // sem nada para salvar — só sair
    navigate({ to: "/obra/$id", params: { id: props.obra.id } });
  }

  function destacarAssinaturaErro() {
    setAssinaturaErroDestaque(true);
    secaoAssinaturaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setAssinaturaErroDestaque(false), 2000);
  }

  async function finalizar() {
    if (finalizando) return;
    const f = formRef.current;
    const parsed = schemaFinalizar.safeParse({
      data: f.data,
      hora_chegada: f.hora_chegada,
      tipo_visita: f.tipo_visita || undefined,
      condicao_local: f.condicao_local || undefined,
      registros: f.registros,
    });
    if (!parsed.success) {
      const novosErros: Erros = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (path === "data") novosErros.data = issue.message;
        else if (path === "hora_chegada") novosErros.hora_chegada = issue.message;
        else if (path === "tipo_visita") novosErros.tipo_visita = issue.message;
        else if (path === "condicao_local") novosErros.condicao_local = issue.message;
        else if (path === "registros") novosErros.registros = issue.message;
      }
      setErros(novosErros);
      // Scroll até o primeiro campo com erro
      const ordem: (keyof Erros)[] = ["data", "hora_chegada", "tipo_visita", "condicao_local", "registros"];
      const primeiro = ordem.find((k) => novosErros[k]);
      if (primeiro) {
        const el = refsCampos.current.get(primeiro);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (el && "focus" in el) (el as HTMLElement).focus({ preventScroll: true });
      }
      return;
    }
    setErros({});

    // Validação assinatura
    const temAssinaturaPersistida = !!assinaturaUrl && !substituindoAssinatura;
    const temTracoNovo =
      !!sigPadRef.current && !sigPadRef.current.isEmpty();
    if (!temAssinaturaPersistida && !temTracoNovo) {
      toast.error("Desenhe a assinatura antes de finalizar o RDO");
      destacarAssinaturaErro();
      return;
    }

    setFinalizando(true);
    const id = await persistir({ finalizado: true });
    if (!id) {
      setFinalizando(false);
      return;
    }
    try {
      await salvarAssinaturaSeNecessario(id);
    } catch (err) {
      setFinalizando(false);
      toast.error(err instanceof Error ? err.message : "Erro ao salvar assinatura");
      return;
    }
    setFinalizando(false);
    toast.success("RDO finalizado");
    navigate({ to: "/rdo/$id", params: { id } });
  }


  /* -------- Render -------- */

  const camposFaltantesIdentificacao = useMemo(() => {
    const faltantes: string[] = [];
    if (!form.data) faltantes.push("data");
    if (!form.hora_chegada) faltantes.push("hora de chegada");
    if (!props.obra.supervisor) faltantes.push("responsável pelo RDO");
    if (!form.tipo_visita) faltantes.push("tipo de visita");
    if (!form.condicao_local) faltantes.push("condição do local");
    return faltantes;
  }, [form.data, form.hora_chegada, form.tipo_visita, form.condicao_local, props.obra.supervisor]);

  const mensagemBloqueio =
    camposFaltantesIdentificacao.length > 0
      ? `Preencha os campos obrigatórios da identificação para liberar esta seção: ${camposFaltantesIdentificacao.join(", ")}.`
      : "Salvando identificação… aguarde para liberar esta seção.";

  return (
    <div className="pb-24">
      <CabecalhoForm
        modo={props.modo}
        obra={props.obra}
        rdoId={rdoId}
        saveStatus={saveStatus}
        onCancelar={tentarSair}
        onRetry={agendarSaveImediato}
      />

      <div className="mx-auto mt-6 w-full max-w-[880px] space-y-4 px-4 sm:px-0">
        <SecaoIdentificacao
          form={form}
          erros={erros}
          onChange={atualizarCampo}
          onCommit={agendarSaveImediato}
          registrarRef={(k, el) => refsCampos.current.set(k, el)}
        />

        <SecaoEquipe
          form={form}
          onChangeEquipe={(v) => atualizarCampo("equipe_nue", v)}
          onChangeTerceiros={(v) => atualizarCampo("terceiros", v)}
          onCommit={agendarSaveImediato}
        />

        <SecaoRegistros
          form={form}
          erro={erros.registros}
          onChange={atualizarCampo}
          onBlurDebounced={agendarSaveDebounced}
          onBlurImediato={agendarSaveImediato}
          registrarRef={(el) => refsCampos.current.set("registros", el)}
        />

        <SecaoPendencias
          itens={form.pendencias}
          onChange={(novos) => atualizarCampo("pendencias", novos)}
          onCommit={agendarSaveImediato}
          ambienteId={null}
          titulo="Pendências gerais"
          vazioMsg="Nenhuma pendência geral registrada"
        />

        <SecaoPontosAtencao
          itens={form.pontos_atencao}
          onChange={(v) => atualizarCampo("pontos_atencao", v)}
          onCommit={agendarSaveImediato}
          ambienteId={null}
          titulo="Pontos de atenção gerais"
          vazioMsg="Nenhum ponto geral registrado"
        />

        <SecaoAmbientes
          rdoId={rdoId}
          obraId={props.obra.id}
          ambientesObra={ambientesObra}
          fotos={fotos}
          setFotos={setFotos}
          pendencias={form.pendencias}
          setPendencias={(v) => atualizarCampo("pendencias", v)}
          pontosAtencao={form.pontos_atencao}
          setPontosAtencao={(v) => atualizarCampo("pontos_atencao", v)}
          observacoesAmbiente={observacoesAmbiente}
          setObservacoesAmbiente={setObservacoesAmbiente}
          ambientesAbertosNoRdo={ambientesAbertosNoRdo}
          setAmbientesAbertosNoRdo={setAmbientesAbertosNoRdo}
          onAmbientesChanged={() => void recarregarAmbientes()}
          onSavingStart={marcarSalvando}
          onSavingDone={marcarSalvo}
          onSavingError={marcarErro}
          onCommit={agendarSaveImediato}
          agendarPersistirOrdem={agendarPersistirOrdem}
          mensagemBloqueio={mensagemBloqueio}
        />

        <SecaoAssinatura
          ref={secaoAssinaturaRef}
          rdoId={rdoId}
          assinaturaUrl={assinaturaUrl}
          substituindo={substituindoAssinatura}
          onSubstituir={() => setSubstituindoAssinatura(true)}
          onCancelarSubstituir={() => {
            setSubstituindoAssinatura(false);
            sigPadRef.current?.clear();
            sigDirtyRef.current = false;
          }}
          supervisor={props.obra.supervisor}
          destacarErro={assinaturaErroDestaque}
          sigPadRef={sigPadRef}
          sigDirtyRef={sigDirtyRef}
          onDirty={() => setDirty(true)}
          mensagemBloqueio={mensagemBloqueio}
        />
      </div>


      {/* Rodapé fixo */}
      <RodapeFixo
        saveStatus={saveStatus}
        finalizando={finalizando}
        onSalvarRascunho={salvarRascunhoESair}
        onFinalizar={finalizar}
        onRetry={agendarSaveImediato}
      />

      {confirmandoSair && (
        <DialogoConfirmar
          onCancelar={() => setConfirmandoSair(false)}
          onDescartar={() =>
            navigate({ to: "/obra/$id", params: { id: props.obra.id } })
          }
        />
      )}
    </div>
  );
}

/* ---------------- Cabeçalho ---------------- */

function CabecalhoForm({
  modo,
  obra,
  rdoId,
  saveStatus,
  onCancelar,
  onRetry,
}: {
  modo: "criar" | "editar";
  obra: ObraComSupervisor;
  rdoId: string | null;
  saveStatus: SaveStatus;
  onCancelar: () => void;
  onRetry: () => void;
}) {
  const titulo = modo === "criar" ? "Novo RDO" : "Editar RDO";
  return (
    <header className="space-y-2">
      <nav
        className="flex flex-wrap items-center gap-1 text-[12px] text-nue-graphite"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <Link to="/" className="hover:text-nue-black hover:underline">
          Obras
        </Link>
        <span>/</span>
        <Link
          to="/obra/$id"
          params={{ id: obra.id }}
          className="hover:text-nue-black hover:underline"
        >
          {obra.id}
        </Link>
        <span>/</span>
        <span className="text-nue-black">{rdoId ?? "Novo RDO"}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1
            className="text-nue-black"
            style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1.15 }}
          >
            {titulo}
          </h1>
          <p className="text-[14px] text-nue-graphite">
            <span className="text-nue-black">{obra.nome_cliente}</span>
            <span className="mx-2 text-nue-graphite/50">·</span>
            <span>{obra.endereco}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <IndicadorSave saveStatus={saveStatus} onRetry={onRetry} />
          <button
            type="button"
            onClick={onCancelar}
            className="h-9 rounded-sm border border-nue-taupe bg-white px-4 text-sm text-nue-black transition-colors hover:bg-nue-taupe/40"
          >
            Cancelar
          </button>
        </div>
      </div>
    </header>
  );
}

function IndicadorSave({
  saveStatus,
  onRetry,
}: {
  saveStatus: SaveStatus;
  onRetry: () => void;
}) {
  if (saveStatus.kind === "idle") return <span className="text-[11px] text-nue-graphite/50" style={{ fontFamily: "var(--font-mono)" }}>—</span>;
  if (saveStatus.kind === "saving")
    return (
      <span
        className="text-[11px] italic text-nue-graphite"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        Salvando...
      </span>
    );
  if (saveStatus.kind === "saved")
    return (
      <span
        className="text-[11px] text-nue-graphite"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        Salvo às {saveStatus.hora}
      </span>
    );
  return (
    <span className="flex items-center gap-2 text-[11px] text-[#8C3A2E]" style={{ fontFamily: "var(--font-mono)" }}>
      Erro ao salvar
      <button
        type="button"
        onClick={onRetry}
        className="underline underline-offset-2 hover:text-nue-black"
      >
        Tentar novamente
      </button>
    </span>
  );
}

/* ---------------- Card de seção ---------------- */

function CardSecao({
  titulo,
  obrigatorio,
  defaultOpen = true,
  fixo = false,
  children,
}: {
  titulo: string;
  obrigatorio?: boolean;
  defaultOpen?: boolean;
  fixo?: boolean;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(defaultOpen);
  const open = fixo ? true : aberto;
  return (
    <section
      className="rounded-sm border border-nue-taupe bg-white"
      style={{ padding: "16px 20px" }}
    >
      <header className="flex items-center justify-between">
        <h2
          className="flex items-center gap-2 text-nue-black"
          style={{ fontFamily: "var(--font-display)", fontSize: 17 }}
        >
          {titulo}
          {obrigatorio && (
            <span
              className="text-[10px] uppercase text-nue-graphite"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
            >
              obrigatório
            </span>
          )}
        </h2>
        {!fixo && (
          <button
            type="button"
            onClick={() => setAberto((a) => !a)}
            aria-label={open ? "Colapsar" : "Expandir"}
            className="rounded-sm p-1 text-nue-graphite hover:bg-nue-taupe/40"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </header>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

function Label({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-nue-graphite"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {children}
    </label>
  );
}

function ErroCampo({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-[#8C3A2E]">{msg}</p>;
}

function inputCls(temErro: boolean) {
  return `h-10 w-full rounded-sm border bg-white px-3 text-sm text-nue-black focus:outline-none focus:border-nue-graphite ${
    temErro ? "border-[#8C3A2E]" : "border-nue-taupe"
  }`;
}

/* ---------------- Seção 1 — Identificação ---------------- */

function SecaoIdentificacao({
  form,
  erros,
  onChange,
  onCommit,
  registrarRef,
}: {
  form: FormRdoState;
  erros: Erros;
  onChange: <K extends keyof FormRdoState>(chave: K, valor: FormRdoState[K]) => void;
  onCommit: () => void;
  registrarRef: (k: keyof Erros, el: HTMLElement | null) => void;
}) {
  return (
    <CardSecao titulo="Identificação" obrigatorio fixo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="data">Data</Label>
          <input
            ref={(el) => registrarRef("data", el)}
            id="data"
            type="date"
            value={form.data}
            onChange={(e) => onChange("data", e.target.value)}
            onBlur={onCommit}
            className={inputCls(!!erros.data)}
          />
          <ErroCampo msg={erros.data} />
        </div>
        <div>
          <Label htmlFor="hora_chegada">Hora de chegada</Label>
          <input
            ref={(el) => registrarRef("hora_chegada", el)}
            id="hora_chegada"
            type="time"
            value={form.hora_chegada}
            onChange={(e) => onChange("hora_chegada", e.target.value)}
            onBlur={onCommit}
            className={inputCls(!!erros.hora_chegada)}
          />
          <ErroCampo msg={erros.hora_chegada} />
        </div>
        <div>
          <Label htmlFor="hora_saida">Hora de saída (opcional)</Label>
          <input
            id="hora_saida"
            type="time"
            value={form.hora_saida}
            onChange={(e) => onChange("hora_saida", e.target.value)}
            onBlur={onCommit}
            className={inputCls(false)}
          />
        </div>
        <div>
          <Label>Tipo de visita</Label>
          <SegmentedTipoVisita
            valor={form.tipo_visita}
            erro={!!erros.tipo_visita}
            onChange={(v) => {
              onChange("tipo_visita", v);
              setTimeout(onCommit, 0);
            }}
            registrarRef={(el) => registrarRef("tipo_visita", el)}
          />
          <ErroCampo msg={erros.tipo_visita} />
        </div>
        <div className="sm:col-span-2">
          <Label>Condição do local</Label>
          <SegmentedCondicao
            valor={form.condicao_local}
            erro={!!erros.condicao_local}
            onChange={(v) => {
              onChange("condicao_local", v);
              setTimeout(onCommit, 0);
            }}
            registrarRef={(el) => registrarRef("condicao_local", el)}
          />
          <ErroCampo msg={erros.condicao_local} />
        </div>
      </div>
    </CardSecao>
  );
}

function SegmentedTipoVisita({
  valor,
  erro,
  onChange,
  registrarRef,
}: {
  valor: TipoVisita | "";
  erro: boolean;
  onChange: (v: TipoVisita) => void;
  registrarRef: (el: HTMLElement | null) => void;
}) {
  const opcoes: { v: TipoVisita; label: string }[] = [
    { v: "medicao", label: "Medição" },
    { v: "supervisao_montagem", label: "Supervisão de montagem" },
  ];
  return (
    <div
      ref={(el) => registrarRef(el)}
      tabIndex={-1}
      role="radiogroup"
      className={`inline-flex w-full overflow-hidden rounded-sm border ${
        erro ? "border-[#8C3A2E]" : "border-nue-taupe"
      }`}
    >
      {opcoes.map((opt, i) => {
        const ativo = valor === opt.v;
        return (
          <button
            key={opt.v}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(opt.v)}
            className={`flex-1 px-3 py-2 text-sm transition-colors ${
              i > 0 ? "border-l border-nue-taupe" : ""
            } ${
              ativo
                ? "bg-nue-black text-nue-offwhite"
                : "bg-white text-nue-black hover:bg-nue-taupe/40"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const CONDICAO_OPCOES: { v: CondicaoLocal; label: string; bg: string; fg: string }[] = [
  { v: "praticavel", label: "Praticável", bg: "#E8ECE4", fg: "#4A5D43" },
  { v: "parcialmente_praticavel", label: "Parcialmente praticável", bg: "#F1E9DA", fg: "#A07B3F" },
  { v: "impraticavel", label: "Impraticável", bg: "#F1DDD8", fg: "#8C3A2E" },
];

function SegmentedCondicao({
  valor,
  erro,
  onChange,
  registrarRef,
}: {
  valor: CondicaoLocal | "";
  erro: boolean;
  onChange: (v: CondicaoLocal) => void;
  registrarRef: (el: HTMLElement | null) => void;
}) {
  return (
    <div
      ref={(el) => registrarRef(el)}
      tabIndex={-1}
      role="radiogroup"
      className={`inline-flex w-full overflow-hidden rounded-sm border ${
        erro ? "border-[#8C3A2E]" : "border-nue-taupe"
      }`}
    >
      {CONDICAO_OPCOES.map((opt, i) => {
        const ativo = valor === opt.v;
        return (
          <button
            key={opt.v}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(opt.v)}
            className={`flex-1 px-3 py-2 text-sm transition-colors ${
              i > 0 ? "border-l border-nue-taupe" : ""
            } ${ativo ? "" : "bg-white text-nue-black hover:bg-nue-taupe/40"}`}
            style={ativo ? { backgroundColor: opt.bg, color: opt.fg, fontWeight: 500 } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Seção 2 — Equipe + Terceiros ---------------- */

function SecaoEquipe({
  form,
  onChangeEquipe,
  onChangeTerceiros,
  onCommit,
}: {
  form: FormRdoState;
  onChangeEquipe: (v: EquipeItem[]) => void;
  onChangeTerceiros: (v: TerceiroItem[]) => void;
  onCommit: () => void;
}) {
  return (
    <CardSecao titulo="Equipe presente">
      <div className="space-y-5">
        <ListaEquipe
          titulo="Equipe NUE"
          itens={form.equipe_nue}
          onChange={onChangeEquipe}
          onCommit={onCommit}
          chaveSecundaria="funcao"
          placeholderSecundario="Função"
          labelAdicionar="Adicionar membro"
        />
        <div className="border-t border-nue-taupe" />
        <ListaEquipe
          titulo="Terceiros presentes"
          itens={form.terceiros as unknown as EquipeItem[]}
          onChange={(v) => onChangeTerceiros(v as unknown as TerceiroItem[])}
          onCommit={onCommit}
          chaveSecundaria="papel"
          placeholderSecundario="Papel"
          labelAdicionar="Adicionar terceiro"
        />
      </div>
    </CardSecao>
  );
}

type LinhaEditavel = { nome: string; funcao?: string; papel?: string } & Record<string, string>;

function ListaEquipe<T extends LinhaEditavel>({
  titulo,
  itens,
  onChange,
  onCommit,
  chaveSecundaria,
  placeholderSecundario,
  labelAdicionar,
}: {
  titulo: string;
  itens: T[];
  onChange: (v: T[]) => void;
  onCommit: () => void;
  chaveSecundaria: "funcao" | "papel";
  placeholderSecundario: string;
  labelAdicionar: string;
}) {
  function atualizar(idx: number, campo: "nome" | "funcao" | "papel", valor: string) {
    const novo = itens.slice();
    novo[idx] = { ...novo[idx], [campo]: valor } as T;
    onChange(novo);
  }
  function remover(idx: number) {
    const novo = itens.slice();
    novo.splice(idx, 1);
    onChange(novo);
    setTimeout(onCommit, 0);
  }
  function adicionar() {
    const novoItem = { nome: "", [chaveSecundaria]: "" } as unknown as T;
    onChange([...itens, novoItem]);
  }
  return (
    <div>
      <Label>{titulo}</Label>
      <div className="space-y-2">
        {itens.map((it, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={it.nome}
              onChange={(e) => atualizar(idx, "nome", e.target.value)}
              onBlur={onCommit}
              placeholder="Nome"
              className="h-9 flex-1 rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black focus:outline-none focus:border-nue-graphite"
              style={{ flexBasis: "60%" }}
            />
            <input
              type="text"
              value={(it[chaveSecundaria] ?? "") as string}
              onChange={(e) => atualizar(idx, chaveSecundaria, e.target.value)}
              onBlur={onCommit}
              placeholder={placeholderSecundario}
              className="h-9 rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black focus:outline-none focus:border-nue-graphite"
              style={{ flexBasis: "35%" }}
            />
            <button
              type="button"
              onClick={() => remover(idx)}
              aria-label="Remover"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-nue-graphite hover:bg-nue-taupe/40 hover:text-[#8C3A2E]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={adicionar}
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-nue-black hover:underline"
      >
        <Plus className="h-3.5 w-3.5" />
        {labelAdicionar}
      </button>
    </div>
  );
}

/* ---------------- Seção 3 — Registros ---------------- */

function SecaoRegistros({
  form,
  erro,
  onChange,
  onBlurDebounced,
  onBlurImediato,
  registrarRef,
}: {
  form: FormRdoState;
  erro?: string;
  onChange: <K extends keyof FormRdoState>(chave: K, valor: FormRdoState[K]) => void;
  onBlurDebounced: (chave: string, ms?: number) => void;
  onBlurImediato: () => void;
  registrarRef: (el: HTMLTextAreaElement | null) => void;
}) {
  return (
    <CardSecao titulo="Registros do dia">
      <div className="space-y-4">
        <div>
          <Label htmlFor="registros">Registros</Label>
          <textarea
            ref={registrarRef}
            id="registros"
            value={form.registros}
            onChange={(e) => {
              onChange("registros", e.target.value);
              onBlurDebounced("registros");
            }}
            onBlur={onBlurImediato}
            placeholder="Descreva o que foi executado, observações da obra, condições encontradas, conversas com cliente"
            rows={8}
            className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-nue-black focus:outline-none focus:border-nue-graphite ${
              erro ? "border-[#8C3A2E]" : "border-nue-taupe"
            }`}
          />
          <ErroCampo msg={erro} />
        </div>
        <div>
          <Label htmlFor="proximos_passos">Próximos passos (opcional)</Label>
          <textarea
            id="proximos_passos"
            value={form.proximos_passos}
            onChange={(e) => {
              onChange("proximos_passos", e.target.value);
              onBlurDebounced("proximos_passos");
            }}
            onBlur={onBlurImediato}
            placeholder="O que ficou para próxima visita"
            rows={4}
            className="w-full rounded-sm border border-nue-taupe bg-white px-3 py-2 text-sm text-nue-black focus:outline-none focus:border-nue-graphite"
          />
        </div>
      </div>
    </CardSecao>
  );
}

/* ---------------- Seção 4 — Pendências ---------------- */

const PRIORIDADE_OPCOES: { v: Prioridade; label: string; bg: string; fg: string }[] = [
  { v: "alta", label: "Alta", bg: "#F1DDD8", fg: "#8C3A2E" },
  { v: "media", label: "Média", bg: "#F1E9DA", fg: "#A07B3F" },
  { v: "baixa", label: "Baixa", bg: "#E6E4DF", fg: "#41423E" },
];

function SecaoPendencias({
  itens,
  onChange,
  onCommit,
  ambienteId = null,
  titulo = "Pendências",
  vazioMsg = "Nenhuma pendência registrada",
  labelAdicionar = "Adicionar pendência",
  comoCard = true,
}: {
  itens: PendenciaItem[];
  onChange: (v: PendenciaItem[]) => void;
  onCommit: () => void;
  ambienteId?: string | null;
  titulo?: string;
  vazioMsg?: string;
  labelAdicionar?: string;
  comoCard?: boolean;
}) {
  // Trabalhamos sempre sobre a lista global. Aqui mostramos só os do escopo,
  // mas as edições preservam a ordem global.
  const indicesEscopo = itens
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (p.ambiente_id ?? null) === ambienteId);

  function atualizar(idxGlobal: number, patch: Partial<PendenciaItem>) {
    const novo = itens.slice();
    novo[idxGlobal] = { ...novo[idxGlobal], ...patch };
    onChange(novo);
  }
  function remover(idxGlobal: number) {
    const novo = itens.slice();
    novo.splice(idxGlobal, 1);
    onChange(novo);
    setTimeout(onCommit, 0);
  }
  function adicionar() {
    onChange([
      ...itens,
      { descricao: "", prioridade: "media", ambiente_id: ambienteId },
    ]);
  }

  const conteudo = (
    <>
      {indicesEscopo.length === 0 ? (
        <p className="text-sm text-nue-graphite">{vazioMsg}</p>
      ) : (
        <ul className="space-y-3">
          {indicesEscopo.map(({ p: it, i: idx }) => (
            <li key={idx} className="space-y-2">
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={it.descricao}
                  onChange={(e) => atualizar(idx, { descricao: e.target.value })}
                  onBlur={onCommit}
                  placeholder="Descreva a pendência"
                  className="h-9 flex-1 rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black focus:outline-none focus:border-nue-graphite"
                />
                <button
                  type="button"
                  onClick={() => remover(idx)}
                  aria-label="Remover"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-nue-graphite hover:bg-nue-taupe/40 hover:text-[#8C3A2E]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {PRIORIDADE_OPCOES.map((p) => {
                  const ativo = it.prioridade === p.v;
                  return (
                    <button
                      key={p.v}
                      type="button"
                      onClick={() => {
                        atualizar(idx, { prioridade: p.v });
                        setTimeout(onCommit, 0);
                      }}
                      className={`rounded-sm border px-2.5 py-1 text-[11px] uppercase transition-colors ${
                        ativo ? "border-transparent" : "border-nue-taupe text-nue-graphite hover:bg-nue-taupe/40"
                      }`}
                      style={
                        ativo
                          ? {
                              backgroundColor: p.bg,
                              color: p.fg,
                              fontFamily: "var(--font-mono)",
                              letterSpacing: "0.06em",
                              fontWeight: 500,
                            }
                          : { fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }
                      }
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={adicionar}
        className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-nue-black hover:underline"
      >
        <Plus className="h-3.5 w-3.5" />
        {labelAdicionar}
      </button>
    </>
  );

  if (comoCard) return <CardSecao titulo={titulo}>{conteudo}</CardSecao>;
  return <div>{conteudo}</div>;
}

/* ---------------- Seção 5 — Pontos de atenção ---------------- */

function SecaoPontosAtencao({
  itens,
  onChange,
  onCommit,
  ambienteId = null,
  titulo = "Pontos de atenção",
  vazioMsg = "Nenhum ponto registrado",
  labelAdicionar = "Adicionar ponto de atenção",
  comoCard = true,
}: {
  itens: PontoAtencaoItem[];
  onChange: (v: PontoAtencaoItem[]) => void;
  onCommit: () => void;
  ambienteId?: string | null;
  titulo?: string;
  vazioMsg?: string;
  labelAdicionar?: string;
  comoCard?: boolean;
}) {
  const indicesEscopo = itens
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (p.ambiente_id ?? null) === ambienteId);

  function atualizar(idxGlobal: number, valor: string) {
    const novo = itens.slice();
    novo[idxGlobal] = { ...novo[idxGlobal], descricao: valor };
    onChange(novo);
  }
  function remover(idxGlobal: number) {
    const novo = itens.slice();
    novo.splice(idxGlobal, 1);
    onChange(novo);
    setTimeout(onCommit, 0);
  }
  function adicionar() {
    onChange([...itens, { descricao: "", ambiente_id: ambienteId }]);
  }

  const conteudo = (
    <>
      {indicesEscopo.length === 0 ? (
        <p className="text-sm text-nue-graphite">{vazioMsg}</p>
      ) : (
        <ul className="space-y-2">
          {indicesEscopo.map(({ p: it, i: idx }) => (
            <li key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={it.descricao}
                onChange={(e) => atualizar(idx, e.target.value)}
                onBlur={onCommit}
                placeholder="Descreva o ponto de atenção"
                className="h-9 flex-1 rounded-sm border border-nue-taupe bg-white px-3 text-sm text-nue-black focus:outline-none focus:border-nue-graphite"
              />
              <button
                type="button"
                onClick={() => remover(idx)}
                aria-label="Remover"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-nue-graphite hover:bg-nue-taupe/40 hover:text-[#8C3A2E]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={adicionar}
        className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-nue-black hover:underline"
      >
        <Plus className="h-3.5 w-3.5" />
        {labelAdicionar}
      </button>
    </>
  );

  if (comoCard) return <CardSecao titulo={titulo}>{conteudo}</CardSecao>;
  return <div>{conteudo}</div>;
}

/* ---------------- Rodapé fixo ---------------- */

function RodapeFixo({
  saveStatus,
  finalizando,
  onSalvarRascunho,
  onFinalizar,
  onRetry,
}: {
  saveStatus: SaveStatus;
  finalizando: boolean;
  onSalvarRascunho: () => void;
  onFinalizar: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-nue-taupe bg-white"
      style={{ padding: "12px 24px" }}
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 md:pl-60">
        <IndicadorSave saveStatus={saveStatus} onRetry={onRetry} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSalvarRascunho}
            disabled={finalizando}
            className="h-9 rounded-sm border border-nue-taupe bg-white px-4 text-sm text-nue-black transition-colors hover:bg-nue-taupe/40 disabled:opacity-40"
          >
            Salvar rascunho
          </button>
          <button
            type="button"
            onClick={onFinalizar}
            disabled={finalizando}
            className="h-9 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {finalizando ? "Finalizando..." : "Finalizar RDO"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Diálogo confirmar ---------------- */

function DialogoConfirmar({
  onCancelar,
  onDescartar,
}: {
  onCancelar: () => void;
  onDescartar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-nue-black/60" onClick={onCancelar} aria-hidden />
      <div className="relative w-full max-w-[420px] rounded-md bg-white shadow-lg">
        <header className="flex items-center justify-between border-b border-nue-taupe px-5 py-4">
          <h2 className="text-lg text-nue-black" style={{ fontFamily: "var(--font-display)" }}>
            Descartar alterações?
          </h2>
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-sm p-1 text-nue-graphite hover:bg-nue-taupe/40"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="px-5 py-4 text-sm text-nue-black">
          Você tem alterações não salvas. Sair agora vai descartar essas alterações.
        </div>
        <footer className="flex justify-end gap-2 border-t border-nue-taupe px-5 py-3">
          <button
            type="button"
            onClick={onCancelar}
            className="h-9 rounded-sm border border-nue-taupe bg-white px-4 text-sm text-nue-black hover:bg-nue-taupe/40"
          >
            Continuar editando
          </button>
          <button
            type="button"
            onClick={onDescartar}
            className="h-9 rounded-sm bg-[#8C3A2E] px-4 text-sm font-medium text-white hover:opacity-90"
          >
            Descartar
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------------- Seção 6 — Ambientes trabalhados ---------------- */

function SecaoAmbientes({
  rdoId,
  obraId,
  ambientesObra,
  fotos,
  setFotos,
  pendencias,
  setPendencias,
  pontosAtencao,
  setPontosAtencao,
  observacoesAmbiente,
  setObservacoesAmbiente,
  ambientesAbertosNoRdo,
  setAmbientesAbertosNoRdo,
  onAmbientesChanged,
  onSavingStart,
  onSavingDone,
  onSavingError,
  onCommit,
  agendarPersistirOrdem,
  mensagemBloqueio,
}: {
  rdoId: string | null;
  obraId: string;
  ambientesObra: Ambiente[];
  fotos: RdoFoto[];
  setFotos: React.Dispatch<React.SetStateAction<RdoFoto[]>>;
  pendencias: PendenciaItem[];
  setPendencias: (v: PendenciaItem[]) => void;
  pontosAtencao: PontoAtencaoItem[];
  setPontosAtencao: (v: PontoAtencaoItem[]) => void;
  observacoesAmbiente: RdoObservacaoAmbiente[];
  setObservacoesAmbiente: React.Dispatch<React.SetStateAction<RdoObservacaoAmbiente[]>>;
  ambientesAbertosNoRdo: Set<string>;
  setAmbientesAbertosNoRdo: React.Dispatch<React.SetStateAction<Set<string>>>;
  onAmbientesChanged: () => void;
  onSavingStart: () => void;
  onSavingDone: () => void;
  onSavingError: (msg: string) => void;
  onCommit: () => void;
  agendarPersistirOrdem: (lista: RdoFoto[]) => void;
  mensagemBloqueio: string;
}) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [confirmandoRemoverFoto, setConfirmandoRemoverFoto] = useState<RdoFoto | null>(null);
  const [confirmandoRemoverAmbiente, setConfirmandoRemoverAmbiente] = useState<{
    id: string;
    nome: string;
  } | null>(null);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [criandoNovo, setCriandoNovo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [criandoBusy, setCriandoBusy] = useState(false);
  const [ordemLocal, setOrdemLocal] = useState<string[]>([]);
  const debounceLegendaRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const debounceObsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const desabilitado = !rdoId;

  const ambientesAtivosMap = useMemo(() => {
    const m = new Map<string, Ambiente>();
    for (const a of ambientesObra) if (a.ativo) m.set(a.id, a);
    return m;
  }, [ambientesObra]);

  // Ids de ambientes que aparecem no RDO (foto/obs/pend/ponto/abertos manualmente)
  const idsNoRdo = useMemo(() => {
    const s = new Set<string>(ambientesAbertosNoRdo);
    for (const f of fotos) if (f.ambiente_id) s.add(f.ambiente_id);
    for (const o of observacoesAmbiente)
      if (o.ambiente_id && (o.texto ?? "").trim() !== "") s.add(o.ambiente_id);
    for (const p of pendencias) if (p.ambiente_id) s.add(p.ambiente_id);
    for (const p of pontosAtencao) if (p.ambiente_id) s.add(p.ambiente_id);
    return s;
  }, [ambientesAbertosNoRdo, fotos, observacoesAmbiente, pendencias, pontosAtencao]);

  // Ordem visual: começa pela ordem da obra; ids fora da obra (legacy) vão pro fim
  const blocosOrdenados = useMemo(() => {
    type Bloco = { id: string; nome: string; ativo: boolean };
    const out: Bloco[] = [];
    const seen = new Set<string>();
    for (const a of ambientesObra) {
      if (idsNoRdo.has(a.id)) {
        out.push({ id: a.id, nome: a.nome, ativo: a.ativo });
        seen.add(a.id);
      }
    }
    for (const id of idsNoRdo) {
      if (seen.has(id)) continue;
      const f = fotos.find((x) => x.ambiente_id === id);
      out.push({ id, nome: f?.ambiente?.nome ?? "Ambiente removido", ativo: false });
      seen.add(id);
    }
    // Aplica reordenação local (somente visual)
    if (ordemLocal.length > 0) {
      const map = new Map(out.map((b) => [b.id, b]));
      const reorder: Bloco[] = [];
      for (const id of ordemLocal) {
        const b = map.get(id);
        if (b) {
          reorder.push(b);
          map.delete(id);
        }
      }
      for (const b of map.values()) reorder.push(b);
      return reorder;
    }
    return out;
  }, [ambientesObra, idsNoRdo, fotos, ordemLocal]);

  const ambientesDisponiveisDropdown = useMemo(
    () => ambientesObra.filter((a) => a.ativo && !idsNoRdo.has(a.id)),
    [ambientesObra, idsNoRdo],
  );

  function moverBloco(id: string, delta: -1 | 1) {
    const lista = blocosOrdenados.map((b) => b.id);
    const idx = lista.indexOf(id);
    if (idx === -1) return;
    const novo = idx + delta;
    if (novo < 0 || novo >= lista.length) return;
    const arr = lista.slice();
    const [it] = arr.splice(idx, 1);
    arr.splice(novo, 0, it);
    setOrdemLocal(arr);
  }

  function fotosDoAmbiente(id: string): RdoFoto[] {
    return fotos.filter((f) => f.ambiente_id === id);
  }

  function obsDoAmbiente(id: string): string {
    return observacoesAmbiente.find((o) => o.ambiente_id === id)?.texto ?? "";
  }

  function setObsLocal(ambiente_id: string, texto: string) {
    setObservacoesAmbiente((arr) => {
      const idx = arr.findIndex((o) => o.ambiente_id === ambiente_id);
      if (idx === -1) {
        return [
          ...arr,
          {
            id: `tmp-${ambiente_id}`,
            rdo_id: rdoId ?? "",
            ambiente_id,
            texto,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as RdoObservacaoAmbiente,
        ];
      }
      const novo = arr.slice();
      novo[idx] = { ...novo[idx], texto };
      return novo;
    });
  }

  function alterarObs(ambiente_id: string, texto: string) {
    if (!rdoId) return;
    setObsLocal(ambiente_id, texto);
    const timers = debounceObsRef.current;
    const t = timers.get(ambiente_id);
    if (t) clearTimeout(t);
    timers.set(
      ambiente_id,
      setTimeout(async () => {
        timers.delete(ambiente_id);
        onSavingStart();
        try {
          if (texto.trim() === "") {
            await removerObservacaoAmbiente(rdoId, ambiente_id);
          } else {
            await upsertObservacaoAmbiente(rdoId, ambiente_id, texto);
          }
          onSavingDone();
        } catch (err) {
          onSavingError(err instanceof Error ? err.message : "Erro");
        }
      }, 800),
    );
  }

  async function processarArquivos(files: FileList | File[], ambiente_id: string) {
    if (!rdoId) return;
    const arr = Array.from(files);
    for (const file of arr) {
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setUploads((u) => [
        ...u,
        { id: tempId, nome: file.name, status: "uploading", progresso: 10, file, ambiente_id },
      ]);
      onSavingStart();
      try {
        const progT = setInterval(() => {
          setUploads((u) =>
            u.map((x) => (x.id === tempId && x.progresso < 85 ? { ...x, progresso: x.progresso + 10 } : x)),
          );
        }, 250);
        const novaFotoBase = await uploadFoto({
          file,
          obra_id: obraId,
          rdo_id: rdoId,
          ordem: fotos.length + uploads.length,
          ambiente_id,
        });
        clearInterval(progT);
        const ambientePick = ambientesAtivosMap.get(ambiente_id) ?? null;
        const novaFoto: RdoFoto = {
          ...novaFotoBase,
          ambiente: ambientePick
            ? { id: ambientePick.id, nome: ambientePick.nome, ordem: ambientePick.ordem, ativo: ambientePick.ativo }
            : null,
        };
        setUploads((u) => u.filter((x) => x.id !== tempId));
        setFotos((f) => [...f, novaFoto]);
        onSavingDone();
      } catch (err) {
        if (err instanceof ArquivoMuitoGrandeError) {
          toast.error(`Arquivo "${err.nomeArquivo}" excede 10MB e foi recusado`);
          setUploads((u) => u.filter((x) => x.id !== tempId));
        } else {
          const msg = err instanceof Error ? err.message : "Erro";
          setUploads((u) => u.map((x) => (x.id === tempId ? { ...x, status: "erro", erro: msg } : x)));
          onSavingError(msg);
        }
      }
    }
  }

  async function moverFoto(idGlobal: string, delta: -1 | 1) {
    const idx = fotos.findIndex((f) => f.id === idGlobal);
    if (idx === -1) return;
    const novo = idx + delta;
    if (novo < 0 || novo >= fotos.length) return;
    const lista = fotos.slice();
    const [item] = lista.splice(idx, 1);
    lista.splice(novo, 0, item);
    setFotos(lista);
    agendarPersistirOrdem(lista);
  }

  async function confirmarRemoverFoto() {
    const foto = confirmandoRemoverFoto;
    if (!foto) return;
    setConfirmandoRemoverFoto(null);
    const original = fotos;
    setFotos((f) => f.filter((x) => x.id !== foto.id));
    onSavingStart();
    try {
      await removerFoto(foto);
      onSavingDone();
    } catch (err) {
      setFotos(original);
      onSavingError(err instanceof Error ? err.message : "Erro");
      toast.error("Não foi possível remover a foto");
    }
  }

  function alterarLegenda(foto: RdoFoto, valor: string) {
    setFotos((f) => f.map((x) => (x.id === foto.id ? { ...x, legenda: valor } : x)));
    const timers = debounceLegendaRef.current;
    const t = timers.get(foto.id);
    if (t) clearTimeout(t);
    timers.set(
      foto.id,
      setTimeout(async () => {
        timers.delete(foto.id);
        onSavingStart();
        try {
          await atualizarLegendaFoto(foto.id, valor);
          onSavingDone();
        } catch (err) {
          onSavingError(err instanceof Error ? err.message : "Erro");
        }
      }, 800),
    );
  }

  function reTentarUpload(uploadId: string) {
    const item = uploads.find((u) => u.id === uploadId);
    if (!item || !item.file || !item.ambiente_id) return;
    setUploads((u) => u.filter((x) => x.id !== uploadId));
    processarArquivos([item.file], item.ambiente_id);
  }

  async function criarNovoAmbiente() {
    const nome = nomeNovo.trim();
    if (!nome || criandoBusy) return;
    setCriandoBusy(true);
    try {
      const novo = await criarAmbiente(obraId, nome);
      setAmbientesAbertosNoRdo((s) => new Set(s).add(novo.id));
      setNomeNovo("");
      setCriandoNovo(false);
      setDropdownAberto(false);
      onAmbientesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar ambiente");
    } finally {
      setCriandoBusy(false);
    }
  }

  async function confirmarRemoverAmbiente() {
    const alvo = confirmandoRemoverAmbiente;
    if (!alvo || !rdoId) return;
    setConfirmandoRemoverAmbiente(null);
    onSavingStart();
    try {
      await removerAmbienteDoRdo({ rdo_id: rdoId, ambiente_id: alvo.id });
      // Limpa estado local
      setFotos((f) => f.filter((x) => x.ambiente_id !== alvo.id));
      setObservacoesAmbiente((arr) => arr.filter((o) => o.ambiente_id !== alvo.id));
      setPendencias(pendencias.filter((p) => p.ambiente_id !== alvo.id));
      setPontosAtencao(pontosAtencao.filter((p) => p.ambiente_id !== alvo.id));
      setAmbientesAbertosNoRdo((s) => {
        const novo = new Set(s);
        novo.delete(alvo.id);
        return novo;
      });
      setOrdemLocal((arr) => arr.filter((id) => id !== alvo.id));
      onSavingDone();
      onCommit();
    } catch (err) {
      onSavingError(err instanceof Error ? err.message : "Erro");
      toast.error("Não foi possível remover o ambiente do RDO");
    }
  }

  function contarConteudoAmbiente(id: string): {
    fotos: number;
    pendencias: number;
    pontos: number;
    obs: boolean;
  } {
    return {
      fotos: fotos.filter((f) => f.ambiente_id === id).length,
      pendencias: pendencias.filter((p) => p.ambiente_id === id).length,
      pontos: pontosAtencao.filter((p) => p.ambiente_id === id).length,
      obs: (observacoesAmbiente.find((o) => o.ambiente_id === id)?.texto ?? "").trim() !== "",
    };
  }

  return (
    <CardSecao titulo={`Ambientes trabalhados (${blocosOrdenados.length})`}>
      {desabilitado ? (
        <p className="text-sm text-nue-graphite">{mensagemBloqueio}</p>
      ) : (
        <div className="space-y-4">
          {blocosOrdenados.length === 0 && (
            <p className="text-sm text-nue-graphite">
              Nenhum ambiente trabalhado neste RDO. Adicione um abaixo para começar.
            </p>
          )}

          {blocosOrdenados.map((bloco, i) => {
            const isPrim = i === 0;
            const isUlt = i === blocosOrdenados.length - 1;
            return (
              <div
                key={`bloco:${bloco.id}`}
                className="rounded-sm border border-nue-taupe bg-white"
                style={{ padding: "14px 16px" }}
              >
                <header className="flex items-center justify-between gap-2">
                  <h3
                    className="text-nue-black"
                    style={{ fontFamily: "var(--font-display)", fontSize: 17 }}
                  >
                    {bloco.nome}
                    {!bloco.ativo && (
                      <span
                        className="ml-2 text-[10px] uppercase text-nue-graphite"
                        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
                      >
                        inativo
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moverBloco(bloco.id, -1)}
                      disabled={isPrim}
                      aria-label="Subir"
                      className="flex h-7 w-7 items-center justify-center rounded-sm text-nue-graphite hover:bg-nue-taupe/40 disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moverBloco(bloco.id, 1)}
                      disabled={isUlt}
                      aria-label="Descer"
                      className="flex h-7 w-7 items-center justify-center rounded-sm text-nue-graphite hover:bg-nue-taupe/40 disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmandoRemoverAmbiente({ id: bloco.id, nome: bloco.nome })
                      }
                      className="ml-1 inline-flex items-center gap-1 rounded-sm border border-nue-taupe px-2 py-1 text-[12px] text-[#8C3A2E] hover:bg-nue-taupe/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover do RDO
                    </button>
                  </div>
                </header>

                {/* Observações */}
                <div className="mt-3">
                  <Label htmlFor={`obs-${bloco.id}`}>Observações</Label>
                  <textarea
                    id={`obs-${bloco.id}`}
                    rows={4}
                    value={obsDoAmbiente(bloco.id)}
                    onChange={(e) => alterarObs(bloco.id, e.target.value)}
                    placeholder={`Observações sobre ${bloco.nome}`}
                    className="block w-full rounded-sm border border-nue-taupe bg-white px-3 py-2 text-sm text-nue-black focus:outline-none focus:border-nue-graphite"
                  />
                </div>

                {/* Fotos */}
                <div className="mt-4">
                  <Label>Fotos</Label>
                  <CardAmbiente
                    nome=""
                    fotos={fotosDoAmbiente(bloco.id)}
                    uploads={uploads.filter((u) => u.ambiente_id === bloco.id)}
                    onAdicionarFotos={(files) => processarArquivos(files, bloco.id)}
                    onAbrirFoto={(foto) => {
                      const idx = fotos.findIndex((f) => f.id === foto.id);
                      if (idx !== -1) setLightboxIdx(idx);
                    }}
                    onMoverEsquerda={(foto) => moverFoto(foto.id, -1)}
                    onMoverDireita={(foto) => moverFoto(foto.id, 1)}
                    onRemoverFoto={(foto) => setConfirmandoRemoverFoto(foto)}
                    onLegenda={alterarLegenda}
                    onRetryUpload={reTentarUpload}
                    fotosTodas={fotos}
                    semBorda
                  />
                </div>

                {/* Pendências */}
                <div className="mt-4">
                  <Label>Pendências</Label>
                  <SecaoPendencias
                    itens={pendencias}
                    onChange={setPendencias}
                    onCommit={onCommit}
                    ambienteId={bloco.id}
                    comoCard={false}
                    vazioMsg="Nenhuma pendência neste ambiente"
                    labelAdicionar="Adicionar pendência"
                  />
                </div>

                {/* Pontos de atenção */}
                <div className="mt-4">
                  <Label>Pontos de atenção</Label>
                  <SecaoPontosAtencao
                    itens={pontosAtencao}
                    onChange={setPontosAtencao}
                    onCommit={onCommit}
                    ambienteId={bloco.id}
                    comoCard={false}
                    vazioMsg="Nenhum ponto neste ambiente"
                    labelAdicionar="Adicionar ponto de atenção"
                  />
                </div>
              </div>
            );
          })}

          {/* Botão adicionar ambiente */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setDropdownAberto((v) => !v);
                setCriandoNovo(false);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-nue-taupe bg-white py-3 text-sm text-nue-black transition-colors hover:bg-nue-taupe/40"
            >
              <Plus className="h-4 w-4" />
              Adicionar ambiente a este RDO
            </button>
            {dropdownAberto && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => {
                    setDropdownAberto(false);
                    setCriandoNovo(false);
                  }}
                  aria-hidden
                />
                <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-sm border border-nue-taupe bg-white shadow-md">
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {ambientesDisponiveisDropdown.length === 0 && !criandoNovo && (
                      <li
                        className="px-3 py-2 text-[12px] text-nue-graphite"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        Todos os ambientes ativos já estão neste RDO.
                      </li>
                    )}
                    {ambientesDisponiveisDropdown.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setAmbientesAbertosNoRdo((s) => new Set(s).add(a.id));
                            setDropdownAberto(false);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-nue-black hover:bg-nue-taupe/40"
                        >
                          {a.nome}
                        </button>
                      </li>
                    ))}
                    <li className="border-t border-nue-taupe">
                      {!criandoNovo ? (
                        <button
                          type="button"
                          onClick={() => setCriandoNovo(true)}
                          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-nue-black hover:bg-nue-taupe/40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Cadastrar novo ambiente
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 px-2 py-2">
                          <input
                            type="text"
                            autoFocus
                            value={nomeNovo}
                            onChange={(e) => setNomeNovo(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                criarNovoAmbiente();
                              } else if (e.key === "Escape") {
                                setCriandoNovo(false);
                                setNomeNovo("");
                              }
                            }}
                            placeholder="Ex: Cozinha"
                            className="h-8 flex-1 rounded-sm border border-nue-taupe bg-white px-2 text-sm text-nue-black focus:outline-none focus:border-nue-graphite"
                          />
                          <button
                            type="button"
                            onClick={criarNovoAmbiente}
                            disabled={!nomeNovo.trim() || criandoBusy}
                            className="h-8 rounded-sm bg-nue-black px-3 text-[12px] font-medium text-nue-offwhite hover:opacity-90 disabled:opacity-40"
                          >
                            {criandoBusy ? "..." : "Criar"}
                          </button>
                        </div>
                      )}
                    </li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {lightboxIdx !== null && (
        <Lightbox
          fotos={fotos}
          indiceInicial={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      {confirmandoRemoverFoto && (
        <DialogoSimples
          titulo="Remover esta foto?"
          confirmLabel="Remover"
          onCancelar={() => setConfirmandoRemoverFoto(null)}
          onConfirmar={confirmarRemoverFoto}
        />
      )}

      {confirmandoRemoverAmbiente && (() => {
        const c = contarConteudoAmbiente(confirmandoRemoverAmbiente.id);
        const partes: string[] = [];
        partes.push(`${c.fotos} ${c.fotos === 1 ? "foto" : "fotos"}`);
        partes.push(`${c.pendencias} ${c.pendencias === 1 ? "pendência" : "pendências"}`);
        partes.push(`${c.pontos} ${c.pontos === 1 ? "ponto de atenção" : "pontos de atenção"}`);
        const obsTxt = c.obs ? " e a observação" : "";
        return (
          <DialogoSimples
            titulo={`Remover ambiente "${confirmandoRemoverAmbiente.nome}" deste RDO?`}
            mensagem={`Isso vai apagar ${partes.join(", ")}${obsTxt} registrados neste RDO. Outros RDOs não são afetados.`}
            confirmLabel="Remover do RDO"
            onCancelar={() => setConfirmandoRemoverAmbiente(null)}
            onConfirmar={confirmarRemoverAmbiente}
          />
        );
      })()}
    </CardSecao>
  );
}

function DialogoSimples({
  titulo,
  mensagem,
  confirmLabel,
  onCancelar,
  onConfirmar,
}: {
  titulo: string;
  mensagem?: string;
  confirmLabel: string;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-nue-black/60" onClick={onCancelar} />
      <div className="relative w-full max-w-[420px] rounded-md bg-white p-5 shadow-lg">
        <h3 className="text-lg text-nue-black" style={{ fontFamily: "var(--font-display)" }}>
          {titulo}
        </h3>
        {mensagem && <p className="mt-2 text-sm text-nue-black">{mensagem}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="h-9 rounded-sm border border-nue-taupe bg-white px-4 text-sm hover:bg-nue-taupe/40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className="h-9 rounded-sm bg-[#8C3A2E] px-4 text-sm font-medium text-white hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Seção 7 — Fotos (legado, não usada) ---------------- */

type UploadItem = {
  id: string;
  nome: string;
  status: "uploading" | "erro";
  progresso: number;
  erro?: string;
  file?: File;
  ambiente_id: string | null;
};

function SecaoFotos({
  rdoId,
  obraId,
  fotos,
  setFotos,
  ambientesObra,
  onAmbientesChanged,
  onSavingStart,
  onSavingDone,
  onSavingError,
  agendarPersistirOrdem,
  mensagemBloqueio,
}: {
  rdoId: string | null;
  obraId: string;
  fotos: RdoFoto[];
  setFotos: React.Dispatch<React.SetStateAction<RdoFoto[]>>;
  ambientesObra: Ambiente[];
  onAmbientesChanged: () => void;
  onSavingStart: () => void;
  onSavingDone: () => void;
  onSavingError: (msg: string) => void;
  agendarPersistirOrdem: (lista: RdoFoto[]) => void;
  mensagemBloqueio: string;
}) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [confirmandoRemover, setConfirmandoRemover] = useState<RdoFoto | null>(null);
  const [ambientesAbertos, setAmbientesAbertos] = useState<Set<string>>(new Set());
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [criandoNovo, setCriandoNovo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [criandoBusy, setCriandoBusy] = useState(false);
  const debounceLegendaRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const desabilitado = !rdoId;

  const ambientesAtivosMap = useMemo(() => {
    const m = new Map<string, Ambiente>();
    for (const a of ambientesObra) if (a.ativo) m.set(a.id, a);
    return m;
  }, [ambientesObra]);

  // ids de ambientes que aparecem (porque têm fotos OU foram abertos manualmente)
  const idsComFotos = useMemo(() => {
    const s = new Set<string>();
    for (const f of fotos) if (f.ambiente_id) s.add(f.ambiente_id);
    return s;
  }, [fotos]);

  const idsVisiveis = useMemo(() => {
    const s = new Set<string>([...idsComFotos, ...ambientesAbertos]);
    return s;
  }, [idsComFotos, ambientesAbertos]);

  const cardsOrdenados = useMemo(() => {
    // ordena pelos ambientes da obra (ordem). Inclui também ids cujo ambiente foi
    // desativado mas que ainda têm fotos (legacy) — buscamos via foto.ambiente.
    type Card = { id: string; ambiente: Pick<Ambiente, "id" | "nome" | "ordem"> | null };
    const cards: Card[] = [];
    const seen = new Set<string>();
    // primeiro percorre ambientes ativos da obra na ordem deles
    for (const a of ambientesObra) {
      if (a.ativo && idsVisiveis.has(a.id)) {
        cards.push({ id: a.id, ambiente: a });
        seen.add(a.id);
      }
    }
    // depois ids legacy (ambiente desativado ou removido) — usa nome via join na foto
    for (const id of idsVisiveis) {
      if (seen.has(id)) continue;
      const f = fotos.find((x) => x.ambiente_id === id);
      const nome = f?.ambiente?.nome ?? "Ambiente removido";
      const ordem = f?.ambiente?.ordem ?? 999999;
      cards.push({ id, ambiente: { id, nome, ordem } });
      seen.add(id);
    }
    cards.sort((a, b) => (a.ambiente?.ordem ?? 0) - (b.ambiente?.ordem ?? 0));
    return cards;
  }, [ambientesObra, idsVisiveis, fotos]);

  const temFotosSemAmbiente = useMemo(
    () => fotos.some((f) => f.ambiente_id == null),
    [fotos],
  );

  const ambientesDisponiveisDropdown = useMemo(
    () => ambientesObra.filter((a) => a.ativo && !idsVisiveis.has(a.id)),
    [ambientesObra, idsVisiveis],
  );

  function fotosDoAmbiente(id: string | null): RdoFoto[] {
    return fotos.filter((f) => (f.ambiente_id ?? null) === id);
  }

  async function processarArquivos(files: FileList | File[], ambiente_id: string | null) {
    if (!rdoId) return;
    const arr = Array.from(files);
    for (const file of arr) {
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setUploads((u) => [...u, { id: tempId, nome: file.name, status: "uploading", progresso: 10, file, ambiente_id }]);
      onSavingStart();
      try {
        const progT = setInterval(() => {
          setUploads((u) =>
            u.map((x) => (x.id === tempId && x.progresso < 85 ? { ...x, progresso: x.progresso + 10 } : x)),
          );
        }, 250);
        const novaFotoBase = await uploadFoto({
          file,
          obra_id: obraId,
          rdo_id: rdoId,
          ordem: fotos.length + uploads.length,
          ambiente_id,
        });
        clearInterval(progT);
        const ambientePick = ambiente_id ? ambientesAtivosMap.get(ambiente_id) ?? null : null;
        const novaFoto: RdoFoto = {
          ...novaFotoBase,
          ambiente: ambientePick
            ? { id: ambientePick.id, nome: ambientePick.nome, ordem: ambientePick.ordem, ativo: ambientePick.ativo }
            : null,
        };
        setUploads((u) => u.filter((x) => x.id !== tempId));
        setFotos((f) => [...f, novaFoto]);
        onSavingDone();
      } catch (err) {
        if (err instanceof ArquivoMuitoGrandeError) {
          toast.error(`Arquivo "${err.nomeArquivo}" excede 10MB e foi recusado`);
          setUploads((u) => u.filter((x) => x.id !== tempId));
        } else {
          const msg = err instanceof Error ? err.message : "Erro";
          setUploads((u) =>
            u.map((x) => (x.id === tempId ? { ...x, status: "erro", erro: msg } : x)),
          );
          onSavingError(msg);
        }
      }
    }
  }

  async function moverFoto(idGlobal: string, delta: -1 | 1) {
    const idx = fotos.findIndex((f) => f.id === idGlobal);
    if (idx === -1) return;
    const novo = idx + delta;
    if (novo < 0 || novo >= fotos.length) return;
    const lista = fotos.slice();
    const [item] = lista.splice(idx, 1);
    lista.splice(novo, 0, item);
    setFotos(lista);
    agendarPersistirOrdem(lista);
  }

  async function confirmarRemover() {
    const foto = confirmandoRemover;
    if (!foto) return;
    setConfirmandoRemover(null);
    const original = fotos;
    setFotos((f) => f.filter((x) => x.id !== foto.id));
    onSavingStart();
    try {
      await removerFoto(foto);
      onSavingDone();
    } catch (err) {
      setFotos(original);
      const msg = err instanceof Error ? err.message : "Erro";
      onSavingError(msg);
      toast.error("Não foi possível remover a foto");
    }
  }

  function alterarLegenda(foto: RdoFoto, valor: string) {
    setFotos((f) => f.map((x) => (x.id === foto.id ? { ...x, legenda: valor } : x)));
    const timers = debounceLegendaRef.current;
    const t = timers.get(foto.id);
    if (t) clearTimeout(t);
    timers.set(
      foto.id,
      setTimeout(async () => {
        timers.delete(foto.id);
        onSavingStart();
        try {
          await atualizarLegendaFoto(foto.id, valor);
          onSavingDone();
        } catch (err) {
          onSavingError(err instanceof Error ? err.message : "Erro");
        }
      }, 800),
    );
  }

  function reTentar(uploadId: string) {
    const item = uploads.find((u) => u.id === uploadId);
    if (!item || !item.file) return;
    setUploads((u) => u.filter((x) => x.id !== uploadId));
    processarArquivos([item.file], item.ambiente_id);
  }

  async function criarNovoAmbiente() {
    const nome = nomeNovo.trim();
    if (!nome || criandoBusy) return;
    setCriandoBusy(true);
    try {
      const novo = await criarAmbiente(obraId, nome);
      setAmbientesAbertos((s) => new Set(s).add(novo.id));
      setNomeNovo("");
      setCriandoNovo(false);
      setDropdownAberto(false);
      onAmbientesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar ambiente");
    } finally {
      setCriandoBusy(false);
    }
  }

  return (
    <section
      className="rounded-sm border border-nue-taupe bg-white"
      style={{ padding: "16px 20px" }}
    >
      <header className="flex items-center gap-2">
        <h2
          className="text-nue-black"
          style={{ fontFamily: "var(--font-display)", fontSize: 17 }}
        >
          Fotos
        </h2>
        <span
          className="text-nue-graphite"
          style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
        >
          ({fotos.length})
        </span>
      </header>

      <div className="mt-4">
        {desabilitado ? (
          <div className="opacity-50">
            <p
              className="text-nue-graphite"
              style={{ fontFamily: "var(--font-sans)", fontSize: 13 }}
            >
              {mensagemBloqueio}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {cardsOrdenados.map((card) => (
              <CardAmbiente
                key={`amb:${card.id}`}
                nome={card.ambiente?.nome ?? "Ambiente"}
                fotos={fotosDoAmbiente(card.id)}
                uploads={uploads.filter((u) => u.ambiente_id === card.id)}
                onAdicionarFotos={(files) => processarArquivos(files, card.id)}
                onAbrirFoto={(foto) => {
                  const idx = fotos.findIndex((f) => f.id === foto.id);
                  if (idx !== -1) setLightboxIdx(idx);
                }}
                onMoverEsquerda={(foto) => moverFoto(foto.id, -1)}
                onMoverDireita={(foto) => moverFoto(foto.id, 1)}
                onRemoverFoto={(foto) => setConfirmandoRemover(foto)}
                onLegenda={alterarLegenda}
                onRetryUpload={reTentar}
                fotosTodas={fotos}
              />
            ))}

            {temFotosSemAmbiente && (
              <CardAmbiente
                key="amb:__sem__"
                nome="Fotos sem ambiente"
                fotos={fotosDoAmbiente(null)}
                uploads={uploads.filter((u) => u.ambiente_id === null)}
                onAdicionarFotos={(files) => processarArquivos(files, null)}
                onAbrirFoto={(foto) => {
                  const idx = fotos.findIndex((f) => f.id === foto.id);
                  if (idx !== -1) setLightboxIdx(idx);
                }}
                onMoverEsquerda={(foto) => moverFoto(foto.id, -1)}
                onMoverDireita={(foto) => moverFoto(foto.id, 1)}
                onRemoverFoto={(foto) => setConfirmandoRemover(foto)}
                onLegenda={alterarLegenda}
                onRetryUpload={reTentar}
                fotosTodas={fotos}
              />
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setDropdownAberto((v) => !v);
                  setCriandoNovo(false);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-nue-taupe bg-white py-3 text-sm text-nue-black transition-colors hover:bg-nue-taupe/40"
              >
                <Plus className="h-4 w-4" />
                Adicionar fotos a um ambiente
              </button>
              {dropdownAberto && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => {
                      setDropdownAberto(false);
                      setCriandoNovo(false);
                    }}
                    aria-hidden
                  />
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-sm border border-nue-taupe bg-white shadow-md">
                    <ul className="max-h-64 overflow-y-auto py-1">
                      {ambientesDisponiveisDropdown.length === 0 && !criandoNovo && (
                        <li
                          className="px-3 py-2 text-[12px] text-nue-graphite"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          Todos os ambientes ativos já estão abertos.
                        </li>
                      )}
                      {ambientesDisponiveisDropdown.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setAmbientesAbertos((s) => new Set(s).add(a.id));
                              setDropdownAberto(false);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-nue-black hover:bg-nue-taupe/40"
                          >
                            {a.nome}
                          </button>
                        </li>
                      ))}
                      <li className="border-t border-nue-taupe">
                        {!criandoNovo ? (
                          <button
                            type="button"
                            onClick={() => setCriandoNovo(true)}
                            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-nue-black hover:bg-nue-taupe/40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Cadastrar novo ambiente
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 px-2 py-2">
                            <input
                              type="text"
                              autoFocus
                              value={nomeNovo}
                              onChange={(e) => setNomeNovo(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  criarNovoAmbiente();
                                } else if (e.key === "Escape") {
                                  setCriandoNovo(false);
                                  setNomeNovo("");
                                }
                              }}
                              placeholder="Ex: Cozinha"
                              className="h-8 flex-1 rounded-sm border border-nue-taupe bg-white px-2 text-sm text-nue-black focus:outline-none focus:border-nue-graphite"
                            />
                            <button
                              type="button"
                              onClick={criarNovoAmbiente}
                              disabled={!nomeNovo.trim() || criandoBusy}
                              className="h-8 rounded-sm bg-nue-black px-3 text-[12px] font-medium text-nue-offwhite hover:opacity-90 disabled:opacity-40"
                            >
                              {criandoBusy ? "..." : "Criar"}
                            </button>
                          </div>
                        )}
                      </li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {lightboxIdx !== null && (
        <Lightbox
          fotos={fotos}
          indiceInicial={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      {confirmandoRemover && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-nue-black/60"
            onClick={() => setConfirmandoRemover(null)}
          />
          <div className="relative w-full max-w-[380px] rounded-md bg-white p-5 shadow-lg">
            <h3 className="text-lg text-nue-black" style={{ fontFamily: "var(--font-display)" }}>
              Remover esta foto?
            </h3>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmandoRemover(null)}
                className="h-9 rounded-sm border border-nue-taupe bg-white px-4 text-sm hover:bg-nue-taupe/40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRemover}
                className="h-9 rounded-sm bg-[#8C3A2E] px-4 text-sm font-medium text-white hover:opacity-90"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CardAmbiente({
  nome,
  fotos,
  uploads,
  onAdicionarFotos,
  onAbrirFoto,
  onMoverEsquerda,
  onMoverDireita,
  onRemoverFoto,
  onLegenda,
  onRetryUpload,
  fotosTodas,
}: {
  nome: string;
  fotos: RdoFoto[];
  uploads: UploadItem[];
  onAdicionarFotos: (files: FileList | File[]) => void;
  onAbrirFoto: (foto: RdoFoto) => void;
  onMoverEsquerda: (foto: RdoFoto) => void;
  onMoverDireita: (foto: RdoFoto) => void;
  onRemoverFoto: (foto: RdoFoto) => void;
  onLegenda: (foto: RdoFoto, valor: string) => void;
  onRetryUpload: (uploadId: string) => void;
  fotosTodas: RdoFoto[];
}) {
  const inputFileRef = useRef<HTMLInputElement | null>(null);
  const idxGlobal = (foto: RdoFoto) => fotosTodas.findIndex((f) => f.id === foto.id);

  return (
    <div className="rounded-sm border border-nue-taupe bg-white" style={{ padding: "12px 14px" }}>
      <div
        className="text-nue-black"
        style={{ fontFamily: "var(--font-display)", fontSize: 15 }}
      >
        {nome}
      </div>

      <div className="mt-3">
        {(fotos.length > 0 || uploads.length > 0) && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {fotos.map((foto) => {
              const idxG = idxGlobal(foto);
              return (
                <FotoTile
                  key={foto.id}
                  foto={foto}
                  isPrimeira={idxG === 0}
                  isUltima={idxG === fotosTodas.length - 1}
                  onAbrir={() => onAbrirFoto(foto)}
                  onMoverEsquerda={() => onMoverEsquerda(foto)}
                  onMoverDireita={() => onMoverDireita(foto)}
                  onRemover={() => onRemoverFoto(foto)}
                  onLegenda={(v) => onLegenda(foto, v)}
                />
              );
            })}
            {uploads.map((up) => (
              <UploadTile key={up.id} upload={up} onRetry={() => onRetryUpload(up.id)} />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => inputFileRef.current?.click()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-nue-taupe bg-white py-2.5 text-sm text-nue-black transition-colors hover:bg-nue-taupe/40"
        >
          <Camera className="h-4 w-4" />
          Adicionar fotos neste ambiente
        </button>
        <input
          ref={inputFileRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={(e) => {
            if (e.target.files) {
              onAdicionarFotos(e.target.files);
              e.target.value = "";
            }
          }}
          className="hidden"
        />
      </div>
    </div>
  );
}

function FotoTile({
  foto,
  isPrimeira,
  isUltima,
  onAbrir,
  onMoverEsquerda,
  onMoverDireita,
  onRemover,
  onLegenda,
}: {
  foto: RdoFoto;
  isPrimeira: boolean;
  isUltima: boolean;
  onAbrir: () => void;
  onMoverEsquerda: () => void;
  onMoverDireita: () => void;
  onRemover: () => void;
  onLegenda: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="group relative aspect-square overflow-hidden rounded-sm border border-nue-taupe bg-nue-taupe/40">
        <img
          src={foto.url}
          alt={foto.legenda || "Foto"}
          className="h-full w-full cursor-zoom-in object-cover"
          onClick={onAbrir}
        />
        <div className="absolute inset-0 hidden items-end justify-between gap-1 bg-nue-black/40 p-1.5 group-hover:flex">
          <button
            type="button"
            onClick={onAbrir}
            aria-label="Abrir"
            className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/90 text-nue-black hover:bg-white"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onMoverEsquerda}
              disabled={isPrimeira}
              aria-label="Mover para a esquerda"
              className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/90 text-nue-black hover:bg-white disabled:opacity-40"
            >
              <MoveLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onMoverDireita}
              disabled={isUltima}
              aria-label="Mover para a direita"
              className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/90 text-nue-black hover:bg-white disabled:opacity-40"
            >
              <MoveRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onRemover}
              aria-label="Remover"
              className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/90 text-[#8C3A2E] hover:bg-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      <input
        type="text"
        value={foto.legenda ?? ""}
        onChange={(e) => onLegenda(e.target.value)}
        placeholder="Legenda opcional"
        className="h-7 w-full rounded-sm border border-nue-taupe bg-white px-1.5 text-nue-black focus:outline-none focus:border-nue-graphite"
        style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
      />
    </div>
  );
}

function UploadTile({
  upload,
  onRetry,
}: {
  upload: UploadItem;
  onRetry: () => void;
}) {
  if (upload.status === "uploading") {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-sm border border-nue-taupe bg-nue-taupe/30">
        <Loader2 className="h-5 w-5 animate-spin text-nue-graphite" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }} className="text-nue-graphite">
          {upload.progresso}%
        </span>
      </div>
    );
  }
  return (
    <div
      className="flex aspect-square flex-col items-center justify-center gap-2 rounded-sm border p-2 text-center"
      style={{ backgroundColor: "#F1DDD8", borderColor: "#E5C2BB" }}
    >
      <span className="text-xs text-[#8C3A2E]">Falha no upload</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-sm bg-white px-2 py-1 text-[11px] text-nue-black hover:bg-nue-taupe/40"
      >
        Tentar novamente
      </button>
    </div>
  );
}

/* ---------------- Seção 7 — Assinatura ---------------- */

function SecaoAssinatura({
  ref: forwardedRef,
  rdoId,
  assinaturaUrl,
  substituindo,
  onSubstituir,
  onCancelarSubstituir,
  supervisor,
  destacarErro,
  sigPadRef,
  sigDirtyRef,
  onDirty,
  mensagemBloqueio,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  rdoId: string | null;
  assinaturaUrl: string | null;
  substituindo: boolean;
  onSubstituir: () => void;
  onCancelarSubstituir: () => void;
  supervisor: ObraComSupervisor["supervisor"];
  destacarErro: boolean;
  sigPadRef: React.MutableRefObject<SignatureCanvas | null>;
  sigDirtyRef: React.MutableRefObject<boolean>;
  onDirty: () => void;
  mensagemBloqueio: string;
}) {
  const desabilitado = !rdoId;
  const mostrarCanvas = !assinaturaUrl || substituindo;
  const [hasStrokes, setHasStrokes] = useState(false);

  function limpar() {
    sigPadRef.current?.clear();
    sigDirtyRef.current = false;
    setHasStrokes(false);
  }

  return (
    <div ref={forwardedRef}>
      <section
        className={`rounded-sm border bg-white transition-colors ${
          destacarErro ? "border-[#8C3A2E]" : "border-nue-taupe"
        }`}
        style={{ padding: "16px 20px" }}
      >
        <header className="flex items-center gap-2">
          <h2
            className="text-nue-black"
            style={{ fontFamily: "var(--font-display)", fontSize: 17 }}
          >
            Assinatura do supervisor
          </h2>
          <span
            className="text-[#8C3A2E]"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
          >
            obrigatória
          </span>
        </header>

        <div className="mt-4">
          {desabilitado ? (
            <div className="opacity-50">
              <p
                className="text-nue-graphite"
                style={{ fontFamily: "var(--font-sans)", fontSize: 13 }}
              >
                {mensagemBloqueio}
              </p>
            </div>
          ) : mostrarCanvas ? (
            <div>
              <div className="relative rounded-sm border border-nue-taupe bg-white" style={{ height: 200 }}>
                <SignatureCanvas
                  ref={(el) => {
                    sigPadRef.current = el;
                  }}
                  penColor="#0A0A0A"
                  minWidth={1.2}
                  maxWidth={2}
                  onBegin={() => {
                    sigDirtyRef.current = true;
                    setHasStrokes(true);
                    onDirty();
                  }}
                  canvasProps={{
                    className: "h-full w-full rounded-sm",
                    style: { touchAction: "none" },
                  }}
                />
                {!hasStrokes && (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center text-nue-graphite/60"
                    style={{ fontFamily: "var(--font-sans)", fontSize: 13 }}
                  >
                    Desenhe a assinatura aqui
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={limpar}
                  className="inline-flex items-center gap-1.5 text-[13px] text-nue-black hover:underline"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Limpar
                </button>
                <span
                  className="text-nue-graphite"
                  style={{ fontFamily: "var(--font-sans)", fontSize: 12 }}
                >
                  Use o dedo no tablet/celular ou o mouse no computador
                </span>
              </div>
              {assinaturaUrl && substituindo && (
                <button
                  type="button"
                  onClick={onCancelarSubstituir}
                  className="mt-2 text-[12px] text-nue-graphite underline-offset-2 hover:text-nue-black hover:underline"
                >
                  Cancelar substituição
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="rounded-sm border border-nue-taupe bg-white p-3">
                <img
                  src={assinaturaUrl}
                  alt="Assinatura"
                  className="max-h-[140px] object-contain"
                />
              </div>
              <p
                className="mt-2 text-nue-graphite"
                style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
              >
                Assinada por {supervisor?.nome ?? "—"}
              </p>
              <button
                type="button"
                onClick={onSubstituir}
                className="mt-3 h-9 rounded-sm border border-nue-taupe bg-white px-4 text-sm text-nue-black hover:bg-nue-taupe/40"
              >
                Substituir assinatura
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// Tira o aviso de import não usado
void useMemo;

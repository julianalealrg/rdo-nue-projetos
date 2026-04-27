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
import type { ObraComSupervisor, RdoCompleto, CondicaoLocal, TipoVisita, Prioridade, RdoFoto } from "@/lib/diario";
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
  CATEGORIAS_FOTO,
  type CategoriaFoto,
  atualizarFotoCampos,
  persistirOrdemFotos,
  removerFoto,
  uploadAssinatura,
  uploadFoto,
} from "@/lib/fotos";
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

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Coluna esquerda (60%) */}
        <div className="space-y-4 lg:col-span-3">
          <SecaoIdentificacao
            form={form}
            erros={erros}
            onChange={atualizarCampo}
            onCommit={agendarSaveImediato}
            registrarRef={(k, el) => refsCampos.current.set(k, el)}
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
            onChange={(novos) => {
              atualizarCampo("pendencias", novos);
            }}
            onCommit={agendarSaveImediato}
          />
        </div>

        {/* Coluna direita (40%) */}
        <div className="space-y-4 lg:col-span-2">
          <SecaoEquipe
            form={form}
            onChangeEquipe={(v) => atualizarCampo("equipe_nue", v)}
            onChangeTerceiros={(v) => atualizarCampo("terceiros", v)}
            onCommit={agendarSaveImediato}
          />
          <SecaoPontosAtencao
            itens={form.pontos_atencao}
            onChange={(v) => atualizarCampo("pontos_atencao", v)}
            onCommit={agendarSaveImediato}
          />
          <SecaoFotos
            rdoId={rdoId}
            obraId={props.obra.id}
            fotos={fotos}
            setFotos={setFotos}
            onSavingStart={marcarSalvando}
            onSavingDone={marcarSalvo}
            onSavingError={marcarErro}
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
}: {
  itens: PendenciaItem[];
  onChange: (v: PendenciaItem[]) => void;
  onCommit: () => void;
}) {
  function atualizar(idx: number, patch: Partial<PendenciaItem>) {
    const novo = itens.slice();
    novo[idx] = { ...novo[idx], ...patch };
    onChange(novo);
  }
  function remover(idx: number) {
    const novo = itens.slice();
    novo.splice(idx, 1);
    onChange(novo);
    setTimeout(onCommit, 0);
  }
  function adicionar() {
    onChange([...itens, { descricao: "", prioridade: "media" }]);
  }

  return (
    <CardSecao titulo="Pendências">
      {itens.length === 0 ? (
        <p className="text-sm text-nue-graphite">Nenhuma pendência registrada</p>
      ) : (
        <ul className="space-y-3">
          {itens.map((it, idx) => (
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
        Adicionar pendência
      </button>
    </CardSecao>
  );
}

/* ---------------- Seção 5 — Pontos de atenção ---------------- */

function SecaoPontosAtencao({
  itens,
  onChange,
  onCommit,
}: {
  itens: PontoAtencaoItem[];
  onChange: (v: PontoAtencaoItem[]) => void;
  onCommit: () => void;
}) {
  function atualizar(idx: number, valor: string) {
    const novo = itens.slice();
    novo[idx] = { descricao: valor };
    onChange(novo);
  }
  function remover(idx: number) {
    const novo = itens.slice();
    novo.splice(idx, 1);
    onChange(novo);
    setTimeout(onCommit, 0);
  }
  function adicionar() {
    onChange([...itens, { descricao: "" }]);
  }

  return (
    <CardSecao titulo="Pontos de atenção">
      {itens.length === 0 ? (
        <p className="text-sm text-nue-graphite">Nenhum ponto registrado</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((it, idx) => (
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
        Adicionar ponto de atenção
      </button>
    </CardSecao>
  );
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

/* ---------------- Seção 6 — Fotos ---------------- */

function SecaoFotos({
  rdoId,
  obraId,
  fotos,
  setFotos,
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
  onSavingStart: () => void;
  onSavingDone: () => void;
  onSavingError: (msg: string) => void;
  agendarPersistirOrdem: (lista: RdoFoto[]) => void;
  mensagemBloqueio: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploads, setUploads] = useState<{ id: string; nome: string; status: "uploading" | "erro"; progresso: number; erro?: string; file?: File }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [confirmandoRemover, setConfirmandoRemover] = useState<RdoFoto | null>(null);
  const [draggingFotoIdx, setDraggingFotoIdx] = useState<number | null>(null);
  const debounceLegendaRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const desabilitado = !rdoId;

  async function processarArquivos(files: FileList | File[]) {
    if (!rdoId) return;
    const arr = Array.from(files);
    for (const file of arr) {
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setUploads((u) => [...u, { id: tempId, nome: file.name, status: "uploading", progresso: 10, file }]);
      onSavingStart();
      try {
        const progT = setInterval(() => {
          setUploads((u) =>
            u.map((x) => (x.id === tempId && x.progresso < 85 ? { ...x, progresso: x.progresso + 10 } : x)),
          );
        }, 250);
        const novaFoto = await uploadFoto({
          file,
          obra_id: obraId,
          rdo_id: rdoId,
          ordem: fotos.length + uploads.length,
        });
        clearInterval(progT);
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

  function aoSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      processarArquivos(e.target.files);
      e.target.value = "";
    }
  }

  function aoSoltar(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (desabilitado) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processarArquivos(e.dataTransfer.files);
    }
  }

  async function mover(idx: number, delta: -1 | 1) {
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

  async function alterarCategoria(foto: RdoFoto, valor: string) {
    const cat = valor === "" ? null : (valor as CategoriaFoto);
    setFotos((f) => f.map((x) => (x.id === foto.id ? { ...x, categoria: cat } : x)));
    onSavingStart();
    try {
      await atualizarFotoCampos({ id: foto.id, categoria: cat });
      onSavingDone();
    } catch (err) {
      onSavingError(err instanceof Error ? err.message : "Erro");
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
          await atualizarFotoCampos({ id: foto.id, legenda: valor });
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
    processarArquivos([item.file]);
  }

  function aoDragStartFoto(idx: number) {
    setDraggingFotoIdx(idx);
  }
  function aoDragOverFoto(e: React.DragEvent) {
    e.preventDefault();
  }
  function aoDropFoto(idx: number) {
    if (draggingFotoIdx === null || draggingFotoIdx === idx) {
      setDraggingFotoIdx(null);
      return;
    }
    const lista = fotos.slice();
    const [item] = lista.splice(draggingFotoIdx, 1);
    lista.splice(idx, 0, item);
    setFotos(lista);
    agendarPersistirOrdem(lista);
    setDraggingFotoIdx(null);
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
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragOver) setDragOver(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragOver(false);
            }}
            onDrop={aoSoltar}
            className={`rounded-sm transition-colors ${
              dragOver ? "border-2 border-dashed border-nue-graphite bg-nue-taupe/30 p-2" : ""
            }`}
          >
            {(fotos.length > 0 || uploads.length > 0) && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {fotos.map((foto, idx) => (
                  <FotoTile
                    key={foto.id}
                    foto={foto}
                    idx={idx}
                    total={fotos.length}
                    onAbrir={() => setLightboxIdx(idx)}
                    onMoverEsquerda={() => mover(idx, -1)}
                    onMoverDireita={() => mover(idx, 1)}
                    onRemover={() => setConfirmandoRemover(foto)}
                    onCategoria={(v) => alterarCategoria(foto, v)}
                    onLegenda={(v) => alterarLegenda(foto, v)}
                    onDragStartFoto={() => aoDragStartFoto(idx)}
                    onDragOverFoto={aoDragOverFoto}
                    onDropFoto={() => aoDropFoto(idx)}
                  />
                ))}
                {uploads.map((up) => (
                  <UploadTile key={up.id} upload={up} onRetry={() => reTentar(up.id)} />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm border border-nue-taupe bg-white py-3 text-sm text-nue-black transition-colors hover:bg-nue-taupe/40"
            >
              <Camera className="h-4 w-4" />
              Adicionar fotos
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={aoSelecionar}
              className="hidden"
            />
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

function FotoTile({
  foto,
  idx,
  total,
  onAbrir,
  onMoverEsquerda,
  onMoverDireita,
  onRemover,
  onCategoria,
  onLegenda,
  onDragStartFoto,
  onDragOverFoto,
  onDropFoto,
}: {
  foto: RdoFoto;
  idx: number;
  total: number;
  onAbrir: () => void;
  onMoverEsquerda: () => void;
  onMoverDireita: () => void;
  onRemover: () => void;
  onCategoria: (v: string) => void;
  onLegenda: (v: string) => void;
  onDragStartFoto: () => void;
  onDragOverFoto: (e: React.DragEvent) => void;
  onDropFoto: () => void;
}) {
  return (
    <div
      className="space-y-1"
      draggable
      onDragStart={onDragStartFoto}
      onDragOver={onDragOverFoto}
      onDrop={onDropFoto}
    >
      <div className="group relative aspect-square overflow-hidden rounded-sm border border-nue-taupe bg-nue-taupe/40">
        <img
          src={foto.url}
          alt={foto.legenda || `Foto ${idx + 1}`}
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
              disabled={idx === 0}
              aria-label="Mover para a esquerda"
              className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/90 text-nue-black hover:bg-white disabled:opacity-40"
            >
              <MoveLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onMoverDireita}
              disabled={idx === total - 1}
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
      <select
        value={foto.categoria ?? ""}
        onChange={(e) => onCategoria(e.target.value)}
        className="h-7 w-full rounded-sm border border-nue-taupe bg-white px-1.5 text-nue-black focus:outline-none focus:border-nue-graphite"
        style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
      >
        <option value="">— Sem categoria —</option>
        {CATEGORIAS_FOTO.map((c) => (
          <option key={c.v} value={c.v}>
            {c.label}
          </option>
        ))}
      </select>
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
  upload: { id: string; nome: string; status: "uploading" | "erro"; progresso: number; erro?: string };
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

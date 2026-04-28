import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { RdoCompleto } from "@/lib/diario";
import type { RdoVersao } from "@/lib/rdo";

type Props = {
  open: boolean;
  onClose: () => void;
  versoes: RdoVersao[];
  rdoAtual: RdoCompleto;
};

const TIPO_LABEL: Record<string, string> = {
  medicao: "Medição",
  supervisao_montagem: "Supervisão de montagem",
};

function formatDateTime(iso: string): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Recife",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date(iso));
}

function ehDiferente(a: unknown, b: unknown) {
  if (a === b) return false;
  if (a == null && b == null) return false;
  return String(a ?? "") !== String(b ?? "");
}

function rotuloCampo(c: string): string {
  switch (c) {
    case "data":
      return "Data";
    case "hora_chegada":
      return "Chegada";
    case "hora_saida":
      return "Saída";
    case "tipo_visita":
      return "Tipo de visita";
    case "registros":
      return "Registros do dia";
    case "proximos_passos":
      return "Próximos passos";
    case "finalizado":
      return "Finalizado";
    default:
      return c;
  }
}

function fmtValor(campo: string, valor: unknown): string {
  if (valor == null || valor === "") return "—";
  if (campo === "tipo_visita") return TIPO_LABEL[String(valor)] ?? String(valor);
  if (campo === "finalizado") return valor ? "Sim" : "Não";
  if (typeof valor === "string" && valor.length > 80) return valor.slice(0, 80) + "…";
  return String(valor);
}

type Diff = {
  escalares: { campo: string; antes: unknown; agora: unknown }[];
  listas: { campo: string; antes: number; agora: number }[];
  assinaturaSubstituida: boolean;
};

function calcularDiff(snapshot: unknown, atual: RdoCompleto): Diff {
  const snap = (snapshot ?? {}) as Record<string, unknown>;
  const escalaresKeys = [
    "data",
    "hora_chegada",
    "hora_saida",
    "tipo_visita",
    "registros",
    "proximos_passos",
    "finalizado",
  ] as const;
  const escalares: Diff["escalares"] = [];
  for (const k of escalaresKeys) {
    const a = snap[k];
    const b = (atual as unknown as Record<string, unknown>)[k];
    if (ehDiferente(a, b)) escalares.push({ campo: k, antes: a, agora: b });
  }

  const listasKeys = ["equipe_nue", "terceiros", "pendencias", "pontos_atencao", "fotos"];
  const listas: Diff["listas"] = [];
  for (const k of listasKeys) {
    const antesArr = Array.isArray(snap[k]) ? (snap[k] as unknown[]) : [];
    const agoraArr =
      ((atual as unknown as Record<string, unknown>)[k] as unknown[] | undefined) ?? [];
    if (antesArr.length !== agoraArr.length) {
      listas.push({ campo: k, antes: antesArr.length, agora: agoraArr.length });
    }
  }

  const assinaturaSubstituida = ehDiferente(snap.assinatura_url, atual.assinatura_url);

  return { escalares, listas, assinaturaSubstituida };
}

const LABEL_LISTA: Record<string, string> = {
  equipe_nue: "Equipe NUE",
  terceiros: "Terceiros",
  pendencias: "Pendências",
  pontos_atencao: "Pontos de atenção",
  fotos: "Fotos",
};

export function ModalVersoesRdo({ open, onClose, versoes, rdoAtual }: Props) {
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-nue-black/60" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[85vh] w-full max-w-[720px] flex-col rounded-md bg-white shadow-lg">
        <header className="flex items-center justify-between border-b border-nue-taupe px-5 py-4">
          <h2 className="text-lg text-nue-black" style={{ fontFamily: "var(--font-display)" }}>
            Versões anteriores deste RDO
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-sm p-1 text-nue-graphite hover:bg-nue-taupe/40"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {versoes.length === 0 ? (
            <p className="text-sm text-nue-graphite">Sem versões anteriores.</p>
          ) : (
            <ul className="space-y-3">
              {versoes.map((v) => {
                const diff = calcularDiff(v.snapshot, rdoAtual);
                const aberto = expandido === v.id;
                const totalMudancas =
                  diff.escalares.length +
                  diff.listas.length +
                  (diff.assinaturaSubstituida ? 1 : 0);
                return (
                  <li
                    key={v.id}
                    className="rounded-sm border border-nue-taupe bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div
                          className="text-[13px] text-nue-black"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {formatDateTime(v.editado_em)}
                        </div>
                        <div className="mt-0.5 text-[13px] text-nue-graphite">
                          Editado por {v.editor?.nome ?? "—"}
                        </div>
                        {v.nota_edicao && (
                          <div className="mt-1 text-[13px] italic text-nue-graphite">
                            “{v.nota_edicao}”
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandido(aberto ? null : v.id)}
                        className="text-[13px] text-nue-black underline underline-offset-2 hover:opacity-70"
                      >
                        {aberto ? "Ocultar" : "Ver detalhes"}
                      </button>
                    </div>

                    {aberto && (
                      <div className="mt-3 border-t border-nue-taupe pt-3">
                        {totalMudancas === 0 ? (
                          <p className="text-[13px] text-nue-graphite">
                            Sem diferenças detectadas em relação à versão atual.
                          </p>
                        ) : (
                          <table className="w-full text-[13px]">
                            <thead>
                              <tr className="text-left text-nue-graphite">
                                <th className="py-1 pr-2 font-normal">Campo</th>
                                <th className="py-1 pr-2 font-normal">Antes</th>
                                <th className="py-1 font-normal">Agora</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diff.escalares.map((d) => (
                                <tr
                                  key={d.campo}
                                  className="border-t border-nue-taupe/60 align-top"
                                >
                                  <td className="py-1.5 pr-2 text-nue-graphite">
                                    {rotuloCampo(d.campo)}
                                  </td>
                                  <td className="py-1.5 pr-2 text-nue-black">
                                    {fmtValor(d.campo, d.antes)}
                                  </td>
                                  <td className="py-1.5 text-nue-black">
                                    {fmtValor(d.campo, d.agora)}
                                  </td>
                                </tr>
                              ))}
                              {diff.listas.map((d) => (
                                <tr
                                  key={d.campo}
                                  className="border-t border-nue-taupe/60 align-top"
                                >
                                  <td className="py-1.5 pr-2 text-nue-graphite">
                                    {LABEL_LISTA[d.campo] ?? d.campo}
                                  </td>
                                  <td className="py-1.5 pr-2 text-nue-black">
                                    {d.antes} {d.antes === 1 ? "item" : "itens"}
                                  </td>
                                  <td className="py-1.5 text-nue-black">
                                    {d.agora} {d.agora === 1 ? "item" : "itens"} (alterados)
                                  </td>
                                </tr>
                              ))}
                              {diff.assinaturaSubstituida && (
                                <tr className="border-t border-nue-taupe/60">
                                  <td className="py-1.5 pr-2 text-nue-graphite">
                                    Assinatura
                                  </td>
                                  <td className="py-1.5 pr-2 text-nue-black" colSpan={2}>
                                    Assinatura substituída
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-end border-t border-nue-taupe px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite hover:opacity-90"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}

import type { Obra } from "@/lib/painel";

const STATUS_STYLES: Record<Obra["status"], { bg: string; fg: string; label: string }> = {
  ativa: { bg: "#E8ECE4", fg: "#4A5D43", label: "Ativa" },
  pausada: { bg: "#F1E9DA", fg: "#A07B3F", label: "Pausada" },
  concluida: { bg: "#E6E4DF", fg: "#41423E", label: "Concluída" },
};

export function StatusBadge({ status }: { status: Obra["status"] }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider"
      style={{
        backgroundColor: s.bg,
        color: s.fg,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.06em",
      }}
    >
      {s.label}
    </span>
  );
}

export function SupervisorAvatar({
  iniciais,
  nome,
  size = 24,
}: {
  iniciais: string | null | undefined;
  nome?: string;
  size?: number;
}) {
  return (
    <div
      title={nome}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-nue-taupe text-nue-black"
      style={{
        width: size,
        height: size,
        fontSize: size <= 24 ? 10 : 12,
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        letterSpacing: "0.02em",
      }}
    >
      {(iniciais ?? "??").toUpperCase()}
    </div>
  );
}

/**
 * Helpers de formatação de data no fuso America/Recife (UTC-3, sem DST).
 */
const TZ = "America/Recife";

function partsRecife(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return { y: Number(y), m: Number(m), d: Number(d) };
}

function diffDiasRecife(isoDate: string): number {
  // isoDate: "yyyy-mm-dd" — interpretado como dia local em Recife.
  const hoje = partsRecife(new Date());
  const [y, m, d] = isoDate.split("-").map(Number);
  const a = Date.UTC(hoje.y, hoje.m - 1, hoje.d);
  const b = Date.UTC(y, m - 1, d);
  return Math.round((a - b) / 86_400_000);
}

export function formatarDataRelativa(isoDate: string | null): string {
  if (!isoDate) return "—";
  const dias = diffDiasRecife(isoDate);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias > 1 && dias <= 7) return `há ${dias} dias`;
  if (dias < 0) {
    // Data futura — mostra DD/MM/AAAA
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  }
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function formatarDataCurta(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

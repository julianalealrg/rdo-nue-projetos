/**
 * Helpers de formatação de data no fuso America/Recife (UTC-3, sem DST).
 */
const TZ = "America/Recife";

const MESES_ABREV = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
];

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

/** Retorna { dia: "27", mesAno: "ABR 2026" } a partir de "yyyy-mm-dd". */
export function partesDiaMesAno(isoDate: string): { dia: string; mesAno: string } {
  const [y, m, d] = isoDate.split("-");
  return {
    dia: d,
    mesAno: `${MESES_ABREV[Number(m) - 1]} ${y}`,
  };
}

/** Formata "HH:MM:SS" -> "HHhMM". */
export function formatarHora(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  return `${h}h${m}`;
}

/** "HHhMM até HHhMM" ou "HHhMM" se sem saída. */
export function formatarIntervaloHorario(
  chegada: string,
  saida: string | null,
): string {
  const c = formatarHora(chegada);
  if (!saida) return c;
  return `${c} até ${formatarHora(saida)}`;
}

/** Data atual em America/Recife formatada como "yyyy-mm-dd". */
export function hojeRecife(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

/** Hora atual em America/Recife formatada como "HH:MM". */
export function horaAgoraRecife(): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date());
}

/** Hora atual em America/Recife formatada como "HHhMM" para indicador de auto-save. */
export function horaAgoraRecifeFormatada(): string {
  return formatarHora(horaAgoraRecife() + ":00");
}

const TZ = "America/Sao_Paulo";

export function brl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** Valor curto para eixos de gráfico: 1,2 mil / 15 mil. */
export function brlShort(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  const short = (n: number, digits: number) => n.toFixed(digits).replace(/\.0+$/, "").replace(".", ",");
  if (abs >= 1_000_000) return `${short(v / 1_000_000, 1)} mi`;
  if (abs >= 1000) return `${short(v / 1000, abs >= 10_000 ? 0 : 1)} mil`;
  return String(Math.round(v));
}

/** "1.234,56" | "1234,56" | "1234.56" | "R$ 500" -> centavos. NaN vira 0. */
export function parseBRL(input: FormDataEntryValue | null | undefined): number {
  if (input == null) return 0;
  let s = String(input).replace(/R\$/gi, "").replace(/\s/g, "");
  if (!s) return 0;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // 1.500 -> 1500
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília. */
export function todayBR(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" -> "out/26" */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`;
}

/** Lista de chaves "YYYY-MM" dos últimos n meses, terminando no mês de `today`. */
export function lastMonths(n: number, today: string): string[] {
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
}

export function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

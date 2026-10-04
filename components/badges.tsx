import { scoreTier } from "@/lib/scoring";
import { SITE_STATUS_LABEL, STATUS_LABEL } from "@/lib/constants";

const TIER = {
  quente: { label: "Alta chance", bars: 3, color: "var(--good)" },
  morno: { label: "Chance média", bars: 2, color: "var(--warn)" },
  frio: { label: "Chance baixa", bars: 1, color: "var(--muted)" },
} as const;

/** Chance de fechar, em palavras e em três barrinhas (o número exato fica no detalhe). */
export function ChanceMeter({ score, compact = false }: { score: number; compact?: boolean }) {
  const t = TIER[scoreTier(score)];
  return (
    <span
      className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink-2"
      title={`Nota ${score} de 100. Considera: sem site, celular, avaliações e nota no Google.`}
    >
      <span className="inline-flex items-end gap-[3px]" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className="w-[5px] rounded-sm"
            style={{
              height: 6 + n * 4,
              background: n <= t.bars ? t.color : "var(--line-strong)",
            }}
          />
        ))}
      </span>
      {!compact && t.label}
      {compact && <span className="sr-only">{t.label}</span>}
    </span>
  );
}

/** "Sem site" é a oportunidade, então ganha o tom positivo. */
export function SiteBadge({ status }: { status: string }) {
  const style =
    status === "none"
      ? "bg-good-soft text-good"
      : status === "social"
        ? "bg-warn-soft text-warn"
        : "bg-surface-2 text-muted";
  return <span className={`chip ${style}`}>{SITE_STATUS_LABEL[status] ?? status}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const style =
    status === "fechado"
      ? "bg-good-soft text-good"
      : status === "perdido"
        ? "bg-rose-soft text-rose"
        : status === "novo"
          ? "bg-surface-2 text-ink-2"
          : "bg-accent-soft text-accent";
  return <span className={`chip ${style}`}>{STATUS_LABEL[status] ?? status}</span>;
}

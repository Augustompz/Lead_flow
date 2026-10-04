import { pct } from "@/lib/format";

export type FunnelStage = { label: string; count: number };

/** Funil: cada etapa mostra quantos leads chegaram e a conversão em relação à etapa anterior. */
export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const top = Math.max(stages[0]?.count ?? 0, 1);

  return (
    <ol className="space-y-4">
      {stages.map((s, i) => {
        const prev = i === 0 ? null : stages[i - 1].count;
        const width = (s.count / top) * 100;
        return (
          <li
            key={s.label}
            title={`${s.label}: ${s.count}${prev !== null ? ` (${pct(s.count, prev)} da etapa anterior)` : ""}`}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[15px]">
              <span className="font-semibold">{s.label}</span>
              <span className="flex items-baseline gap-2">
                <b className="font-display text-[18px] tabular-nums">{s.count}</b>
                {prev !== null && <span className="w-10 text-right text-[13.5px] text-muted">{pct(s.count, prev)}</span>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(width, s.count > 0 ? 2 : 0)}%`,
                  background: `var(--funnel-${i + 1})`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

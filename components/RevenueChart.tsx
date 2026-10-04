"use client";

import { useEffect, useRef, useState } from "react";
import { brl, brlShort } from "@/lib/format";

export type ChartMonth = { label: string; revenue: number; costs: number; profit: number };

const H = 260;
const M = { top: 16, right: 16, bottom: 28, left: 48 };
const BAR_MAX = 24;
const GAP = 2;
const R = 4;

/** Escala "bonita": passos de 1, 2, 2.5 ou 5 × 10^n. */
function niceTicks(min: number, max: number, target = 4): number[] {
  const span = Math.max(max - min, 1);
  const raw = span / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/** Coluna com a ponta de cima arredondada (4px) e a base reta. */
function barPath(x: number, w: number, yTop: number, yBase: number): string {
  const h = yBase - yTop;
  if (h <= 0) return "";
  const r = Math.min(R, h, w / 2);
  return `M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yBase} Z`;
}

export function RevenueChart({ months }: { months: ChartMonth[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = months.length;
  const innerW = width - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const values = months.flatMap((m) => [m.revenue, m.costs, m.profit]);
  const ticks = niceTicks(Math.min(0, ...values) / 100, Math.max(0, ...values) / 100).map((t) => t * 100);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const y = (v: number) => M.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  const band = innerW / n;
  const barW = Math.max(6, Math.min(BAR_MAX, (band * 0.7) / 2 - GAP / 2));
  const cx = (i: number) => M.left + band * i + band / 2;
  const y0 = y(0);

  const linePts = months.map((m, i) => `${cx(i)},${y(m.profit)}`).join(" ");
  const active = hover !== null ? months[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max(cx(hover) + 12, 0), width - 190) : 0;

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2" aria-hidden>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-[3px]" style={{ background: "var(--series-1)" }} /> Receita
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-[3px]" style={{ background: "var(--series-2)" }} /> Custos
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-[2px] w-4" style={{ background: "var(--series-3)" }} /> Lucro
        </span>
      </div>

      <div ref={wrap} className="relative min-w-0 overflow-hidden">
        <svg
          className="block max-w-full"
          width={width}
          height={H}
          role="img"
          aria-label={`Receita, custos e lucro dos últimos ${n} meses`}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left - M.left;
            const i = Math.floor(x / band);
            setHover(i >= 0 && i < n ? i : null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted)">
                {t < 0 ? "−" : ""}
                {brlShort(Math.abs(t))}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={width - M.right} y1={y0} y2={y0} stroke="var(--axis)" strokeWidth={1} />

          {hover !== null && (
            <line x1={cx(hover)} x2={cx(hover)} y1={M.top} y2={M.top + innerH} stroke="var(--axis)" strokeWidth={1} />
          )}

          {months.map((m, i) => (
            <g key={m.label} opacity={hover === null || hover === i ? 1 : 0.55}>
              <path d={barPath(cx(i) - barW - GAP / 2, barW, y(m.revenue), y0)} fill="var(--series-1)" />
              <path d={barPath(cx(i) + GAP / 2, barW, y(m.costs), y0)} fill="var(--series-2)" />
              <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {m.label}
              </text>
            </g>
          ))}

          <polyline
            points={linePts}
            fill="none"
            stroke="var(--series-3)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {months.map((m, i) => (
            <circle
              key={m.label}
              cx={cx(i)}
              cy={y(m.profit)}
              r={hover === i ? 5 : 4}
              fill="var(--series-3)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          ))}

          {/* Áreas de toque maiores que as marcas; também acessíveis pelo teclado. */}
          {months.map((m, i) => (
            <rect
              key={m.label}
              x={M.left + band * i}
              y={M.top}
              width={band}
              height={innerH}
              fill="transparent"
              tabIndex={0}
              aria-label={`${m.label}: receita ${brl(m.revenue)}, custos ${brl(m.costs)}, lucro ${brl(m.profit)}`}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              style={{ outline: "none" }}
            />
          ))}
        </svg>

        {active && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-2 z-10 w-[178px] rounded-lg border border-line bg-surface p-3 text-sm shadow-lg"
            style={{ left: tipLeft }}
          >
            <p className="mb-1.5 font-semibold">{active.label}</p>
            <TipRow color="var(--series-1)" label="Receita" value={brl(active.revenue)} />
            <TipRow color="var(--series-2)" label="Custos" value={brl(active.costs)} />
            <TipRow color="var(--series-3)" label="Lucro" value={brl(active.profit)} />
          </div>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Ver como tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num">Receita</th>
                <th className="num">Custos</th>
                <th className="num">Lucro</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td className="num">{brl(m.revenue)}</td>
                  <td className="num">{brl(m.costs)}</td>
                  <td className="num">{brl(m.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="inline-flex items-center gap-2 text-muted">
        <span className="h-[3px] w-3 rounded" style={{ background: color }} />
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

import { GOOGLE_FREE_REQUESTS, RESULTS_PER_REQUEST } from "@/lib/constants";
import type { Usage } from "@/lib/usage";
import { Hint } from "./ui";

/** Quanto da cota grátis de buscas já foi usado neste mês. */
export function UsageMeter({ usage }: { usage: Usage }) {
  const pct = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 100;
  const blocked = usage.remaining === 0;
  const color = blocked ? "var(--rose)" : pct >= 80 ? "var(--warn)" : "var(--accent)";
  const companies = usage.remaining * RESULTS_PER_REQUEST;

  return (
    <section className="card" aria-label="Cota de buscas do mês">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[18px] font-semibold">Sua cota grátis de buscas</h2>
        <p className="text-[14.5px] text-ink-2">
          <b>{usage.used}</b> de {usage.limit} usadas
        </p>
      </div>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Cota usada no mês"
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="mt-2.5 text-[14.5px] text-ink-2">
        {blocked
          ? "A cota do mês acabou, então o sistema parou de chamar o Google e nada é cobrado. As buscas voltam no dia 1º."
          : `Ainda dá para buscar umas ${companies.toLocaleString("pt-BR")} empresas neste mês, sem pagar nada.`}
      </p>
      <div className="mt-2">
        <Hint label="Por que existe essa cota?">
          O Google dá {GOOGLE_FREE_REQUESTS.toLocaleString("pt-BR")} buscas grátis por mês e cobra depois disso. O LeadFlow
          conta cada uma e para antes de passar, deixando uma folga. Você pode mudar o limite em Ajustes.
        </Hint>
      </div>
    </section>
  );
}

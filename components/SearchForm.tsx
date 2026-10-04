"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { searchLeadsAction } from "@/app/actions/search";
import { NICHE_SUGGESTIONS } from "@/lib/constants";
import { Icon } from "./Icon";

const SIZES = [
  { value: 20, requests: 1, label: "20 empresas" },
  { value: 40, requests: 2, label: "40 empresas" },
  { value: 60, requests: 3, label: "60 empresas (máximo)" },
];

/** `remaining`: requisições que ainda cabem no limite do mês (ignorado no modo demonstração). */
export function SearchForm({ demo, remaining }: { demo: boolean; remaining: number }) {
  const [state, action, pending] = useActionState(searchLeadsAction, undefined);
  const [size, setSize] = useState(20);
  const [niche, setNiche] = useState("");

  const allowed = SIZES.filter((s) => demo || s.requests <= remaining);
  const blocked = allowed.length === 0;
  // Se o tamanho escolhido deixou de caber (ex.: depois de uma busca), usa o maior que cabe.
  const effective = blocked ? size : (allowed.find((s) => s.value === size) ?? allowed[allowed.length - 1]).value;

  return (
    <div className="space-y-5">
      <form
        className="card space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}
      >
        <div>
          <label className="label" htmlFor="niche">
            1. Que tipo de empresa você quer encontrar?
          </label>
          <input
            id="niche"
            name="niche"
            required
            className="input"
            placeholder="Ex.: dentista, barbearia, advogado"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            autoComplete="off"
          />
          <div className="mt-2.5 flex flex-wrap gap-2" aria-label="Sugestões">
            {NICHE_SUGGESTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNiche(n)}
                className={`chip min-h-[34px] cursor-pointer ${niche === n ? "bg-accent text-[var(--accent-ink)]" : "bg-surface-2 text-ink-2 hover:bg-accent-soft"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="city">
            2. Em qual cidade?
          </label>
          <input id="city" name="city" required className="input" placeholder="Ex.: Goiânia" autoComplete="off" />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="max">
              3. Quantas empresas trazer?
            </label>
            <select
              id="max"
              name="max"
              className="input"
              value={effective}
              onChange={(e) => setSize(Number(e.target.value))}
              disabled={blocked}
            >
              {SIZES.map((s) => (
                <option key={s.value} value={s.value} disabled={!demo && s.requests > remaining}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="help">Mais empresas gastam mais da sua cota grátis do mês.</p>
          </div>

          <fieldset>
            <legend className="label">Quem guardar como lead</legend>
            <label className="flex min-h-[40px] items-center gap-3 text-[15px]">
              <input type="checkbox" checked disabled className="h-5 w-5" /> Empresas sem site
            </label>
            <label className="flex min-h-[40px] items-center gap-3 text-[15px]">
              <input type="checkbox" name="includeSocial" defaultChecked className="h-5 w-5" /> Só têm Instagram ou Facebook
            </label>
            <label className="flex min-h-[40px] items-center gap-3 text-[15px]">
              <input type="checkbox" name="includeOwn" className="h-5 w-5" /> Que já têm site
            </label>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending || blocked}>
            <Icon name="search" size={18} />
            {pending ? "Procurando…" : blocked ? "Limite do mês atingido" : "Buscar leads"}
          </button>
          {demo && <span className="text-[14px] text-muted">Modo demonstração: as empresas geradas são fictícias.</span>}
        </div>
      </form>

      {state && !state.ok && (
        <div role="alert" className="rounded-2xl bg-rose-soft p-4 text-[15px] text-rose">
          {state.error}
        </div>
      )}

      {state?.ok && (
        <div role="status" className="panel-accent">
          <p className="font-display text-[20px] font-semibold">
            Pronto! {state.added === 0 ? "Nenhuma empresa nova desta vez." : `${state.added} ${state.added === 1 ? "empresa nova" : "empresas novas"} na sua lista.`}
          </p>
          <p className="mt-1 text-[15px] text-ink-2">
            Busca: “{state.niche} em {state.city}”{state.demo && " (demonstração)"}. O Google devolveu {state.found}.
            {state.skipped > 0 && ` ${state.skipped} já tinham site e ficaram de fora.`}
            {state.duplicates > 0 && ` ${state.duplicates} você já tinha.`}
            {state.blocked > 0 && ` ${state.blocked} estão na sua lista de não contatar e foram ignoradas.`}
          </p>
          {state.added > 0 && (
            <Link href={`/leads?search=${state.searchId}`} className="btn btn-primary mt-4 w-full sm:w-auto">
              Ver os novos leads
              <Icon name="arrow" size={18} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

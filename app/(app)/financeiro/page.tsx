import Link from "next/link";
import { useId, type ReactNode } from "react";
import {
  addCostAction,
  addSaleAction,
  addSubscriptionAction,
  deleteCostAction,
  deleteSaleAction,
  deleteSubscriptionAction,
  endCostAction,
  endSubscriptionAction,
  updateCostAction,
  updateSaleAction,
  updateSubscriptionAction,
} from "@/app/actions/finance";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Icon } from "@/components/Icon";
import { EmptyState, Hint, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { COST_CATEGORIES, COST_LABEL, SERVICE_SUGGESTIONS } from "@/lib/constants";
import { rows } from "@/lib/db";
import { brl, fmtDate, todayBR } from "@/lib/format";
import { financeSummary, type Cost, type Sale, type Subscription } from "@/lib/finance";

const TABS = [
  { key: "resumo", label: "Resumo" },
  { key: "vendas", label: "Vendas" },
  { key: "mensalidades", label: "Mensalidades" },
  { key: "custos", label: "Custos" },
] as const;

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requireSession();
  const requested = (await searchParams).aba;
  const aba = TABS.find((t) => t.key === requested)?.key ?? "resumo";
  const today = todayBR();

  const summary = await financeSummary(6);
  const sales = aba === "vendas" ? await rows<Sale>("SELECT * FROM sales ORDER BY sold_at DESC, id DESC LIMIT 100") : [];
  const subs =
    aba === "mensalidades"
      ? await rows<Subscription>("SELECT * FROM subscriptions ORDER BY end_date IS NOT NULL, start_date DESC, id DESC")
      : [];
  const costs =
    aba === "custos" ? await rows<Cost>("SELECT * FROM costs ORDER BY end_date IS NOT NULL, start_date DESC, id DESC LIMIT 100") : [];

  return (
    <div>
      <PageHeader
        title="Dinheiro"
        intro="Anote o que entrou e o que saiu. O Início mostra quanto sobrou."
      />

      <nav aria-label="Seções" className="seg mb-7">
        {TABS.map((t) => (
          <Link key={t.key} href={`/financeiro?aba=${t.key}`} aria-current={t.key === aba ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {aba === "resumo" && (
        <section className="space-y-5">
          <div className="card overflow-x-auto !p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="num">Entrou</th>
                  <th className="num">Saiu</th>
                  <th className="num">Sobrou</th>
                </tr>
              </thead>
              <tbody>
                {[...summary.months].reverse().map((m) => (
                  <tr key={m.key}>
                    <td className="font-semibold">{m.label}</td>
                    <td className="num">
                      {brl(m.revenue)}
                      {m.recurringRevenue > 0 && (
                        <span className="block text-[12.5px] font-normal text-muted">{brl(m.recurringRevenue)} de mensalidades</span>
                      )}
                    </td>
                    <td className="num">
                      {brl(m.costs)}
                      {m.costsApi > 0 && <span className="block text-[12.5px] text-muted">inclui {brl(m.costsApi)} do Google</span>}
                    </td>
                    <td className={`num font-semibold ${m.profit < 0 ? "text-rose" : "text-good"}`}>{brl(m.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Hint label="Como esses números são calculados?">
            <b>Entrou</b> = vendas de projetos do mês + mensalidades ativas no mês. <b>Saiu</b> = custos do mês (únicos e
            mensais) + o que passar da cota grátis do Google. <b>Sobrou</b> = Entrou − Saiu.
          </Hint>
          <p className="text-[14.5px] text-ink-2">
            Para ver mais, abra{" "}
            <Link href="/financeiro?aba=vendas" className="font-semibold text-accent underline">
              Vendas
            </Link>
            ,{" "}
            <Link href="/financeiro?aba=mensalidades" className="font-semibold text-accent underline">
              Mensalidades
            </Link>{" "}
            ou{" "}
            <Link href="/financeiro?aba=custos" className="font-semibold text-accent underline">
              Custos
            </Link>
            .
          </p>
        </section>
      )}

      {aba === "vendas" && (
        <section className="space-y-5">
          <AddBox title="Registrar uma venda" open={sales.length === 0}>
            <ActionForm action={addSaleAction} submitLabel="Registrar venda" successMessage="Venda registrada.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome do cliente" name="client_name" required />
                <div>
                  <label className="label" htmlFor="sale-service">
                    O que você vendeu
                  </label>
                  <input id="sale-service" name="service" required list="sale-services" className="input" />
                  <datalist id="sale-services">
                    {SERVICE_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <Field label="Valor do projeto (R$)" name="amount" placeholder="1.500,00" mode="decimal" />
                <Field label="Mensalidade (R$), se houver" name="monthly" placeholder="99,00" mode="decimal" help="Hospedagem ou manutenção cobrada todo mês." />
                <Field label="Data" name="sold_at" type="date" defaultValue={today} />
              </div>
            </ActionForm>
          </AddBox>

          {sales.length === 0 ? (
            <EmptyState icon="wallet" title="Nenhuma venda registrada ainda">
              Quando um cliente fechar, registre aqui (ou direto na ficha do lead). O valor entra no seu dinheiro.
            </EmptyState>
          ) : (
            <ul className="card divide-y divide-line !p-0">
              {sales.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{s.client_name}</p>
                    <p className="text-[14px] text-muted">
                      {s.service} · {fmtDate(s.sold_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-display text-[19px] font-semibold">{brl(s.amount)}</p>
                    <form action={deleteSaleAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmButton message="Excluir esta venda?" className="btn btn-sm btn-ghost btn-danger">
                        Excluir
                      </ConfirmButton>
                    </form>
                  </div>
                  <EditBox>
                    <ActionForm action={updateSaleAction} submitLabel="Salvar alterações" successMessage="Venda atualizada." resetOnSuccess={false}>
                      <input type="hidden" name="id" value={s.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Nome do cliente" name="client_name" required defaultValue={s.client_name} />
                        <Field label="O que você vendeu" name="service" required defaultValue={s.service} />
                        <Field label="Valor (R$)" name="amount" required mode="decimal" defaultValue={cents(s.amount)} />
                        <Field label="Data" name="sold_at" type="date" defaultValue={s.sold_at} />
                      </div>
                    </ActionForm>
                  </EditBox>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aba === "mensalidades" && (
        <section className="space-y-5">
          <p className="max-w-[62ch] text-[15px] text-ink-2">
            Mensalidades são cobranças que se repetem todo mês, como hospedagem e manutenção do site. Elas entram na
            sua receita de cada mês enquanto estiverem ativas.
          </p>
          <AddBox title="Adicionar mensalidade" open={subs.length === 0}>
            <ActionForm action={addSubscriptionAction} submitLabel="Adicionar mensalidade" successMessage="Mensalidade adicionada.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome do cliente" name="client_name" required />
                <Field label="O que ele paga" name="plan" placeholder="Hospedagem e manutenção" />
                <Field label="Valor por mês (R$)" name="amount" required placeholder="99,00" mode="decimal" />
                <Field label="Começa em" name="start_date" type="date" defaultValue={today} />
              </div>
            </ActionForm>
          </AddBox>

          {subs.length === 0 ? (
            <EmptyState icon="wallet" title="Nenhuma mensalidade cadastrada">
              Se algum cliente paga todo mês, cadastre aqui para acompanhar sua receita recorrente.
            </EmptyState>
          ) : (
            <ul className="card divide-y divide-line !p-0">
              {subs.map((s) => {
                const active = !s.end_date || s.end_date > today;
                return (
                  <li key={s.id} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 ${active ? "" : "text-muted"}`}>
                    <div className="min-w-0">
                      <p className="font-semibold">{s.client_name}</p>
                      <p className="text-[14px] text-muted">
                        {s.plan} · desde {fmtDate(s.start_date)}
                      </p>
                      <p className="mt-1">
                        {active ? (
                          <span className="chip bg-good-soft text-good">Ativa</span>
                        ) : (
                          <span className="chip bg-surface-2 text-muted">Encerrada em {fmtDate(s.end_date)}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="mr-1 font-display text-[19px] font-semibold">{brl(s.amount)}<span className="text-[13px] font-normal text-muted"> /mês</span></p>
                      {active && (
                        <form action={endSubscriptionAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmButton message="Encerrar esta mensalidade a partir de hoje?" className="btn btn-sm">
                            Encerrar
                          </ConfirmButton>
                        </form>
                      )}
                      <form action={deleteSubscriptionAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmButton message="Excluir esta mensalidade e todo o histórico dela?" className="btn btn-sm btn-ghost btn-danger">
                          Excluir
                        </ConfirmButton>
                      </form>
                    </div>
                    <EditBox>
                      <ActionForm action={updateSubscriptionAction} submitLabel="Salvar alterações" successMessage="Mensalidade atualizada." resetOnSuccess={false}>
                        <input type="hidden" name="id" value={s.id} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Nome do cliente" name="client_name" required defaultValue={s.client_name} />
                          <Field label="O que ele paga" name="plan" defaultValue={s.plan} />
                          <Field label="Valor por mês (R$)" name="amount" required mode="decimal" defaultValue={cents(s.amount)} />
                          <Field label="Começa em" name="start_date" type="date" defaultValue={s.start_date} />
                          <Field label="Termina em (deixe vazio se continua)" name="end_date" type="date" defaultValue={s.end_date ?? ""} />
                        </div>
                      </ActionForm>
                    </EditBox>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {aba === "custos" && (
        <section className="space-y-5">
          <p className="max-w-[62ch] text-[15px] text-ink-2">
            Tudo que você gasta para trabalhar: domínio, hospedagem, anúncios, ferramentas. As buscas do Google só entram
            aqui se passarem da cota grátis.
          </p>
          <AddBox title="Adicionar custo" open={costs.length === 0}>
            <ActionForm action={addCostAction} submitLabel="Adicionar custo" successMessage="Custo adicionado.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="O que foi" name="description" required placeholder="Domínio .com.br" />
                <div>
                  <label className="label" htmlFor="cost-category">
                    Tipo
                  </label>
                  <select id="cost-category" name="category" className="input" defaultValue="ferramentas">
                    {COST_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label="Valor (R$)" name="amount" required placeholder="40,00" mode="decimal" />
                <div>
                  <label className="label" htmlFor="cost-kind">
                    Quando se repete
                  </label>
                  <select id="cost-kind" name="kind" className="input" defaultValue="unico">
                    <option value="unico">Foi uma vez só</option>
                    <option value="mensal">Todo mês</option>
                  </select>
                </div>
                <Field label="Data (ou início, se for mensal)" name="start_date" type="date" defaultValue={today} />
              </div>
            </ActionForm>
          </AddBox>

          {costs.length === 0 ? (
            <EmptyState icon="wallet" title="Nenhum custo cadastrado">
              Anote o que você gasta para o painel mostrar quanto realmente sobra.
            </EmptyState>
          ) : (
            <ul className="card divide-y divide-line !p-0">
              {costs.map((c) => {
                const ended = c.kind === "mensal" && c.end_date && c.end_date <= today;
                return (
                  <li key={c.id} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 ${ended ? "text-muted" : ""}`}>
                    <div className="min-w-0">
                      <p className="font-semibold">{c.description}</p>
                      <p className="text-[14px] text-muted">
                        {COST_LABEL[c.category] ?? c.category} ·{" "}
                        {c.kind === "mensal" ? (ended ? `todo mês, até ${fmtDate(c.end_date)}` : `todo mês, desde ${fmtDate(c.start_date)}`) : fmtDate(c.start_date)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="mr-1 font-display text-[19px] font-semibold">{brl(c.amount)}</p>
                      {c.kind === "mensal" && !ended && (
                        <form action={endCostAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <ConfirmButton message="Parar de contar este custo a partir de hoje?" className="btn btn-sm">
                            Encerrar
                          </ConfirmButton>
                        </form>
                      )}
                      <form action={deleteCostAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmButton message="Excluir este custo?" className="btn btn-sm btn-ghost btn-danger">
                          Excluir
                        </ConfirmButton>
                      </form>
                    </div>
                    <EditBox>
                      <ActionForm action={updateCostAction} submitLabel="Salvar alterações" successMessage="Custo atualizado." resetOnSuccess={false}>
                        <input type="hidden" name="id" value={c.id} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="O que foi" name="description" required defaultValue={c.description} />
                          <div>
                            <label className="label" htmlFor={`cat-${c.id}`}>
                              Tipo
                            </label>
                            <select id={`cat-${c.id}`} name="category" className="input" defaultValue={c.category}>
                              {COST_CATEGORIES.map((k) => (
                                <option key={k.key} value={k.key}>
                                  {k.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Field label="Valor (R$)" name="amount" required mode="decimal" defaultValue={cents(c.amount)} />
                          <div>
                            <label className="label" htmlFor={`kind-${c.id}`}>
                              Quando se repete
                            </label>
                            <select id={`kind-${c.id}`} name="kind" className="input" defaultValue={c.kind}>
                              <option value="unico">Foi uma vez só</option>
                              <option value="mensal">Todo mês</option>
                            </select>
                          </div>
                          <Field label="Data (ou início, se for mensal)" name="start_date" type="date" defaultValue={c.start_date} />
                          <Field label="Termina em (só se for mensal)" name="end_date" type="date" defaultValue={c.end_date ?? ""} />
                        </div>
                      </ActionForm>
                    </EditBox>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

const cents = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function EditBox({ children }: { children: ReactNode }) {
  return (
    <details className="fold basis-full">
      <summary className="!justify-start gap-1.5 text-[14.5px] text-accent">
        <Icon name="sliders" size={16} /> Editar
      </summary>
      <div className="mt-3 rounded-xl bg-surface-2 p-4">{children}</div>
    </details>
  );
}

function AddBox({ title, open, children }: { title: string; open: boolean; children: ReactNode }) {
  return (
    <details className="fold card" open={open}>
      <summary>
        <span className="flex items-center gap-2">
          <Icon name="plus" size={18} /> {title}
        </span>
        <Icon name="chevron" size={20} className="chev" />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
  type = "text",
  defaultValue,
  mode,
  help,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
  defaultValue?: string;
  mode?: "decimal";
  help?: string;
}) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        inputMode={mode}
        className="input"
      />
      {help && <p className="help">{help}</p>}
    </div>
  );
}

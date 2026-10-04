import Link from "next/link";
import { Funnel } from "@/components/Funnel";
import { Icon, type IconName } from "@/components/Icon";
import { RevenueChart } from "@/components/RevenueChart";
import { ChanceMeter } from "@/components/badges";
import { EmptyState, Hint, SectionTitle } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { requireSession } from "@/lib/auth";
import { FUNNEL_STAGES } from "@/lib/constants";
import { getSettings, rows } from "@/lib/db";
import { financeSummary, periodTotals } from "@/lib/finance";
import { brl, pct, todayBR } from "@/lib/format";
import type { Lead } from "@/lib/leads";
import { buildMessage, whatsappUrl } from "@/lib/scoring";

const PERIODS = [
  { p: 1, label: "Mês" },
  { p: 3, label: "3 meses" },
  { p: 6, label: "6 meses" },
  { p: 12, label: "1 ano" },
];

type Step = { title: string; text: string; href: string; cta: string; icon: IconName };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const session = await requireSession();
  const requested = Number((await searchParams).p);
  const p = PERIODS.find((x) => x.p === requested)?.p ?? 3;
  const today = todayBR();

  const [summary, settings] = await Promise.all([financeSummary(12), getSettings()]);
  const months = summary.months.slice(-p);
  const totals = periodTotals(months);
  const chartMonths = summary.months.slice(-Math.max(p, 6));
  const current = summary.months[summary.months.length - 1];

  const since = `${months[0].key}-01`;
  const [funnelRow, due, dueCount, hot, counts, demoCount] = await Promise.all([
    rows<Record<string, number>>(
      "SELECT COUNT(*) AS captados, COUNT(contacted_at) AS contatados, COUNT(responded_at) AS responderam, " +
        "COUNT(proposal_at) AS propostas, COUNT(closed_at) AS fechados FROM leads WHERE created_at >= ?",
      [since],
    ),
    rows<Lead>(
      "SELECT * FROM leads WHERE follow_up_at IS NOT NULL AND follow_up_at <= ? " +
        "AND status NOT IN ('fechado','perdido') ORDER BY follow_up_at ASC LIMIT 5",
      [today],
    ),
    rows<{ n: number }>(
      "SELECT COUNT(*) AS n FROM leads WHERE follow_up_at IS NOT NULL AND follow_up_at <= ? AND status NOT IN ('fechado','perdido')",
      [today],
    ),
    rows<Lead>("SELECT * FROM leads WHERE status = 'novo' AND phone_digits IS NOT NULL ORDER BY score DESC, id DESC LIMIT 8"),
    rows<Record<string, number>>(
      "SELECT (SELECT COUNT(*) FROM leads) AS total, " +
        "(SELECT COUNT(*) FROM leads WHERE status = 'novo' AND score >= 70) AS hot_new, " +
        "(SELECT COUNT(*) FROM leads WHERE contacted_at IS NOT NULL) AS contacted, " +
        "(SELECT COUNT(*) FROM leads WHERE status IN ('respondeu','proposta')) AS talking, " +
        "(SELECT COUNT(*) FROM sales) AS sales, (SELECT COUNT(*) FROM searches) AS searches",
    ),
    rows<{ n: number }>("SELECT COUNT(*) AS n FROM leads WHERE source = 'demo'"),
  ]);

  const f = funnelRow[0];
  const stages = [
    { label: FUNNEL_STAGES[0].label, count: Number(f.captados) },
    { label: FUNNEL_STAGES[1].label, count: Number(f.contatados) },
    { label: FUNNEL_STAGES[2].label, count: Number(f.responderam) },
    { label: FUNNEL_STAGES[3].label, count: Number(f.propostas) },
    { label: FUNNEL_STAGES[4].label, count: Number(f.fechados) },
  ];

  const c = counts[0];
  const hasKey = !!process.env.GOOGLE_MAPS_API_KEY?.trim();
  const overdue = Number(dueCount[0]?.n ?? 0);
  const demoLeads = Number(demoCount[0]?.n ?? 0);

  // Lista "para falar hoje": quem precisa de retorno e, se sobrar espaço, os melhores leads novos.
  const dueIds = new Set(due.map((l) => l.id));
  const today5 = [...due.map((l) => ({ lead: l, kind: "due" as const })), ...hot.filter((l) => !dueIds.has(l.id)).map((l) => ({ lead: l, kind: "new" as const }))].slice(0, 5);

  // O próximo passo muda conforme o que você já fez.
  let step: Step;
  if (Number(c.total) === 0) {
    step = {
      title: "Encontre seus primeiros clientes",
      text: "Diga o tipo de empresa e a cidade. O sistema procura no Google Maps e separa quem ainda não tem site.",
      href: "/buscar",
      cta: "Fazer minha primeira busca",
      icon: "search",
    };
  } else if (overdue > 0) {
    step = {
      title: overdue === 1 ? "Você combinou de retornar para 1 empresa" : `Você combinou de retornar para ${overdue} empresas`,
      text: "Quem espera uma resposta esfria rápido. Comece por elas.",
      href: "/leads?due=1&sort=followup",
      cta: "Ver quem são",
      icon: "calendar",
    };
  } else if (Number(c.hot_new) > 0) {
    const n = Number(c.hot_new);
    step = {
      title: n === 1 ? "1 empresa de alta chance espera sua mensagem" : `${n} empresas de alta chance esperam sua mensagem`,
      text: "São as que não têm site e têm celular e boas avaliações. Comece pelas melhores.",
      href: "/leads?status=novo&tier=quente",
      cta: "Começar pelas melhores",
      icon: "chat",
    };
  } else if (Number(c.talking) > 0 && Number(c.sales) === 0) {
    step = {
      title: "Tem conversa andando",
      text: "Quando alguém fechar, registre a venda para ela entrar no seu dinheiro.",
      href: "/leads?status=respondeu",
      cta: "Ver conversas",
      icon: "users",
    };
  } else {
    step = {
      title: "Tudo em dia por aqui",
      text: "Faça uma nova busca para manter sempre gente nova chegando.",
      href: "/buscar",
      cta: "Buscar mais leads",
      icon: "search",
    };
  }

  const checklist = [
    { done: hasKey, label: "Ligar a busca real do Google", href: "/configuracoes", hint: "Opcional para testar" },
    { done: Number(c.searches) > 0, label: "Fazer a primeira busca", href: "/buscar" },
    { done: Number(c.contacted) > 0, label: "Chamar o primeiro lead no WhatsApp", href: "/leads" },
    { done: Number(c.sales) > 0, label: "Registrar a primeira venda", href: "/financeiro?aba=vendas" },
  ];
  const doneCount = checklist.filter((i) => i.done).length;

  const goal = settings.meta_mensal;
  const goalPct = goal ? Math.min(100, Math.round((current.revenue / goal) * 100)) : 0;
  const first = session.name.split(" ")[0];
  const rawDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  return (
    <div className="space-y-9">
      <header>
        <p className="text-sm font-semibold text-muted">{dateLabel}</p>
        <h1 className="font-display text-[32px] font-bold leading-tight tracking-tight md:text-[38px]">Olá, {first}</h1>
      </header>

      {demoLeads > 0 && (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-[14.5px] text-warn">
          Há {demoLeads} leads de <b>demonstração</b> (fictícios) na base.{" "}
          <Link href="/buscar" className="font-semibold underline">
            Apague na tela de busca
          </Link>{" "}
          quando terminar de testar.
        </p>
      )}

      {/* O que fazer agora */}
      <section className="panel-accent flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Próximo passo">
        <div className="flex gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-[var(--accent-ink)] sm:flex">
            <Icon name={step.icon} size={24} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold uppercase tracking-wide text-accent">Seu próximo passo</p>
            <h2 className="font-display text-[22px] font-semibold leading-snug">{step.title}</h2>
            <p className="mt-1 max-w-[58ch] text-[15px] text-ink-2">{step.text}</p>
          </div>
        </div>
        <Link href={step.href} className="btn btn-primary w-full shrink-0 sm:w-auto sm:self-center">
          {step.cta}
          <Icon name="arrow" size={18} />
        </Link>
      </section>

      <div className="grid gap-9 lg:grid-cols-5">
        <div className="min-w-0 space-y-9 lg:col-span-3">
          {/* Para falar hoje */}
          <section>
            <SectionTitle
              aside={
                <Link href="/leads" className="text-[14.5px] font-semibold text-accent hover:underline">
                  Ver todos
                </Link>
              }
            >
              Para falar hoje
            </SectionTitle>
            {today5.length === 0 ? (
              <div className="card-soft text-[15px] text-ink-2">
                Ninguém na fila agora. Quando você fizer uma busca, os melhores leads aparecem aqui.
              </div>
            ) : (
              <ul className="space-y-3">
                {today5.map(({ lead: l, kind }) => {
                  const days = kind === "due" && l.follow_up_at ? Math.round((Date.parse(today) - Date.parse(l.follow_up_at)) / 86400000) : 0;
                  return (
                    <li key={l.id} className="card flex flex-wrap items-center justify-between gap-3 !p-4">
                      <div className="min-w-0 flex-1 basis-48">
                        <Link href={`/leads/${l.id}`} className="block truncate text-[16px] font-semibold hover:underline">
                          {l.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {kind === "due" ? (
                            <span className={`chip ${days > 0 ? "bg-rose-soft text-rose" : "bg-warn-soft text-warn"}`}>
                              {days > 0 ? `Retorno atrasado (${days} ${days === 1 ? "dia" : "dias"})` : "Retornar hoje"}
                            </span>
                          ) : (
                            <ChanceMeter score={l.score} />
                          )}
                          <span className="text-[13.5px] text-muted">{[l.niche, l.city].filter(Boolean).join(" · ")}</span>
                        </div>
                      </div>
                      {l.phone_digits && (
                        <WhatsAppButton
                          leadId={l.id}
                          mobile={!!l.is_mobile}
                          href={whatsappUrl(l.phone_digits, buildMessage(settings.msg_template, l))}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Caminho dos leads */}
          <section>
            <SectionTitle>Caminho dos leads</SectionTitle>
            <div className="card">
              <p className="mb-4 text-[15px] text-ink-2">
                Dos leads encontrados no período, quantos chegaram em cada etapa.
              </p>
              <Funnel stages={stages} />
              <div className="mt-4">
                <Hint label="Como ler isso?">
                  Cada barra mostra quantos leads chegaram até aquela etapa. A porcentagem compara com a etapa anterior:
                  se você chamou 10 e 3 responderam, aparece 30%.
                </Hint>
              </div>
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-9 lg:col-span-2">
          {/* Dinheiro */}
          <section>
            <SectionTitle
              aside={
                <Link href="/financeiro" className="text-[14.5px] font-semibold text-accent hover:underline">
                  Detalhes
                </Link>
              }
            >
              Seu dinheiro
            </SectionTitle>
            <div className="card space-y-5">
              <nav aria-label="Período" className="seg seg-fill">
                {PERIODS.map((x) => (
                  <Link key={x.p} href={`/?p=${x.p}`} aria-current={x.p === p ? "true" : undefined}>
                    {x.label}
                  </Link>
                ))}
              </nav>

              <div>
                <p className="text-[14.5px] font-semibold text-muted">Sobrou no período</p>
                <p
                  className={`font-display text-[44px] font-bold leading-none tracking-tight ${totals.profit < 0 ? "text-rose" : ""}`}
                >
                  {brl(totals.profit)}
                </p>
                <p className="mt-2 text-[14px] text-muted">
                  {totals.margin === null
                    ? "Ainda não entrou dinheiro neste período."
                    : `Isso é ${Math.round(totals.margin * 100)}% de tudo que entrou.`}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-3">
                <div className="card-soft !p-3.5">
                  <dt className="text-[13.5px] text-muted">Entrou</dt>
                  <dd className="font-display text-[22px] font-semibold">{brl(totals.revenue)}</dd>
                </div>
                <div className="card-soft !p-3.5">
                  <dt className="text-[13.5px] text-muted">Saiu</dt>
                  <dd className="font-display text-[22px] font-semibold">{brl(totals.costs)}</dd>
                </div>
              </dl>

              <div className="flex items-start justify-between gap-3 border-t border-line pt-4 text-[15px]">
                <div>
                  <p className="font-semibold">Mensalidades por mês</p>
                  <p className="text-[13.5px] text-muted">{summary.activeClients} cliente(s) pagando todo mês</p>
                </div>
                <p className="font-display text-[20px] font-semibold">{brl(summary.mrr)}</p>
              </div>

              {goal > 0 ? (
                <div className="border-t border-line pt-4">
                  <div className="mb-2 flex items-baseline justify-between gap-2 text-[14.5px]">
                    <span className="font-semibold">Meta de {current.label}</span>
                    <span className="text-ink-2">
                      {brl(current.revenue)} de {brl(goal)}
                    </span>
                  </div>
                  <div
                    className="h-2.5 overflow-hidden rounded-full bg-surface-2"
                    role="progressbar"
                    aria-valuenow={goalPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Progresso da meta mensal"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${goalPct}%`, background: goalPct >= 100 ? "var(--good)" : "var(--accent)" }}
                    />
                  </div>
                </div>
              ) : (
                <p className="border-t border-line pt-4 text-[14px] text-muted">
                  Quer uma meta?{" "}
                  <Link href="/configuracoes" className="font-semibold text-accent underline">
                    Defina em Ajustes
                  </Link>{" "}
                  e acompanhe aqui.
                </p>
              )}
            </div>
          </section>

          {/* Primeiros passos (some quando tudo estiver feito) */}
          {doneCount < checklist.length && (
            <section aria-label="Primeiros passos">
              <SectionTitle aside={<span className="text-[14px] text-muted">{doneCount} de {checklist.length}</span>}>
                Primeiros passos
              </SectionTitle>
              <ul className="card divide-y divide-line !p-0">
                {checklist.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                          item.done ? "border-good bg-good-soft text-good" : "text-transparent"
                        }`}
                        style={item.done ? undefined : { borderColor: "var(--line-strong)" }}
                      >
                        <Icon name="check" size={15} />
                      </span>
                      <span className={`flex-1 text-[15.5px] ${item.done ? "text-muted line-through" : "font-semibold"}`}>
                        {item.label}
                      </span>
                      {!item.done && <Icon name="arrow" size={18} className="text-muted" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <section className="min-w-0">
        <SectionTitle>Mês a mês</SectionTitle>
        {chartMonths.some((m) => m.revenue > 0 || m.costs > 0) ? (
          <div className="card min-w-0">
            <RevenueChart
              months={chartMonths.map((m) => ({ label: m.label, revenue: m.revenue, costs: m.costs, profit: m.profit }))}
            />
          </div>
        ) : (
          <EmptyState icon="wallet" title="O gráfico aparece quando houver movimento" action={{ href: "/financeiro?aba=vendas", label: "Registrar uma venda" }}>
            Assim que você registrar vendas, mensalidades ou custos, aqui você vê mês a mês quanto entrou, quanto saiu e
            quanto sobrou.
          </EmptyState>
        )}
      </section>

      <details className="fold card">
        <summary>
          <span>Mais números do período</span>
          <Icon name="chevron" size={20} className="chev" />
        </summary>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="card-soft">
            <dt className="text-[13.5px] text-muted">Valor médio por venda</dt>
            <dd className="font-display text-[22px] font-semibold">{totals.salesCount ? brl(totals.avgTicket) : "—"}</dd>
            <p className="help">{totals.salesCount} venda(s) no período</p>
          </div>
          <div className="card-soft">
            <dt className="text-[13.5px] text-muted">Custo para ganhar 1 cliente</dt>
            <dd className="font-display text-[22px] font-semibold">
              {totals.costPerClient === null ? "—" : brl(totals.costPerClient)}
            </dd>
            <p className="help">Tudo que saiu ÷ vendas</p>
          </div>
          <div className="card-soft">
            <dt className="text-[13.5px] text-muted">De cada 100 leads, fecham</dt>
            <dd className="font-display text-[22px] font-semibold">{pct(stages[4].count, stages[0].count).replace("%", "")}</dd>
            <p className="help">Fechados ÷ encontrados</p>
          </div>
        </dl>
      </details>
    </div>
  );
}

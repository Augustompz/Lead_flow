import Link from "next/link";
import { redirect } from "next/navigation";
import { addManualLeadAction } from "@/app/actions/leads";
import { ActionForm } from "@/components/ActionForm";
import { ChanceMeter, SiteBadge } from "@/components/badges";
import { BulkBar } from "@/components/BulkBar";
import { Icon } from "@/components/Icon";
import { StatusSelect } from "@/components/StatusSelect";
import { EmptyState, Hint, PageHeader } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { requireSession } from "@/lib/auth";
import { STATUSES } from "@/lib/constants";
import { getSettings, rows } from "@/lib/db";
import { fmtDate, todayBR } from "@/lib/format";
import { distinctValues, filtersFromParams, LEAD_GROUPS, PAGE_SIZE, queryLeads } from "@/lib/lead-query";
import { buildMessage, whatsappUrl } from "@/lib/scoring";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSession();
  const params = await searchParams;
  const filters = filtersFromParams(params);
  const [{ leads, total }, settings, cities, niches, byStatus] = await Promise.all([
    queryLeads(filters),
    getSettings(),
    distinctValues("city"),
    distinctValues("niche"),
    rows<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM leads GROUP BY status"),
  ]);

  const today = todayBR();
  const page = filters.page ?? 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (overrides: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...overrides })) {
      if (v !== undefined && v !== "" && !(k === "page" && Number(v) === 1)) u.set(k, String(v));
    }
    const s = u.toString();
    return s ? `?${s}` : "";
  };

  if (page > pages) redirect(`/leads${qs({ page: pages })}`);

  const count = (statuses: readonly string[]) =>
    byStatus.filter((r) => statuses.includes(r.status)).reduce((a, r) => a + Number(r.n), 0);
  const everything = byStatus.reduce((a, r) => a + Number(r.n), 0);
  const hasFilters = !!(filters.q || filters.status || filters.site || filters.tier || filters.city || filters.niche || filters.search || filters.due);
  const advancedOpen = !!(filters.status || filters.site || filters.tier || filters.city || filters.niche || filters.sort);

  return (
    <div>
      <PageHeader
        title="Meus leads"
        intro="Empresas que você encontrou. As de maior chance de fechar aparecem primeiro."
        actions={
          <>
            <a href={`/api/leads/export${qs({ page: undefined })}`} className="btn btn-sm">
              Baixar planilha
            </a>
            <Link href="/buscar" className="btn btn-primary btn-sm">
              <Icon name="search" size={16} /> Buscar mais
            </Link>
          </>
        }
      />

      {everything === 0 ? (
        <EmptyState icon="search" title="Você ainda não tem leads" action={{ href: "/buscar", label: "Fazer minha primeira busca" }}>
          Escolha um tipo de empresa e uma cidade. Em alguns segundos os leads aparecem aqui, já ordenados por chance de fechar.
        </EmptyState>
      ) : (
        <>
          <nav aria-label="Etapa" className="seg mb-5">
            <Link href={`/leads${qs({ group: undefined, status: undefined, due: undefined, page: undefined })}`} aria-current={!filters.group ? "true" : undefined}>
              Todos <span className="ml-1.5 text-muted">{everything}</span>
            </Link>
            {LEAD_GROUPS.map((g) => (
              <Link
                key={g.key}
                href={`/leads${qs({ group: g.key, status: undefined, due: undefined, page: undefined })}`}
                aria-current={filters.group === g.key ? "true" : undefined}
              >
                {g.label} <span className="ml-1.5 text-muted">{count(g.statuses)}</span>
              </Link>
            ))}
          </nav>

          <form method="get" className="mb-6 space-y-3">
            {filters.group && <input type="hidden" name="group" value={filters.group} />}
            {filters.search && <input type="hidden" name="search" value={filters.search} />}
            {filters.due && <input type="hidden" name="due" value={filters.due} />}
            <div className="flex gap-2">
              <input
                id="q"
                name="q"
                defaultValue={filters.q}
                className="input"
                placeholder="Buscar por nome, telefone ou endereço"
                aria-label="Buscar por nome, telefone ou endereço"
                type="search"
              />
              <button className="btn btn-primary shrink-0">Buscar</button>
            </div>

            <details className="fold" open={advancedOpen}>
              <summary className="!justify-start gap-1.5 text-[14.5px] text-accent">
                <Icon name="sliders" size={17} /> Mais filtros
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Select label="Etapa exata" name="status" value={filters.status} options={STATUSES.map((s) => [s.key, s.label])} />
                <Select
                  label="Situação do site"
                  name="site"
                  value={filters.site}
                  options={[
                    ["none", "Sem site"],
                    ["social", "Só rede social"],
                    ["own", "Tem site"],
                  ]}
                />
                <Select
                  label="Chance de fechar"
                  name="tier"
                  value={filters.tier}
                  options={[
                    ["quente", "Alta"],
                    ["morno", "Média"],
                    ["frio", "Baixa"],
                  ]}
                />
                <Select label="Cidade" name="city" value={filters.city} options={cities.map((c) => [c, c])} />
                <Select label="Tipo de empresa" name="niche" value={filters.niche} options={niches.map((c) => [c, c])} />
                <Select
                  label="Ordenar por"
                  name="sort"
                  value={filters.sort ?? "score"}
                  allowEmpty={false}
                  options={[
                    ["score", "Maior chance"],
                    ["recent", "Mais recentes"],
                    ["name", "Nome (A–Z)"],
                    ["followup", "Próximo retorno"],
                  ]}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button className="btn btn-sm">Aplicar filtros</button>
                {hasFilters && (
                  <Link href={`/leads${qs({ q: undefined, status: undefined, site: undefined, tier: undefined, city: undefined, niche: undefined, search: undefined, due: undefined, sort: undefined, page: undefined })}`} className="text-[14.5px] font-semibold text-accent hover:underline">
                    Limpar filtros
                  </Link>
                )}
              </div>
            </details>

            <Hint label="Como a chance de fechar é calculada?">
              É uma nota de 0 a 100 que soma: empresa <b>sem site</b> (a maior parte), <b>celular</b> para WhatsApp,{" "}
              <b>muitas avaliações</b> e <b>boa nota</b> no Google. Quem é conhecido e bem avaliado tem mais motivo e mais
              caixa para investir em um site.
            </Hint>
          </form>

          <p className="mb-3 text-[14.5px] text-muted" aria-live="polite">
            {total === 0 ? "Nenhum lead com esses filtros." : `${total} ${total === 1 ? "lead" : "leads"}`}
          </p>

          {total === 0 ? (
            <EmptyState icon="users" title="Nada por aqui com esses filtros">
              Tire algum filtro ou faça uma nova busca para trazer mais empresas.
            </EmptyState>
          ) : (
            <form>
            <BulkBar total={leads.length} />
            <ul className="space-y-3">
              {leads.map((l) => {
                const followUpDue = l.follow_up_at && l.follow_up_at <= today && l.status !== "fechado" && l.status !== "perdido";
                return (
                  <li key={l.id} className="card flex flex-wrap items-center gap-x-4 gap-y-3 !p-4 md:!px-5">
                    <label className="-ml-1.5 flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center">
                      <input type="checkbox" name="ids" value={l.id} className="h-5 w-5" aria-label={`Marcar ${l.name}`} />
                    </label>
                    <div className="min-w-0 flex-1 basis-[220px]">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={`/leads/${l.id}`} className="text-[16.5px] font-semibold leading-snug hover:underline">
                          {l.name}
                        </Link>
                        {l.source === "demo" && <span className="chip bg-warn-soft !py-0 text-warn">demo</span>}
                        {l.source === "manual" && <span className="chip bg-surface-2 !py-0 text-muted">manual</span>}
                        {l.do_not_contact ? <span className="chip bg-rose-soft !py-0 text-rose">Não contatar</span> : null}
                      </div>
                      <p className="mt-0.5 text-[14px] text-muted">
                        {[l.niche, l.city].filter(Boolean).join(" · ")}
                        {l.phone && <span> · {l.phone}</span>}
                        {l.rating ? <span> · ★ {l.rating.toFixed(1)} ({l.reviews ?? 0})</span> : null}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <ChanceMeter score={l.score} />
                        <SiteBadge status={l.site_status} />
                        {l.follow_up_at && (
                          <span className={`chip ${followUpDue ? "bg-rose-soft text-rose" : "bg-surface-2 text-ink-2"}`}>
                            <Icon name="calendar" size={14} /> Retorno {fmtDate(l.follow_up_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusSelect key={`${l.id}-${l.status}`} leadId={l.id} status={l.status} />
                      {l.phone_digits && !l.do_not_contact && (
                        <WhatsAppButton
                          leadId={l.id}
                          mobile={!!l.is_mobile}
                          href={whatsappUrl(l.phone_digits, buildMessage(settings.msg_template, l))}
                        />
                      )}
                      <Link href={`/leads/${l.id}`} className="btn btn-sm btn-ghost hidden md:inline-flex">
                        Abrir
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
            </form>
          )}

          {pages > 1 && (
            <nav aria-label="Páginas" className="mt-6 flex items-center justify-between gap-3">
              {page > 1 ? (
                <Link href={`/leads${qs({ page: page - 1 })}`} className="btn">
                  ← Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-[14.5px] text-muted">
                Página {page} de {pages}
              </span>
              {page < pages ? (
                <Link href={`/leads${qs({ page: page + 1 })}`} className="btn">
                  Próxima →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}

      <details className="fold card mt-10">
        <summary>
          <span>Cadastrar um lead à mão</span>
          <Icon name="chevron" size={20} className="chev" />
        </summary>
        <p className="mb-4 mt-2 text-[14.5px] text-muted">
          Achou uma empresa no Instagram ou por indicação? Cadastre aqui e ela entra no mesmo caminho dos outros leads.
        </p>
        <ActionForm action={addManualLeadAction} submitLabel="Cadastrar lead" successMessage="Lead cadastrado.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da empresa" name="name" required />
            <Field label="Telefone / WhatsApp" name="phone" placeholder="(62) 99999-9999" mode="tel" />
            <Field label="Instagram" name="instagram" placeholder="@empresa" />
            <Field label="Site (se tiver)" name="website" placeholder="www.empresa.com.br" />
            <Field label="Tipo de empresa" name="niche" placeholder="padaria" />
            <Field label="Cidade" name="city" />
          </div>
        </ActionForm>
      </details>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
  mode,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  mode?: "tel";
}) {
  return (
    <div>
      <label className="label" htmlFor={`f-${name}`}>
        {label}
      </label>
      <input id={`f-${name}`} name={name} required={required} placeholder={placeholder} inputMode={mode} className="input" />
    </div>
  );
}

function Select({
  label,
  name,
  value,
  options,
  allowEmpty = true,
}: {
  label: string;
  name: string;
  value?: string;
  options: string[][];
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={`s-${name}`}>
        {label}
      </label>
      <select id={`s-${name}`} name={name} defaultValue={value ?? ""} className="input">
        {allowEmpty && <option value="">Todos</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

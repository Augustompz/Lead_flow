import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addNoteAction,
  deleteLeadAction,
  doNotContactAction,
  saveLeadAction,
  undoDoNotContactAction,
} from "@/app/actions/leads";
import { addSaleAction } from "@/app/actions/finance";
import { ActionForm } from "@/components/ActionForm";
import { ChanceMeter, SiteBadge } from "@/components/badges";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Icon } from "@/components/Icon";
import { StatusSelect } from "@/components/StatusSelect";
import { Hint, SectionTitle } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { requireSession } from "@/lib/auth";
import { SERVICE_SUGGESTIONS, STATUS_HELP } from "@/lib/constants";
import { getSettings } from "@/lib/db";
import { fmtDate, fmtDateTime, todayBR } from "@/lib/format";
import { getInteractions, getLead } from "@/lib/leads";
import { buildMessage, whatsappUrl } from "@/lib/scoring";

const TYPE_LABEL: Record<string, string> = {
  captado: "Encontrado",
  status: "Etapa",
  whatsapp: "WhatsApp",
  nota: "Anotação",
  venda: "Venda",
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const lead = await getLead(id);
  if (!lead) notFound();

  const [history, settings] = await Promise.all([getInteractions(id), getSettings()]);
  const message = buildMessage(settings.msg_template, lead);
  const closing = ["respondeu", "proposta", "fechado"].includes(lead.status);

  return (
    <div>
      <Link href="/leads" className="inline-flex min-h-[40px] items-center gap-1.5 text-[14.5px] font-semibold text-accent">
        ← Meus leads
      </Link>

      <header className="mb-7 mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-[30px] font-bold leading-tight tracking-tight md:text-[34px]">{lead.name}</h1>
          {lead.source === "demo" && <span className="chip bg-warn-soft text-warn">demo</span>}
          {lead.do_not_contact ? <span className="chip bg-rose-soft text-rose">Não contatar</span> : null}
        </div>
        <p className="mt-1 text-[15px] text-muted">
          {[lead.niche, lead.city].filter(Boolean).join(" · ")} · encontrado em {fmtDate(lead.created_at)}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ChanceMeter score={lead.score} />
          <SiteBadge status={lead.site_status} />
          <StatusSelect key={lead.status} leadId={lead.id} status={lead.status} />
        </div>
        <p className="mt-2 text-[14px] text-muted">{STATUS_HELP[lead.status]}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="min-w-0 space-y-8 lg:col-span-3">
          <section className="card space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13.5px] font-semibold text-muted">Telefone</p>
                <p className="font-display text-[22px] font-semibold">{lead.phone ?? "Sem telefone"}</p>
              </div>
              {lead.phone_digits && !lead.do_not_contact && (
                <WhatsAppButton
                  leadId={lead.id}
                  mobile={!!lead.is_mobile}
                  small={false}
                  label="Chamar no WhatsApp"
                  href={whatsappUrl(lead.phone_digits, message)}
                />
              )}
            </div>

            {lead.phone_digits && !lead.do_not_contact && (
              <div>
                <p className="mb-1.5 text-[13.5px] font-semibold text-muted">Mensagem que vai junto</p>
                <p className="rounded-xl bg-surface-2 p-4 text-[15px] leading-relaxed text-ink-2">{message}</p>
                <p className="help">
                  Você confere e envia no WhatsApp. Para mudar o texto, vá em{" "}
                  <Link href="/configuracoes" className="font-semibold text-accent underline">
                    Ajustes
                  </Link>
                  .
                </p>
              </div>
            )}

            <dl className="grid gap-4 border-t border-line pt-5 text-[15px] sm:grid-cols-2">
              <Info label="Endereço" value={lead.address} />
              <Info label="Avaliação no Google" value={lead.rating ? `★ ${lead.rating.toFixed(1)} (${lead.reviews ?? 0} avaliações)` : null} />
              <Info label="Site cadastrado no Google" value={lead.website} href={lead.website ?? undefined} empty="Nenhum" />
              <Info label="Mapa" value={lead.maps_url ? "Abrir no Google Maps" : null} href={lead.maps_url ?? undefined} />
            </dl>

            {lead.site_status !== "own" && (
              <Hint label="Esse lead realmente não tem site?">
                “Sem site” quer dizer que o Google Maps não tem um site cadastrado. A empresa pode ter um que não aparece lá.{" "}
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${lead.name} ${lead.city ?? ""}`.trim())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-accent underline"
                >
                  Conferir no Google antes de chamar
                </a>
                .
              </Hint>
            )}
          </section>

          <section>
            <SectionTitle>Anotações e retorno</SectionTitle>
            <form action={saveLeadAction} className="card space-y-4">
              <input type="hidden" name="id" value={lead.id} />
              <div>
                <label className="label" htmlFor="follow_up_at">
                  Voltar a falar com essa empresa em
                </label>
                <input
                  id="follow_up_at"
                  name="follow_up_at"
                  type="date"
                  defaultValue={lead.follow_up_at ?? ""}
                  min={todayBR()}
                  className="input sm:!w-auto"
                />
                <p className="help">
                  Na data marcada, ela aparece em “Para falar hoje” no Início e o menu mostra uma bolinha com quantos retornos
                  esperam.
                  {lead.follow_up_at && (
                    <>
                      {" "}
                      <a href={`/api/leads/${lead.id}/lembrete`} className="font-semibold text-accent underline">
                        Adicionar ao calendário do celular
                      </a>{" "}
                      para receber um aviso.
                    </>
                  )}
                </p>
              </div>
              <div>
                <label className="label" htmlFor="notes">
                  Observações
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  defaultValue={lead.notes ?? ""}
                  className="input"
                  placeholder="Ex.: o dono se chama João e prefere falar à tarde."
                />
              </div>
              <button className="btn">Salvar</button>
            </form>
          </section>

          <details className="fold card" open={closing}>
            <summary>
              <span>Fechou negócio? Registrar venda</span>
              <Icon name="chevron" size={20} className="chev" />
            </summary>
            <p className="mb-4 mt-2 text-[14.5px] text-muted">
              Ao registrar, o lead vira “Fechado” e o valor entra no seu dinheiro.
            </p>
            <ActionForm action={addSaleAction} submitLabel="Registrar venda" successMessage="Venda registrada.">
              <input type="hidden" name="lead_id" value={lead.id} />
              <input type="hidden" name="client_name" value={lead.name} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="service">
                    O que você vendeu
                  </label>
                  <input id="service" name="service" required list="services" className="input" defaultValue="Site institucional" />
                  <datalist id="services">
                    {SERVICE_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="label" htmlFor="amount">
                    Valor do projeto (R$)
                  </label>
                  <input id="amount" name="amount" inputMode="decimal" placeholder="1.500,00" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="monthly">
                    Mensalidade (R$), se houver
                  </label>
                  <input id="monthly" name="monthly" inputMode="decimal" placeholder="99,00" className="input" />
                  <p className="help">Hospedagem ou manutenção cobrada todo mês.</p>
                </div>
                <div>
                  <label className="label" htmlFor="sold_at">
                    Data
                  </label>
                  <input id="sold_at" name="sold_at" type="date" defaultValue={todayBR()} className="input" />
                </div>
              </div>
            </ActionForm>
          </details>
        </div>

        <aside className="min-w-0 space-y-6 lg:col-span-2">
          <section>
            <SectionTitle>Histórico</SectionTitle>
            <div className="card">
              <form action={addNoteAction} className="mb-5 flex gap-2">
                <input type="hidden" name="id" value={lead.id} />
                <input name="text" required className="input" placeholder="Ex.: ligou, pediu orçamento" aria-label="Nova anotação" />
                <button className="btn shrink-0">Anotar</button>
              </form>
              <ol className="space-y-4 border-l-2 border-line pl-5">
                {history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[27px] top-[7px] h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
                    <p className="text-[13px] font-semibold text-muted">
                      {TYPE_LABEL[h.type] ?? h.type} · {fmtDateTime(h.created_at)}
                    </p>
                    <p className="text-[15px]">{h.content}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {lead.do_not_contact ? (
            <form action={undoDoNotContactAction} className="card-soft space-y-2">
              <input type="hidden" name="id" value={lead.id} />
              <p className="text-[14.5px] text-ink-2">
                Esta empresa está na sua lista de <b>não contatar</b>. Ela não aparece mais em buscas nem nas listas de chamar.
              </p>
              <button className="btn btn-sm">Remover da lista de não contatar</button>
            </form>
          ) : (
            <form action={doNotContactAction} className="card-soft space-y-3">
              <input type="hidden" name="id" value={lead.id} />
              <p className="text-[14.5px] font-semibold">A empresa pediu para não receber mais mensagens?</p>
              <input name="reason" className="input" placeholder="Motivo (opcional)" aria-label="Motivo" />
              <ConfirmButton
                message="Marcar como não contatar? A empresa some das listas de chamar e nunca mais será captada nas buscas."
                className="btn btn-sm"
              >
                Não contatar mais
              </ConfirmButton>
            </form>
          )}

          <form action={deleteLeadAction}>
            <input type="hidden" name="id" value={lead.id} />
            <ConfirmButton message="Excluir este lead e todo o histórico dele? Não dá para desfazer." className="btn btn-sm btn-ghost btn-danger">
              Excluir este lead
            </ConfirmButton>
          </form>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value, href, empty = "—" }: { label: string; value: string | null; href?: string; empty?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13.5px] font-semibold text-muted">{label}</dt>
      <dd className="break-words">
        {value ? (
          href && /^https?:\/\//i.test(href) ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-muted">{empty}</span>
        )}
      </dd>
    </div>
  );
}

import { logoutAction } from "@/app/actions/auth";
import {
  addUserAction,
  changePasswordAction,
  clearErrorLogAction,
  saveSettingsAction,
  sendTestEmailAction,
} from "@/app/actions/settings";
import { removeBlockEntryAction } from "@/app/actions/leads";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ThemeSwitch } from "@/components/ThemeToggle";
import { listBlocklist } from "@/lib/blocklist";
import { errorCountLastDays, recentErrors } from "@/lib/errorlog";
import { emailConfigured } from "@/lib/notify";
import { Icon } from "@/components/Icon";
import { Hint, PageHeader, SectionTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { DEFAULT_MESSAGE, GOOGLE_FREE_REQUESTS, SETTING_DEFAULTS } from "@/lib/constants";
import { getSettings, rows } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { getUsage } from "@/lib/usage";

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const free = GOOGLE_FREE_REQUESTS.toLocaleString("pt-BR");

export default async function ConfiguracoesPage() {
  await requireSession();
  const [settings, usage, blocked, errors, errorCount, users] = await Promise.all([
    getSettings(),
    getUsage(),
    listBlocklist(),
    recentErrors(10),
    errorCountLastDays(7),
    rows<{ id: number; name: string; email: string; created_at: string }>(
      "SELECT id, name, email, created_at FROM users ORDER BY id",
    ),
  ]);
  const hasKey = !!process.env.GOOGLE_MAPS_API_KEY?.trim();
  const emailOn = emailConfigured();

  return (
    <div className="space-y-10">
      <PageHeader title="Ajustes" intro="Deixe o sistema do seu jeito." />

      <section className="space-y-4">
        <SectionTitle>Aparência</SectionTitle>
        <div className="card space-y-3">
          <p className="text-[15px] text-ink-2">
            O modo escuro é bem suave, com cinza-esverdeado em vez de preto, para cansar menos a vista. “Automático” segue o
            tema do seu aparelho.
          </p>
          <ThemeSwitch />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle
          aside={
            <span className={`chip ${hasKey ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>
              {hasKey ? "Busca real ligada" : "Modo demonstração"}
            </span>
          }
        >
          Busca no Google
        </SectionTitle>
        <div className="card space-y-4">
          <p className="text-[15.5px] text-ink-2">
            {hasKey
              ? "A busca está ligada: o sistema procura empresas reais no Google Maps."
              : "Por enquanto o sistema cria empresas fictícias para você testar. Para buscar empresas reais, ligue a busca do Google. É grátis até " +
                free +
                " buscas por mês."}
          </p>
          <details className="fold">
            <summary className="!justify-start gap-2 text-accent">
              <Icon name="info" size={18} /> Passo a passo para ligar a busca real
              <Icon name="chevron" size={18} className="chev ml-auto" />
            </summary>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-[15px] text-ink-2 marker:font-semibold">
              <li>
                Entre em <b>console.cloud.google.com</b> com sua conta Google e crie um projeto (por exemplo, “LeadFlow”).
              </li>
              <li>
                No menu <b>Faturamento</b>, ative o faturamento com um cartão. O Google pede o cartão, mas só cobra o que
                passar da cota grátis.
              </li>
              <li>
                Vá em <b>APIs e serviços → Biblioteca</b>, procure <b>“Places API (New)”</b> e clique em <b>Ativar</b>.
              </li>
              <li>
                Vá em <b>APIs e serviços → Credenciais → Criar credenciais → Chave de API</b> e copie a chave.
              </li>
              <li>
                Clique na chave, em <b>Restrições de API</b> escolha “Restringir chave” e marque só a Places API (New). Assim, se
                a chave vazar, ela só serve para isso.
              </li>
              <li>
                Cole a chave na variável <code>GOOGLE_MAPS_API_KEY</code> (arquivo <code>.env.local</code> no seu computador ou
                nas variáveis da hospedagem) e reinicie o sistema.
              </li>
            </ol>
            <div className="mt-4 rounded-xl bg-surface-2 p-4 text-[14.5px] text-ink-2">
              <p className="font-semibold">Proteção contra cobrança</p>
              <p className="mt-1">
                O LeadFlow já bloqueia as buscas ao chegar no limite mensal definido abaixo. Como reforço, em{" "}
                <b>Faturamento → Orçamentos e alertas</b> crie um alerta (ele só avisa por e-mail, não bloqueia nada). Não
                compartilhe a chave: a trava só vale para buscas feitas aqui.
              </p>
            </div>
          </details>
        </div>
      </section>

      <ActionForm action={saveSettingsAction} submitLabel="Salvar ajustes" resetOnSuccess={false} className="space-y-10">
        <section className="space-y-4">
          <SectionTitle>Mensagem do WhatsApp</SectionTitle>
          <div className="card">
            <label className="label" htmlFor="msg_template">
              Texto que acompanha o botão “Chamar”
            </label>
            <textarea id="msg_template" name="msg_template" rows={8}defaultValue={settings.msg_template} className="input" />
            <p className="help">
              Use <code>{"{nome}"}</code> para o nome da empresa, <code>{"{nicho}"}</code> para o tipo de empresa e{" "}
              <code>{"{cidade}"}</code> para a cidade. O sistema troca por dados reais de cada lead.
            </p>
            <div className="mt-3">
              <Hint label="Dicas para a mensagem funcionar">
                Seja breve, cite o nome da empresa e faça uma pergunta simples. Mensagens idênticas enviadas em massa podem
                bloquear seu número, então chame com calma e personalize quando puder.
                <span className="mt-2 block text-[13.5px] text-muted">Texto original: {DEFAULT_MESSAGE}</span>
              </Hint>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle>Cota de buscas e meta</SectionTitle>
          <div className="card space-y-6">
            <div>
              <label className="label" htmlFor="limite_requisicoes">
                Limite de buscas por mês (trava do sistema)
              </label>
              <input
                id="limite_requisicoes"
                name="limite_requisicoes"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                defaultValue={settings.limite_requisicoes}
                className="input sm:!w-40"
              />
              <p className="help">
                Neste mês: <b>{usage.used}</b> de {usage.limit} usadas. Ao chegar no limite, o sistema para de chamar o Google
                até o dia 1º. O Google dá {free} grátis, então o padrão ({SETTING_DEFAULTS.limite_requisicoes}) deixa uma
                folga. Use <b>0</b> para desligar as buscas reais.
              </p>
              <label className="mt-3 flex items-start gap-3 text-[14px] text-ink-2">
                <input type="checkbox" name="accept_charges" className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  Só marque se for usar <b>mais de {free}</b>: entendo que acima disso o Google cobra do meu cartão.
                </span>
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="meta_mensal">
                  Meta de dinheiro que entra por mês (R$)
                </label>
                <input
                  id="meta_mensal"
                  name="meta_mensal"
                  inputMode="decimal"
                  defaultValue={settings.meta_mensal ? centsToInput(settings.meta_mensal) : ""}
                  placeholder="5.000,00"
                  className="input"
                />
                <p className="help">Aparece como barra de progresso no Início. Deixe vazio se não quiser.</p>
              </div>
              <div>
                <label className="label" htmlFor="custo_requisicao">
                  Preço de cada busca acima da cota (R$)
                </label>
                <input
                  id="custo_requisicao"
                  name="custo_requisicao"
                  inputMode="decimal"
                  defaultValue={centsToInput(settings.custo_requisicao)}
                  className="input"
                />
                <p className="help">Só entra nos seus custos o que passar das {free} grátis do mês.</p>
              </div>
            </div>
          </div>
        </section>
      </ActionForm>

      <section className="space-y-4">
        <SectionTitle>Lista de não contatar</SectionTitle>
        <div className="card space-y-3">
          <p className="text-[15px] text-ink-2">
            Empresas que pediram para não receber mensagens. Elas nunca mais aparecem nas buscas, mesmo que você apague o
            lead. Para adicionar, abra o lead e use “Não contatar mais”.
          </p>
          {blocked.length === 0 ? (
            <p className="card-soft text-[14.5px] text-muted">Ninguém na lista por enquanto.</p>
          ) : (
            <ul className="divide-y divide-line">
              {blocked.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{b.name}</p>
                    <p className="text-[13.5px] text-muted">
                      {b.reason ?? "Pediu para não ser contatado"} · {fmtDate(b.created_at)}
                    </p>
                  </div>
                  <form action={removeBlockEntryAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmButton message="Tirar esta empresa da lista? Ela poderá voltar a aparecer nas buscas." className="btn btn-sm">
                      Remover da lista
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle
          aside={
            <span className={`chip ${emailOn ? "bg-good-soft text-good" : "bg-surface-2 text-muted"}`}>
              {emailOn ? "E-mail ligado" : "E-mail desligado"}
            </span>
          }
        >
          Avisos e erros
        </SectionTitle>
        <div className="card space-y-5">
          <p className="text-[15px] text-ink-2">
            Retornos marcados aparecem no Início e como uma bolinha no menu. Com o e-mail ligado, você também recebe um
            resumo toda manhã com quem precisa de retorno, e um aviso quando algo dá errado no sistema.
          </p>
          {emailOn ? (
            <ActionForm action={sendTestEmailAction} submitLabel="Enviar e-mail de teste" successMessage="Enviado! Confira sua caixa de entrada." resetOnSuccess={false} submitClassName="btn btn-sm">
              <span className="text-[14px] text-muted">O e-mail vai para {process.env.ALERT_EMAIL}.</span>
            </ActionForm>
          ) : (
            <details className="fold">
              <summary className="!justify-start gap-2 text-accent">
                <Icon name="info" size={18} /> Como ligar os avisos por e-mail
                <Icon name="chevron" size={18} className="chev ml-auto" />
              </summary>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] text-ink-2 marker:font-semibold">
                <li>
                  Crie uma conta grátis em <b>resend.com</b> e gere uma chave de API.
                </li>
                <li>
                  Coloque nas variáveis do sistema: <code>RESEND_API_KEY</code> (a chave) e <code>ALERT_EMAIL</code> (seu
                  e-mail).
                </li>
                <li>
                  Para o resumo diário, defina também <code>CRON_SECRET</code> (um texto longo e secreto). Na Vercel o
                  horário já está configurado.
                </li>
                <li>Reinicie o sistema e volte aqui para enviar um e-mail de teste.</li>
              </ol>
            </details>
          )}

          <div className="border-t border-line pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-[17px] font-semibold">Erros recentes</h3>
              <span className="text-[14px] text-muted">{errorCount} nos últimos 7 dias</span>
            </div>
            {errors.length === 0 ? (
              <p className="card-soft text-[14.5px] text-muted">Nenhum erro registrado. Tudo certo.</p>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {errors.map((e) => (
                    <li key={e.id} className="py-3">
                      <p className="break-words text-[14.5px] font-semibold">{e.message}</p>
                      <p className="text-[13px] text-muted">
                        {fmtDateTime(e.created_at)} · {e.path || "—"}
                        {e.digest && ` · código ${e.digest}`}
                      </p>
                    </li>
                  ))}
                </ul>
                <form action={clearErrorLogAction} className="mt-3">
                  <button className="btn btn-sm">Limpar lista de erros</button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Quem tem acesso</SectionTitle>
        <div className="card space-y-6">
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <b className="font-semibold">{u.name}</b> <span className="break-all text-muted">{u.email}</span>
                </span>
                <span className="text-[13.5px] text-muted">desde {fmtDate(u.created_at)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[14px] text-muted">Todas as pessoas veem os mesmos leads e o mesmo dinheiro.</p>

          <div className="grid gap-8 border-t border-line pt-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 font-display text-[17px] font-semibold">Dar acesso a mais alguém</h3>
              <ActionForm action={addUserAction} submitLabel="Adicionar pessoa" successMessage="Pessoa adicionada.">
                <div className="space-y-3">
                  <input name="name" required placeholder="Nome" aria-label="Nome" className="input" />
                  <input name="email" type="email" required placeholder="E-mail" aria-label="E-mail" className="input" />
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Senha (mínimo 8 caracteres)"
                    aria-label="Senha"
                    autoComplete="new-password"
                    className="input"
                  />
                </div>
              </ActionForm>
            </div>
            <div>
              <h3 className="mb-3 font-display text-[17px] font-semibold">Trocar minha senha</h3>
              <ActionForm action={changePasswordAction} submitLabel="Trocar senha" successMessage="Senha alterada.">
                <div className="space-y-3">
                  <input
                    name="current"
                    type="password"
                    required
                    placeholder="Senha atual"
                    aria-label="Senha atual"
                    autoComplete="current-password"
                    className="input"
                  />
                  <input
                    name="next"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Nova senha (mínimo 8 caracteres)"
                    aria-label="Nova senha"
                    autoComplete="new-password"
                    className="input"
                  />
                </div>
              </ActionForm>
            </div>
          </div>
        </div>
      </section>

      <form action={logoutAction}>
        <button className="btn">
          <Icon name="logout" size={18} /> Sair do sistema
        </button>
      </form>
    </div>
  );
}

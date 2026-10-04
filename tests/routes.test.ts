import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cron } from "@/app/api/cron/lembretes/route";
import { GET as exportCsv } from "@/app/api/leads/export/route";
import { GET as ics } from "@/app/api/leads/[id]/lembrete/route";
import { recentErrors, recordError, errorCountLastDays } from "@/lib/errorlog";
import { emailConfigured, sendEmail } from "@/lib/notify";
import { rows, run } from "@/lib/db";
import { todayBR } from "@/lib/format";
import { loginAs, makeLead, makeUser, resetAll, resetRequest, state } from "./helpers";

beforeEach(resetAll);
afterEach(() => {
  vi.unstubAllGlobals();
  process.env.CRON_SECRET = "";
  process.env.RESEND_API_KEY = "";
  process.env.ALERT_EMAIL = "";
});

const req = (url: string, headers: Record<string, string> = {}) => new Request(`http://localhost${url}`, { headers });
const yesterday = () => {
  const d = new Date(`${todayBR()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

function stubResend(status = 200, body: unknown = { id: "1" }) {
  const fn = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("GET /api/leads/export (planilha)", () => {
  it("sem login: 401", async () => {
    expect((await exportCsv(req("/api/leads/export"))).status).toBe(401);
  });

  it("gera CSV com BOM, ponto e vírgula e os filtros aplicados", async () => {
    await loginAs(await makeUser());
    await makeLead({ name: "Alfa", status: "novo", phone: "(62) 99999-0001" });
    await makeLead({ name: "Beta", status: "fechado" });
    const res = await exportCsv(req("/api/leads/export?status=fechado"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
    const lines = text.split("\r\n");
    expect(lines[0]).toContain('"Nome";"Nicho";"Cidade"');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Beta"');
    expect(text).not.toContain("Alfa");
  });

  it("protege contra fórmulas do Excel e escapa aspas", async () => {
    await loginAs(await makeUser());
    await makeLead({ name: '=HYPERLINK("http://x")' });
    await makeLead({ name: '+cmd|calc' });
    await makeLead({ name: 'Empresa "Boa"' });
    const text = new TextDecoder().decode(await (await exportCsv(req("/api/leads/export"))).arrayBuffer());
    expect(text).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(text).toContain(`"'+cmd|calc"`);
    expect(text).toContain(`"Empresa ""Boa"""`);
  });

  it("limite de 10 downloads por 10 minutos, com Retry-After", async () => {
    await loginAs(await makeUser());
    for (let i = 0; i < 10; i++) expect((await exportCsv(req("/api/leads/export"))).status).toBe(200);
    const blocked = await exportCsv(req("/api/leads/export"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("GET /api/leads/[id]/lembrete (.ics)", () => {
  const call = (id: string) => ics(req(`/api/leads/${id}/lembrete`), { params: Promise.resolve({ id }) });

  it("sem login: 401", async () => {
    expect((await call("1")).status).toBe(401);
  });

  it("baixa o evento do lead com retorno marcado", async () => {
    await loginAs(await makeUser());
    const id = await makeLead({ name: "Padaria", follow_up_at: "2026-10-15" });
    const res = await call(String(id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(await res.text()).toContain("SUMMARY:Falar com Padaria");
  });

  it("404 sem retorno marcado, lead inexistente ou id inválido", async () => {
    await loginAs(await makeUser());
    const id = await makeLead({ follow_up_at: null });
    expect((await call(String(id))).status).toBe(404);
    expect((await call("99999")).status).toBe(404);
    expect((await call("abc")).status).toBe(404);
  });
});

describe("GET /api/cron/lembretes (resumo diário)", () => {
  it("desligado sem CRON_SECRET (503)", async () => {
    expect((await cron(req("/api/cron/lembretes"))).status).toBe(503);
  });

  it("recusa sem senha, com senha errada e com senha de tamanho diferente (401)", async () => {
    process.env.CRON_SECRET = "segredo-certo";
    expect((await cron(req("/api/cron/lembretes"))).status).toBe(401);
    expect((await cron(req("/api/cron/lembretes", { authorization: "Bearer errado" }))).status).toBe(401);
    expect((await cron(req("/api/cron/lembretes", { authorization: "Bearer segredo-certo-e-mais" }))).status).toBe(401);
    expect((await cron(req("/api/cron/lembretes", { authorization: "segredo-certo" }))).status).toBe(401);
  });

  it("sem retornos: responde ok e não envia", async () => {
    process.env.CRON_SECRET = "s";
    const res = await cron(req("/api/cron/lembretes", { authorization: "Bearer s" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, due: 0, sent: false });
  });

  it("com retornos mas e-mail desligado: conta, mas não envia", async () => {
    process.env.CRON_SECRET = "s";
    await makeLead({ follow_up_at: yesterday() });
    const res = await cron(req("/api/cron/lembretes", { authorization: "Bearer s" }));
    expect(await res.json()).toMatchObject({ ok: true, due: 1, sent: false, reason: "e-mail não configurado" });
  });

  it("com e-mail ligado: envia o resumo pelo Resend", async () => {
    process.env.CRON_SECRET = "s";
    process.env.RESEND_API_KEY = "re_teste";
    process.env.ALERT_EMAIL = "eu@exemplo.com, outro@exemplo.com";
    await makeLead({ name: "Padaria do Zé", follow_up_at: yesterday() });
    const fetchMock = stubResend();
    const res = await cron(req("/api/cron/lembretes", { authorization: "Bearer s" }));
    expect(await res.json()).toMatchObject({ ok: true, due: 1, sent: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_teste");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["eu@exemplo.com", "outro@exemplo.com"]);
    expect(body.subject).toContain("1 retorno");
    expect(body.text).toContain("Padaria do Zé");
  });

  it("falha do Resend vira 502", async () => {
    process.env.CRON_SECRET = "s";
    process.env.RESEND_API_KEY = "re_teste";
    process.env.ALERT_EMAIL = "eu@exemplo.com";
    await makeLead({ follow_up_at: yesterday() });
    stubResend(422, { message: "domínio não verificado" });
    const res = await cron(req("/api/cron/lembretes", { authorization: "Bearer s" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, error: "domínio não verificado" });
  });

  it("limita chamadas por IP", async () => {
    process.env.CRON_SECRET = "s";
    state.headers.set("x-forwarded-for", "5.5.5.5");
    for (let i = 0; i < 30; i++) await cron(req("/api/cron/lembretes", { authorization: "Bearer s" }));
    expect((await cron(req("/api/cron/lembretes", { authorization: "Bearer s" }))).status).toBe(429);
  });
});

describe("e-mail (notify)", () => {
  it("só fica ligado com chave E destinatário", () => {
    expect(emailConfigured()).toBe(false);
    process.env.RESEND_API_KEY = "k";
    expect(emailConfigured()).toBe(false);
    process.env.ALERT_EMAIL = "a@b.com";
    expect(emailConfigured()).toBe(true);
  });

  it("desligado, nem tenta enviar", async () => {
    const fetchMock = stubResend();
    expect(await sendEmail("a", "b")).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("usa o remetente configurado e trata falha de rede", async () => {
    process.env.RESEND_API_KEY = "k";
    process.env.ALERT_EMAIL = "a@b.com";
    process.env.RESEND_FROM = "LeadFlow <oi@meudominio.com>";
    const fetchMock = stubResend();
    await sendEmail("assunto", "texto");
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).from).toBe("LeadFlow <oi@meudominio.com>");
    delete process.env.RESEND_FROM;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await sendEmail("a", "b")).toEqual({ ok: false, error: "Não consegui falar com o serviço de e-mail." });
  });
});

describe("registro de erros", () => {
  it("guarda mensagem, caminho sem a parte depois do '?', tipo e código", async () => {
    await recordError(Object.assign(new Error("deu ruim"), { digest: "abc123" }), "/leads?q=segredo&page=2", "render");
    const [e] = await recentErrors();
    expect(e).toMatchObject({ message: "deu ruim", path: "/leads", kind: "render", digest: "abc123" });
    expect(await errorCountLastDays(7)).toBe(1);
  });

  it("corta mensagem enorme e aceita erro que não é Error", async () => {
    await recordError(new Error("x".repeat(2000)), "/a", "route");
    await recordError("texto solto", "/b", "action");
    const list = await recentErrors();
    expect(list.map((e) => e.message.length)).toEqual([11, 500]);
  });

  it("não registra bloqueio por excesso de uso (não é falha do sistema)", async () => {
    await recordError(new Error("Muitas ações em pouco tempo."), "/x", "action");
    expect(await recentErrors()).toHaveLength(0);
  });

  it("mantém só os 200 mais recentes", async () => {
    for (let i = 0; i < 205; i++) await recordError(new Error(`erro ${i}`), "/x", "render");
    const all = await rows("SELECT * FROM error_log");
    expect(all).toHaveLength(200);
    expect((await recentErrors(1))[0].message).toBe("erro 204");
  });

  it("avisa por e-mail no máximo uma vez a cada 10 minutos", async () => {
    process.env.RESEND_API_KEY = "k";
    process.env.ALERT_EMAIL = "a@b.com";
    const fetchMock = stubResend();
    await recordError(new Error("primeiro"), "/a", "render");
    await recordError(new Error("segundo"), "/b", "render");
    await recordError(new Error("terceiro"), "/c", "render");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await recentErrors()).toHaveLength(3); // todos registrados, só o e-mail é limitado
  });

  it("falha ao mandar o e-mail não perde o registro", async () => {
    process.env.RESEND_API_KEY = "k";
    process.env.ALERT_EMAIL = "a@b.com";
    stubResend(500);
    await recordError(new Error("x"), "/a", "render");
    expect(await recentErrors()).toHaveLength(1);
  });

  it("erros antigos não entram na contagem dos últimos 7 dias", async () => {
    await run("INSERT INTO error_log (message, path, kind, created_at) VALUES ('velho', '/x', 'render', ?)", [
      new Date(Date.now() - 20 * 86400000).toISOString(),
    ]);
    expect(await errorCountLastDays(7)).toBe(0);
  });
});

describe("sanidade do ambiente de teste", () => {
  it("cada teste começa sem sessão", async () => {
    resetRequest();
    expect(state.cookies.size).toBe(0);
  });
});

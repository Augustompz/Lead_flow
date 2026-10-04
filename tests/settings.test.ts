import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearErrorLogAction, saveSettingsAction, sendTestEmailAction } from "@/app/actions/settings";
import { getSettings, rows } from "@/lib/db";
import { DEFAULT_MESSAGE } from "@/lib/constants";
import { recordError } from "@/lib/errorlog";
import { form, loginAs, makeUser, redirectOf, resetAll, resetRequest } from "./helpers";

beforeEach(async () => {
  await resetAll();
  await loginAs(await makeUser());
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env.RESEND_API_KEY = "";
  process.env.ALERT_EMAIL = "";
});

const save = (v: Record<string, string>) =>
  saveSettingsAction(undefined, form({ msg_template: "Olá, {nome}! Faço sites para {nicho}.", limite_requisicoes: "950", meta_mensal: "", custo_requisicao: "0,20", ...v }));

describe("configurações", () => {
  it("valores padrão quando nada foi salvo", async () => {
    expect(await getSettings()).toEqual({
      msg_template: DEFAULT_MESSAGE,
      meta_mensal: 0,
      custo_requisicao: 20,
      limite_requisicoes: 950,
    });
  });

  it("salva tudo e converte dinheiro para centavos", async () => {
    expect(await save({ meta_mensal: "5.000,00", custo_requisicao: "0,35", limite_requisicoes: "800" })).toEqual({ ok: true });
    expect(await getSettings()).toMatchObject({ meta_mensal: 500000, custo_requisicao: 35, limite_requisicoes: 800, msg_template: "Olá, {nome}! Faço sites para {nicho}." });
  });

  it("recusa mensagem curta", async () => {
    expect(await save({ msg_template: "oi" })).toMatchObject({ error: expect.stringContaining("curta") });
  });

  it("limite vazio NÃO vira 0 (isso bloquearia todas as buscas sem aviso)", async () => {
    expect(await save({ limite_requisicoes: "" })).toMatchObject({ error: expect.stringContaining("número inteiro") });
    expect(await save({ limite_requisicoes: "   " })).toMatchObject({ error: expect.any(String) });
    expect((await getSettings()).limite_requisicoes).toBe(950);
  });

  it("limite inválido: negativo, decimal e texto", async () => {
    for (const bad of ["-1", "1.5", "abc", "1e3x"]) {
      expect(await save({ limite_requisicoes: bad }), bad).toMatchObject({ error: expect.any(String) });
    }
  });

  it("zero é permitido (desliga as buscas reais)", async () => {
    expect(await save({ limite_requisicoes: "0" })).toEqual({ ok: true });
    expect((await getSettings()).limite_requisicoes).toBe(0);
  });

  it("acima de 1.000 exige a confirmação de que o Google vai cobrar", async () => {
    expect(await save({ limite_requisicoes: "1500" })).toMatchObject({ error: expect.stringContaining("cobra") });
    expect((await getSettings()).limite_requisicoes).toBe(950);
    expect(await save({ limite_requisicoes: "1000" })).toEqual({ ok: true }); // exatamente a franquia: sem custo
    expect(await save({ limite_requisicoes: "1500", accept_charges: "on" })).toEqual({ ok: true });
    expect((await getSettings()).limite_requisicoes).toBe(1500);
  });

  it("exige login", async () => {
    resetRequest();
    expect(await redirectOf(() => save({}))).toBe("/login");
  });
});

describe("registro de erros e e-mail de teste", () => {
  it("limpar apaga todos os erros", async () => {
    await recordError(new Error("a"), "/x", "render");
    await recordError(new Error("b"), "/y", "render");
    await clearErrorLogAction();
    expect(await rows("SELECT * FROM error_log")).toHaveLength(0);
  });

  it("e-mail de teste: erro claro quando não está configurado", async () => {
    expect(await sendEmailTest()).toMatchObject({ error: expect.stringContaining("não configurado") });
  });

  it("e-mail de teste: sucesso e limite de 3 por 10 minutos", async () => {
    process.env.RESEND_API_KEY = "k";
    process.env.ALERT_EMAIL = "a@b.com";
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 3; i++) expect(await sendEmailTest()).toEqual({ ok: true });
    expect(await sendEmailTest()).toMatchObject({ error: expect.stringContaining("Aguarde") });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

function sendEmailTest() {
  return sendTestEmailAction();
}

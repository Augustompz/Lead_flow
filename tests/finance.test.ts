import { beforeEach, describe, expect, it } from "vitest";
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
import { rows, run, setSetting } from "@/lib/db";
import { financeSummary, periodTotals } from "@/lib/finance";
import { lastMonths, todayBR } from "@/lib/format";
import { getInteractions, getLead } from "@/lib/leads";
import { form, loginAs, makeLead, makeUser, redirectOf, resetAll, resetRequest } from "./helpers";

beforeEach(async () => {
  await resetAll();
  await loginAs(await makeUser());
});

const today = todayBR();
const [m0, m1, m2] = lastMonths(3, today); // m2 = mês atual
const NOW = new Date().toISOString();

const sale = (client: string, amount: number, date: string) =>
  run("INSERT INTO sales (client_name, service, amount, sold_at, created_at) VALUES (?, 'Site', ?, ?, ?)", [client, amount, date, NOW]);
const sub = (client: string, amount: number, start: string, end: string | null = null) =>
  run("INSERT INTO subscriptions (client_name, plan, amount, start_date, end_date, created_at) VALUES (?, 'Plano', ?, ?, ?, ?)", [client, amount, start, end, NOW]);
const cost = (kind: "unico" | "mensal", amount: number, start: string, end: string | null = null) =>
  run("INSERT INTO costs (description, category, amount, kind, start_date, end_date, created_at) VALUES ('Custo', 'outros', ?, ?, ?, ?, ?)", [amount, kind, start, end, NOW]);

describe("financeSummary", () => {
  it("sem nenhum dado: tudo zero e margem indefinida", async () => {
    const s = await financeSummary(3);
    expect(s.months.map((m) => m.key)).toEqual([m0, m1, m2]);
    expect(s).toMatchObject({ revenue: 0, costs: 0, profit: 0, margin: null, salesCount: 0, avgTicket: 0, costPerClient: null, mrr: 0, activeClients: 0 });
  });

  it("soma vendas por mês pela data da venda", async () => {
    await sale("A", 100000, `${m0}-10`);
    await sale("B", 50000, `${m2}-02`);
    await sale("C", 25000, `${m2}-20`);
    const s = await financeSummary(3);
    expect(s.months.map((m) => m.salesRevenue)).toEqual([100000, 0, 75000]);
    expect(s.months.map((m) => m.salesCount)).toEqual([1, 0, 2]);
    expect(s.revenue).toBe(175000);
    expect(s.avgTicket).toBe(Math.round(175000 / 3));
  });

  it("mensalidade conta em todo mês ativo, do início ao fim (inclusive)", async () => {
    await sub("Ana", 9900, `${m0}-15`, `${m1}-05`); // encerrada em m1
    await sub("Bia", 15000, `${m1}-01`); // segue ativa
    const s = await financeSummary(3);
    expect(s.months.map((m) => m.recurringRevenue)).toEqual([9900, 9900 + 15000, 15000]);
  });

  it("MRR e clientes ativos olham só o que está ativo agora (e não repetem o mesmo cliente)", async () => {
    await sub("Ana", 9900, `${m0}-01`);
    await sub("ana", 5000, `${m1}-01`); // mesmo cliente com outro nome em minúsculas
    await sub("Encerrada", 7000, `${m0}-01`, `${m1}-10`);
    await sub("Termina hoje", 3000, `${m1}-01`, today); // encerra hoje: já não conta
    await sub("Termina amanhã", 2000, `${m1}-01`, "9999-12-31");
    const s = await financeSummary(3);
    expect(s.mrr).toBe(9900 + 5000 + 2000);
    expect(s.activeClients).toBe(2); // "Ana"/"ana" contam como um só + "Termina amanhã"
  });

  it("custos únicos caem no mês da data; mensais valem de início a fim", async () => {
    await cost("unico", 20000, `${m1}-12`);
    await cost("mensal", 4590, `${m0}-01`);
    await cost("mensal", 1000, `${m1}-01`, `${m1}-28`); // só em m1
    const s = await financeSummary(3);
    expect(s.months.map((m) => m.costsManual)).toEqual([4590, 20000 + 4590 + 1000, 4590]);
  });

  it("só passa a contar custo da API do Google depois das 1.000 grátis do mês", async () => {
    await setSetting("custo_requisicao", "20"); // R$ 0,20
    await run("INSERT INTO api_usage (month, used) VALUES (?, ?)", [m0, 900]);
    await run("INSERT INTO api_usage (month, used) VALUES (?, ?)", [m1, 1000]);
    await run("INSERT INTO api_usage (month, used) VALUES (?, ?)", [m2, 1100]);
    const s = await financeSummary(3);
    expect(s.months.map((m) => m.costsApi)).toEqual([0, 0, 100 * 20]);
    expect(s.months[2].costs).toBe(2000);
  });

  it("lucro, margem, ticket e custo por cliente", async () => {
    await sale("A", 100000, `${m2}-05`);
    await sale("B", 50000, `${m2}-06`);
    await cost("unico", 30000, `${m2}-07`);
    const s = await financeSummary(1);
    expect(s).toMatchObject({ revenue: 150000, costs: 30000, profit: 120000, salesCount: 2, avgTicket: 75000, costPerClient: 15000 });
    expect(s.margin).toBeCloseTo(0.8);
  });

  it("lucro pode ficar negativo", async () => {
    await cost("unico", 50000, `${m2}-07`);
    const s = await financeSummary(1);
    expect(s.profit).toBe(-50000);
    expect(s.margin).toBeNull(); // sem receita
  });

  it("periodTotals soma só os meses recebidos", async () => {
    await sale("A", 100000, `${m0}-05`);
    await sale("B", 40000, `${m2}-05`);
    const s = await financeSummary(3);
    expect(periodTotals(s.months.slice(-1)).revenue).toBe(40000);
    expect(periodTotals(s.months).revenue).toBe(140000);
  });
});

describe("vendas, mensalidades e custos (ações)", () => {
  const sale_ = (v: Record<string, string>) => addSaleAction(undefined, form(v));

  it("registra venda simples", async () => {
    expect(await sale_({ client_name: "Ana", service: "Site", amount: "1.500,00", sold_at: `${m2}-03` })).toEqual({ ok: true });
    const [s] = await rows<{ client_name: string; amount: number; sold_at: string }>("SELECT * FROM sales");
    expect(s).toMatchObject({ client_name: "Ana", amount: 150000, sold_at: `${m2}-03` });
    expect(await rows("SELECT * FROM subscriptions")).toHaveLength(0);
  });

  it("venda com mensalidade cria as duas coisas", async () => {
    await sale_({ client_name: "Ana", service: "Site", amount: "1000", monthly: "99" });
    expect(await rows("SELECT * FROM sales")).toHaveLength(1);
    const [m] = await rows<{ amount: number; start_date: string }>("SELECT * FROM subscriptions");
    expect(m.amount).toBe(9900);
    expect(m.start_date).toBe(today);
  });

  it("só mensalidade (sem valor de projeto) também vale", async () => {
    await sale_({ client_name: "Ana", service: "Manutenção", monthly: "120" });
    expect(await rows("SELECT * FROM sales")).toHaveLength(0);
    expect(await rows("SELECT * FROM subscriptions")).toHaveLength(1);
  });

  it("venda ligada a um lead fecha o lead e registra no histórico", async () => {
    const leadId = await makeLead({ name: "Padaria", status: "proposta" });
    await sale_({ lead_id: String(leadId), service: "Site", amount: "800" });
    const l = (await getLead(leadId))!;
    expect(l.status).toBe("fechado");
    expect(l.closed_at).toBeTruthy();
    expect((await rows<{ client_name: string }>("SELECT client_name FROM sales"))[0].client_name).toBe("Padaria");
    expect((await getInteractions(leadId)).some((h) => h.type === "venda" && h.content.includes("800"))).toBe(true);
  });

  it("valida os campos", async () => {
    expect(await sale_({ client_name: "", service: "Site", amount: "100" })).toMatchObject({ error: expect.stringContaining("cliente") });
    expect(await sale_({ client_name: "A", service: "", amount: "100" })).toMatchObject({ error: expect.stringContaining("serviço") });
    expect(await sale_({ client_name: "A", service: "S", amount: "0" })).toMatchObject({ error: expect.stringContaining("valor") });
    expect(await sale_({ client_name: "A", service: "S", amount: "-50" })).toMatchObject({ error: expect.stringContaining("valor") });
    expect(await rows("SELECT * FROM sales")).toHaveLength(0);
  });

  it("data inválida vira hoje; texto longo é cortado", async () => {
    await sale_({ client_name: "N".repeat(500), service: "S", amount: "10", sold_at: "ontem" });
    const [s] = await rows<{ client_name: string; sold_at: string }>("SELECT * FROM sales");
    expect(s.sold_at).toBe(today);
    expect(s.client_name).toHaveLength(300);
  });

  it("edita e apaga venda", async () => {
    await sale_({ client_name: "Ana", service: "Site", amount: "100" });
    const [{ id }] = await rows<{ id: number }>("SELECT id FROM sales");
    expect(await updateSaleAction(undefined, form({ id: String(id), client_name: "Ana Maria", service: "Loja", amount: "2.250,50", sold_at: `${m1}-09` }))).toEqual({ ok: true });
    const [s] = await rows<{ client_name: string; service: string; amount: number; sold_at: string }>("SELECT * FROM sales");
    expect(s).toMatchObject({ client_name: "Ana Maria", service: "Loja", amount: 225050, sold_at: `${m1}-09` });
    expect(await updateSaleAction(undefined, form({ id: String(id), client_name: "X", service: "Y", amount: "0" }))).toMatchObject({ error: expect.any(String) });
    await deleteSaleAction(form({ id: String(id) }));
    expect(await rows("SELECT * FROM sales")).toHaveLength(0);
  });

  it("mensalidade: cria, valida, edita, encerra e apaga", async () => {
    expect(await addSubscriptionAction(undefined, form({ client_name: "", amount: "99" }))).toMatchObject({ error: expect.any(String) });
    expect(await addSubscriptionAction(undefined, form({ client_name: "Ana", amount: "0" }))).toMatchObject({ error: expect.any(String) });
    expect(await addSubscriptionAction(undefined, form({ client_name: "Ana", amount: "99", plan: "Hospedagem", start_date: `${m1}-01` }))).toEqual({ ok: true });
    const [{ id }] = await rows<{ id: number }>("SELECT id FROM subscriptions");

    expect(await updateSubscriptionAction(undefined, form({ id: String(id), client_name: "Ana", plan: "Plano", amount: "120", start_date: `${m1}-10`, end_date: `${m1}-01` }))).toMatchObject({ error: expect.stringContaining("fim") });
    expect(await updateSubscriptionAction(undefined, form({ id: String(id), client_name: "Ana", plan: "Plano", amount: "120", start_date: `${m1}-10`, end_date: "" }))).toEqual({ ok: true });
    expect((await rows<{ amount: number; end_date: string | null }>("SELECT * FROM subscriptions"))[0]).toMatchObject({ amount: 12000, end_date: null });

    await endSubscriptionAction(form({ id: String(id) }));
    expect((await rows<{ end_date: string }>("SELECT end_date FROM subscriptions"))[0].end_date).toBe(today);
    expect((await financeSummary(1)).mrr).toBe(0); // encerrada hoje: já não é recorrente

    await deleteSubscriptionAction(form({ id: String(id) }));
    expect(await rows("SELECT * FROM subscriptions")).toHaveLength(0);
  });

  it("custo: cria, valida, edita (único limpa o fim), encerra e apaga", async () => {
    expect(await addCostAction(undefined, form({ description: "", amount: "10", category: "outros" }))).toMatchObject({ error: expect.any(String) });
    expect(await addCostAction(undefined, form({ description: "X", amount: "0", category: "outros" }))).toMatchObject({ error: expect.any(String) });
    expect(await addCostAction(undefined, form({ description: "X", amount: "10", category: "inventada" }))).toMatchObject({ error: expect.any(String) });
    expect(await addCostAction(undefined, form({ description: "Hospedagem", amount: "45,90", category: "hospedagem", kind: "mensal", start_date: `${m0}-01` }))).toEqual({ ok: true });
    const [{ id }] = await rows<{ id: number }>("SELECT id FROM costs");

    expect(await updateCostAction(undefined, form({ id: String(id), description: "Host", category: "hospedagem", amount: "50", kind: "mensal", start_date: `${m0}-05`, end_date: `${m0}-01` }))).toMatchObject({ error: expect.stringContaining("fim") });
    expect(await updateCostAction(undefined, form({ id: String(id), description: "Host", category: "inventada", amount: "50", kind: "mensal", start_date: `${m0}-05` }))).toMatchObject({ error: expect.any(String) });
    expect(await updateCostAction(undefined, form({ id: String(id), description: "Host", category: "hospedagem", amount: "50", kind: "mensal", start_date: `${m0}-05`, end_date: `${m1}-20` }))).toEqual({ ok: true });
    expect((await rows<{ amount: number; end_date: string }>("SELECT * FROM costs"))[0]).toMatchObject({ amount: 5000, end_date: `${m1}-20` });

    // virar "uma vez só" apaga o fim
    await updateCostAction(undefined, form({ id: String(id), description: "Host", category: "hospedagem", amount: "50", kind: "unico", start_date: `${m0}-05`, end_date: `${m1}-20` }));
    expect((await rows<{ kind: string; end_date: string | null }>("SELECT * FROM costs"))[0]).toMatchObject({ kind: "unico", end_date: null });

    await endCostAction(form({ id: String(id) }));
    await deleteCostAction(form({ id: String(id) }));
    expect(await rows("SELECT * FROM costs")).toHaveLength(0);
  });

  it("exigem login", async () => {
    resetRequest();
    expect(await redirectOf(() => sale_({ client_name: "A", service: "S", amount: "10" }))).toBe("/login");
    expect(await redirectOf(() => deleteSaleAction(form({ id: "1" })))).toBe("/login");
    expect(await redirectOf(() => updateCostAction(undefined, form({ id: "1" })))).toBe("/login");
  });
});

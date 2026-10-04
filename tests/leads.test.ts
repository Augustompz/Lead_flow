import { beforeEach, describe, expect, it } from "vitest";
import {
  addManualLeadAction,
  bulkLeadsAction,
  changeStatusAction,
  deleteDemoLeadsAction,
  deleteLeadAction,
  doNotContactAction,
  saveLeadAction,
  undoDoNotContactAction,
  whatsappClickedAction,
  removeBlockEntryAction,
} from "@/app/actions/leads";
import { blockLead, listBlocklist, loadBlocklist, removeBlockEntry, unblockLead } from "@/lib/blocklist";
import { rows, run } from "@/lib/db";
import { todayBR } from "@/lib/format";
import { distinctValues, filtersFromParams, LEAD_GROUPS, PAGE_SIZE, queryLeads } from "@/lib/lead-query";
import { getInteractions, getLead, setLeadStatus } from "@/lib/leads";
import { form, loginAs, makeLead, makeUser, redirectOf, resetAll } from "./helpers";

beforeEach(async () => {
  await resetAll();
  await loginAs(await makeUser());
});

const iso = (d: string) => `${d}T12:00:00.000Z`;
const day = (offset: number) => {
  const d = new Date(`${todayBR()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

describe("setLeadStatus (etapas do funil)", () => {
  it("avançar carimba cada etapa que faltava, e só até a escolhida", async () => {
    const id = await makeLead();
    await setLeadStatus(id, "respondeu");
    const l = (await getLead(id))!;
    expect(l.status).toBe("respondeu");
    expect(l.contacted_at).toBeTruthy();
    expect(l.responded_at).toBeTruthy();
    expect(l.proposal_at).toBeNull();
    expect(l.closed_at).toBeNull();
  });

  it("pular direto para 'fechado' preenche todas as etapas", async () => {
    const id = await makeLead();
    await setLeadStatus(id, "fechado");
    const l = (await getLead(id))!;
    expect([l.contacted_at, l.responded_at, l.proposal_at, l.closed_at].every(Boolean)).toBe(true);
  });

  it("voltar de etapa mantém o histórico de datas e limpa 'perdido'", async () => {
    const id = await makeLead();
    await setLeadStatus(id, "proposta");
    const before = (await getLead(id))!;
    await setLeadStatus(id, "contatado");
    const after = (await getLead(id))!;
    expect(after.status).toBe("contatado");
    expect(after.proposal_at).toBe(before.proposal_at);
  });

  it("'perdido' guarda data e motivo; sair de 'perdido' limpa os dois", async () => {
    const id = await makeLead();
    await setLeadStatus(id, "perdido", "  achou caro  ");
    let l = (await getLead(id))!;
    expect(l.lost_at).toBeTruthy();
    expect(l.lost_reason).toBe("achou caro");
    await setLeadStatus(id, "novo");
    l = (await getLead(id))!;
    expect(l.lost_at).toBeNull();
    expect(l.lost_reason).toBeNull();
  });

  it("registra no histórico e ignora quando a etapa não muda", async () => {
    const id = await makeLead();
    await setLeadStatus(id, "contatado");
    await setLeadStatus(id, "contatado");
    const hist = await getInteractions(id);
    expect(hist.filter((h) => h.type === "status")).toHaveLength(1);
    expect(hist[0].content).toContain("Novo → Chamado");
  });

  it("lead inexistente não dá erro", async () => {
    await expect(setLeadStatus(99999, "fechado")).resolves.toBeUndefined();
  });
});

describe("lista de 'não contatar'", () => {
  it("marca o lead, tira o retorno, vira Perdido e entra na lista", async () => {
    const id = await makeLead({ follow_up_at: day(1), place_id: "pl1", phone_digits: "5562911110000" });
    await blockLead(id, "pediu para parar");
    const l = (await getLead(id))!;
    expect(l.do_not_contact).toBe(1);
    expect(l.status).toBe("perdido");
    expect(l.follow_up_at).toBeNull();
    expect(l.lost_reason).toBe("pediu para parar");
    const bl = await loadBlocklist();
    expect(bl.places.has("pl1")).toBe(true);
    expect(bl.phones.has("5562911110000")).toBe(true);
    expect((await listBlocklist())[0].reason).toBe("pediu para parar");
  });

  it("sem motivo, usa o texto padrão", async () => {
    const id = await makeLead();
    await blockLead(id);
    expect((await listBlocklist())[0].reason).toBe("Pediu para não ser contatado");
  });

  it("cliente que já fechou continua 'Fechado', só fica bloqueado", async () => {
    const id = await makeLead({ status: "fechado" });
    await blockLead(id);
    const l = (await getLead(id))!;
    expect(l.status).toBe("fechado");
    expect(l.do_not_contact).toBe(1);
  });

  it("bloquear duas vezes não duplica a entrada", async () => {
    const id = await makeLead();
    await blockLead(id);
    await blockLead(id);
    expect(await listBlocklist()).toHaveLength(1);
  });

  it("apagar o lead NÃO tira a empresa da lista", async () => {
    const id = await makeLead({ place_id: "pl9", phone_digits: "5562900000009" });
    await blockLead(id);
    await run("DELETE FROM leads WHERE id = ?", [id]);
    const bl = await loadBlocklist();
    expect(bl.places.has("pl9")).toBe(true);
    expect(bl.phones.has("5562900000009")).toBe(true);
  });

  it("desfazer remove da lista e libera o lead (continua Perdido)", async () => {
    const id = await makeLead({ place_id: "pl2", phone_digits: "5562922220000" });
    await blockLead(id);
    await unblockLead(id);
    const l = (await getLead(id))!;
    expect(l.do_not_contact).toBe(0);
    expect(l.status).toBe("perdido");
    expect(await listBlocklist()).toHaveLength(0);
  });

  it("remover pela lista de Ajustes também libera o lead", async () => {
    const id = await makeLead({ place_id: "pl3", phone_digits: "5562933330000" });
    await blockLead(id);
    const [entry] = await listBlocklist();
    await removeBlockEntry(entry.id);
    expect((await getLead(id))!.do_not_contact).toBe(0);
    expect(await listBlocklist()).toHaveLength(0);
  });

  it("lead sem telefone e sem place_id não gera entrada que bloqueie todo mundo", async () => {
    const id = await makeLead({ place_id: null, phone_digits: null, phone: null });
    await blockLead(id);
    const bl = await loadBlocklist();
    expect(bl.places.size).toBe(0);
    expect(bl.phones.size).toBe(0);
  });
});

describe("ações de lead (com login)", () => {
  it("changeStatusAction muda a etapa e recusa etapa inválida", async () => {
    const id = await makeLead();
    expect(await changeStatusAction(id, "respondeu")).toEqual({ ok: true });
    expect((await getLead(id))!.status).toBe("respondeu");
    expect(await changeStatusAction(id, "banana")).toMatchObject({ ok: false });
    expect((await getLead(id))!.status).toBe("respondeu");
  });

  it("changeStatusAction recusa mudar etapa de quem está em 'não contatar'", async () => {
    const id = await makeLead();
    await blockLead(id);
    const r = await changeStatusAction(id, "novo");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("não contatar");
    expect((await getLead(id))!.status).toBe("perdido");
  });

  it("clicar no WhatsApp marca 'Chamado' e registra; em quem pediu para não ser contatado, nada acontece", async () => {
    const a = await makeLead();
    await whatsappClickedAction(a);
    expect((await getLead(a))!.status).toBe("contatado");
    expect((await getInteractions(a)).some((h) => h.type === "whatsapp")).toBe(true);

    const b = await makeLead();
    await blockLead(b);
    const before = (await getInteractions(b)).length;
    await whatsappClickedAction(b);
    expect((await getInteractions(b)).length).toBe(before);
  });

  it("clicar de novo no WhatsApp não regride a etapa", async () => {
    const id = await makeLead({ status: "proposta" });
    await whatsappClickedAction(id);
    expect((await getLead(id))!.status).toBe("proposta");
  });

  it("doNotContactAction e undoDoNotContactAction", async () => {
    const id = await makeLead();
    await doNotContactAction(form({ id: String(id), reason: "reclamou" }));
    expect((await getLead(id))!.do_not_contact).toBe(1);
    await undoDoNotContactAction(form({ id: String(id) }));
    expect((await getLead(id))!.do_not_contact).toBe(0);
  });

  it("removeBlockEntryAction", async () => {
    const id = await makeLead({ place_id: "pl7" });
    await blockLead(id);
    const [entry] = await listBlocklist();
    await removeBlockEntryAction(form({ id: String(entry.id) }));
    expect(await listBlocklist()).toHaveLength(0);
  });

  it("saveLeadAction guarda observações e retorno; data inválida vira vazio; texto longo é cortado", async () => {
    const id = await makeLead();
    await saveLeadAction(form({ id: String(id), notes: "ligar à tarde", follow_up_at: "2026-12-01" }));
    let l = (await getLead(id))!;
    expect(l.notes).toBe("ligar à tarde");
    expect(l.follow_up_at).toBe("2026-12-01");
    await saveLeadAction(form({ id: String(id), notes: "x".repeat(9000), follow_up_at: "amanhã" }));
    l = (await getLead(id))!;
    expect(l.follow_up_at).toBeNull();
    expect(l.notes).toHaveLength(5000);
  });

  it("deleteLeadAction apaga o lead e o histórico e volta para a lista", async () => {
    const id = await makeLead();
    await setLeadStatus(id, "contatado");
    expect(await redirectOf(() => deleteLeadAction(form({ id: String(id) })))).toBe("/leads");
    expect(await getLead(id)).toBeNull();
    expect(await rows("SELECT * FROM interactions WHERE lead_id = ?", [id])).toHaveLength(0);
  });

  it("deleteDemoLeadsAction só apaga o que é demonstração", async () => {
    const demo = await makeLead({ source: "demo" });
    const real = await makeLead({ source: "google_maps" });
    await deleteDemoLeadsAction();
    expect(await getLead(demo)).toBeNull();
    expect(await getLead(real)).not.toBeNull();
  });

  it("exigem login", async () => {
    const { resetRequest } = await import("./helpers");
    resetRequest();
    expect(await redirectOf(() => changeStatusAction(1, "novo"))).toBe("/login");
    expect(await redirectOf(() => bulkLeadsAction(form({ ids: "1", op: "delete" })))).toBe("/login");
    expect(await redirectOf(() => deleteLeadAction(form({ id: "1" })))).toBe("/login");
  });
});

describe("ações em lote", () => {
  it("move vários leads de etapa", async () => {
    const ids = [await makeLead(), await makeLead(), await makeLead()];
    await bulkLeadsAction(form({ ids: ids.map(String).slice(0, 2), op: "status:contatado" }));
    expect((await getLead(ids[0]))!.status).toBe("contatado");
    expect((await getLead(ids[1]))!.status).toBe("contatado");
    expect((await getLead(ids[2]))!.status).toBe("novo");
  });

  it("pula quem está em 'não contatar'", async () => {
    const ok = await makeLead();
    const blocked = await makeLead();
    await blockLead(blocked);
    await bulkLeadsAction(form({ ids: [String(ok), String(blocked)], op: "status:respondeu" }));
    expect((await getLead(ok))!.status).toBe("respondeu");
    expect((await getLead(blocked))!.status).toBe("perdido");
  });

  it("marca vários como 'não contatar'", async () => {
    const ids = [await makeLead(), await makeLead()];
    await bulkLeadsAction(form({ ids: ids.map(String), op: "dnc" }));
    expect((await listBlocklist()).length).toBe(2);
    expect((await getLead(ids[0]))!.do_not_contact).toBe(1);
  });

  it("exclui vários e o histórico deles, e a lista de não contatar continua", async () => {
    const a = await makeLead({ place_id: "bk1" });
    const b = await makeLead();
    const keep = await makeLead();
    await blockLead(a);
    await setLeadStatus(b, "contatado");
    await bulkLeadsAction(form({ ids: [String(a), String(b)], op: "delete" }));
    expect(await getLead(a)).toBeNull();
    expect(await getLead(b)).toBeNull();
    expect(await getLead(keep)).not.toBeNull();
    expect(await rows("SELECT * FROM interactions WHERE lead_id IN (?, ?)", [a, b])).toHaveLength(0);
    expect((await loadBlocklist()).places.has("bk1")).toBe(true);
  });

  it("ignora ids repetidos, inválidos, e operação desconhecida", async () => {
    const id = await makeLead();
    await bulkLeadsAction(form({ ids: [String(id), String(id), "abc", "-4", "1.5"], op: "status:contatado" }));
    expect((await getInteractions(id)).filter((h) => h.type === "status")).toHaveLength(1);
    const other = await makeLead();
    await bulkLeadsAction(form({ ids: String(other), op: "apagar-tudo" }));
    await bulkLeadsAction(form({ ids: String(other), op: "status:banana" }));
    expect((await getLead(other))!.status).toBe("novo");
  });

  it("sem nenhum lead marcado não faz nada nem dá erro", async () => {
    await expect(bulkLeadsAction(form({ op: "delete" }))).resolves.toBeUndefined();
  });
});

describe("cadastro manual", () => {
  const add = (v: Record<string, string>) => addManualLeadAction(undefined, form(v));

  it("cadastra com telefone, calcula a nota e registra a origem", async () => {
    expect(await add({ name: "Padaria do Zé", phone: "(62) 98888-7777", niche: "padaria", city: "Goiânia", instagram: "@padariadoze" })).toEqual({ ok: true });
    const [l] = await rows<{ id: number; score: number; source: string; phone_digits: string; site_status: string; notes: string }>("SELECT * FROM leads");
    expect(l.source).toBe("manual");
    expect(l.phone_digits).toBe("5562988887777");
    expect(l.site_status).toBe("none");
    expect(l.score).toBe(60); // sem site (40) + celular (20)
    expect(l.notes).toContain("instagram.com/padariadoze");
    expect((await getInteractions(l.id))[0].content).toBe("Cadastrado manualmente");
  });

  it("site sem http ganha https e é classificado", async () => {
    await add({ name: "Loja", website: "minhaloja.com.br" });
    await add({ name: "Perfil", website: "instagram.com/perfil" });
    const r = await rows<{ website: string; site_status: string }>("SELECT website, site_status FROM leads ORDER BY id");
    expect(r[0]).toEqual({ website: "https://minhaloja.com.br", site_status: "own" });
    expect(r[1].site_status).toBe("social");
  });

  it("valida nome e telefone", async () => {
    expect(await add({ name: "" })).toMatchObject({ error: "Informe o nome da empresa." });
    expect(await add({ name: "X", phone: "123" })).toMatchObject({ error: expect.stringContaining("Telefone inválido") });
  });

  it("recusa telefone repetido e telefone na lista de não contatar", async () => {
    await add({ name: "A", phone: "(62) 98888-7777" });
    expect(await add({ name: "B", phone: "62988887777" })).toMatchObject({ error: expect.stringContaining("Já existe") });
    const [{ id }] = await rows<{ id: number }>("SELECT id FROM leads");
    await blockLead(id);
    await run("DELETE FROM leads");
    expect(await add({ name: "C", phone: "(62) 98888-7777" })).toMatchObject({ error: expect.stringContaining("não contatar") });
  });
});

describe("queryLeads (filtros da tela de leads)", () => {
  async function seed() {
    await makeLead({ name: "Alfa Odonto", niche: "dentista", city: "Goiânia", score: 90, site_status: "none", status: "novo" });
    await makeLead({ name: "Beta Barber", niche: "barbearia", city: "Goiânia", score: 60, site_status: "social", status: "contatado" });
    await makeLead({ name: "Gama Pet", niche: "pet shop", city: "Anápolis", score: 30, site_status: "own", status: "fechado" });
    await makeLead({ name: "Delta Perdida", niche: "dentista", city: "Anápolis", score: 70, status: "perdido" });
  }
  const names = async (f: Parameters<typeof queryLeads>[0]) => (await queryLeads(f)).leads.map((l) => l.name);

  it("ordena por maior chance por padrão", async () => {
    await seed();
    expect(await names({})).toEqual(["Alfa Odonto", "Delta Perdida", "Beta Barber", "Gama Pet"]);
  });

  it("filtros simples", async () => {
    await seed();
    expect(await names({ status: "contatado" })).toEqual(["Beta Barber"]);
    expect(await names({ site: "own" })).toEqual(["Gama Pet"]);
    expect(await names({ city: "Anápolis" })).toEqual(["Delta Perdida", "Gama Pet"]);
    expect(await names({ niche: "dentista" })).toEqual(["Alfa Odonto", "Delta Perdida"]);
  });

  it("faixas de chance", async () => {
    await seed();
    expect(await names({ tier: "quente" })).toEqual(["Alfa Odonto", "Delta Perdida"]); // 90 e 70
    expect(await names({ tier: "morno" })).toEqual(["Beta Barber"]); // 60
    expect(await names({ tier: "frio" })).toEqual(["Gama Pet"]); // 30
  });

  it("grupos de etapa", async () => {
    await seed();
    expect(LEAD_GROUPS.map((g) => g.key)).toEqual(["chamar", "conversa", "fechados", "perdidos"]);
    expect(await names({ group: "chamar" })).toEqual(["Alfa Odonto"]);
    expect(await names({ group: "conversa" })).toEqual(["Beta Barber"]);
    expect(await names({ group: "fechados" })).toEqual(["Gama Pet"]);
    expect(await names({ group: "perdidos" })).toEqual(["Delta Perdida"]);
    expect(await names({ group: "inexistente" })).toHaveLength(4);
  });

  it("busca por texto e é à prova de injeção de SQL", async () => {
    await seed();
    expect(await names({ q: "barber" })).toEqual(["Beta Barber"]);
    expect(await names({ q: "' OR 1=1 --" })).toEqual([]);
    expect(await names({ sort: "DROP TABLE leads" })).toHaveLength(4); // cai na ordem padrão
    expect((await queryLeads({})).total).toBe(4);
  });

  it("outras ordenações", async () => {
    await seed();
    expect(await names({ sort: "name" })).toEqual(["Alfa Odonto", "Beta Barber", "Delta Perdida", "Gama Pet"]);
    expect((await names({ sort: "recent" }))[0]).toBe("Delta Perdida");
  });

  it("retorno de hoje ou atrasado (e só quem ainda está em andamento)", async () => {
    await makeLead({ name: "Atrasado", follow_up_at: day(-2) });
    await makeLead({ name: "Hoje", follow_up_at: day(0) });
    await makeLead({ name: "Amanhã", follow_up_at: day(1) });
    await makeLead({ name: "Fechado com retorno", follow_up_at: day(-1), status: "fechado" });
    await makeLead({ name: "Perdido com retorno", follow_up_at: day(-1), status: "perdido" });
    await makeLead({ name: "Sem retorno" });
    const r = (await queryLeads({ due: "1", sort: "followup" })).leads.map((l) => l.name);
    expect(r).toEqual(["Atrasado", "Hoje"]);
  });

  it("paginação", async () => {
    for (let i = 0; i < PAGE_SIZE + 5; i++) await makeLead({ score: 50 });
    const p1 = await queryLeads({ page: 1 });
    const p2 = await queryLeads({ page: 2 });
    expect(p1.total).toBe(PAGE_SIZE + 5);
    expect(p1.leads).toHaveLength(PAGE_SIZE);
    expect(p2.leads).toHaveLength(5);
    expect(new Set([...p1.leads, ...p2.leads].map((l) => l.id)).size).toBe(PAGE_SIZE + 5);
    expect((await queryLeads({}, { all: true })).leads).toHaveLength(PAGE_SIZE + 5);
  });

  it("valores distintos de cidade e tipo", async () => {
    await seed();
    expect(await distinctValues("city")).toEqual(["Anápolis", "Goiânia"]);
    expect(await distinctValues("niche")).toEqual(["barbearia", "dentista", "pet shop"]);
  });
});

describe("filtersFromParams", () => {
  it("limita a página a um inteiro entre 1 e 100000", () => {
    const p = (page: string) => filtersFromParams({ page }).page;
    expect(p("3")).toBe(3);
    expect(p("-5")).toBe(1);
    expect(p("0")).toBe(1);
    expect(p("1.7")).toBe(1);
    expect(p("abc")).toBe(1);
    expect(p("Infinity")).toBe(100000);
    expect(p("99999999999")).toBe(100000);
  });

  it("aceita lista (usa o primeiro) e ignora vazios", () => {
    expect(filtersFromParams({ status: ["novo", "fechado"] }).status).toBe("novo");
    expect(filtersFromParams({ q: "   " }).q).toBeUndefined();
    expect(filtersFromParams({}).sort).toBeUndefined();
  });
});

describe("datas auxiliares dos testes", () => {
  it("iso() devolve um instante válido", () => {
    expect(Number.isNaN(Date.parse(iso("2026-01-01")))).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchLeadsAction, type SearchState } from "@/app/actions/search";
import { blockLead } from "@/lib/blocklist";
import { rows, setSetting } from "@/lib/db";
import { getUsage } from "@/lib/usage";
import { form, loginAs, makeLead, makeUser, resetAll } from "./helpers";

type Place = Record<string, unknown>;
const place = (id: string, extra: Place = {}): Place => ({
  id,
  displayName: { text: `Empresa ${id}` },
  businessStatus: "OPERATIONAL",
  ...extra,
});

function mockGoogle(...pages: Array<{ status?: number; places?: Place[]; next?: string; error?: string }>) {
  let i = 0;
  const fn = vi.fn(async () => {
    const r = pages[Math.min(i++, pages.length - 1)];
    const status = r.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => ({ places: r.places ?? [], nextPageToken: r.next, error: r.error ? { message: r.error } : undefined }),
    };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const run = (v: Record<string, string> = {}) =>
  searchLeadsAction(undefined, form({ niche: "dentista", city: "Goiânia", max: "20", includeSocial: "on", ...v }));

beforeEach(async () => {
  await resetAll();
  await loginAs(await makeUser());
  process.env.GOOGLE_MAPS_API_KEY = "CHAVE-DE-TESTE";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.GOOGLE_MAPS_API_KEY = "";
});

const ok = (r: SearchState) => {
  expect(r?.ok).toBe(true);
  return r as Extract<SearchState, { ok: true }>;
};

describe("busca no Google (com resposta simulada)", () => {
  it("salva só quem vale: sem site e só rede social; ignora quem tem site", async () => {
    mockGoogle({
      places: [
        place("sem", { nationalPhoneNumber: "(62) 99999-0001", rating: 4.8, userRatingCount: 120 }),
        place("insta", { nationalPhoneNumber: "(62) 99999-0002", websiteUri: "https://instagram.com/x" }),
        place("site", { nationalPhoneNumber: "(62) 99999-0003", websiteUri: "https://empresa.com.br" }),
      ],
    });
    const r = ok(await run());
    expect(r).toMatchObject({ found: 3, added: 2, skipped: 1, duplicates: 0, blocked: 0, demo: false, requests: 1 });
    const leads = await rows<{ place_id: string; site_status: string; score: number; status: string; source: string; niche: string; city: string }>(
      "SELECT * FROM leads ORDER BY id",
    );
    expect(leads.map((l) => l.place_id)).toEqual(["sem", "insta"]);
    expect(leads[0]).toMatchObject({ site_status: "none", score: 100, status: "novo", source: "google_maps", niche: "dentista", city: "Goiânia" });
    expect(leads[1].site_status).toBe("social");
  });

  it("'só Instagram' e 'já têm site' respeitam as caixinhas", async () => {
    const places = [
      place("sem", { nationalPhoneNumber: "(62) 99999-0001" }),
      place("insta", { nationalPhoneNumber: "(62) 99999-0002", websiteUri: "https://instagram.com/x" }),
      place("site", { nationalPhoneNumber: "(62) 99999-0003", websiteUri: "https://empresa.com.br" }),
    ];
    mockGoogle({ places });
    // sem marcar "includeSocial" (a função run() sempre marca, então monta direto)
    const only = ok(await searchLeadsAction(undefined, form({ niche: "dentista", city: "Goiânia", max: "20" })));
    expect(only.added).toBe(1);
    await resetAll();
    await loginAs(await makeUser());
    mockGoogle({ places });
    const all = ok(await run({ includeOwn: "on" }));
    expect(all.added).toBe(3);
  });

  it("ignora repetidos (mesmo place_id ou mesmo telefone) e a lista de não contatar", async () => {
    await makeLead({ place_id: "ja-tenho", phone_digits: "5562999990001" });
    const blockedLead = await makeLead({ place_id: "bloq-place", phone_digits: "5562999990002" });
    await blockLead(blockedLead);
    const blockedByPhone = await makeLead({ place_id: "outro-id", phone_digits: "5562999990003" });
    await blockLead(blockedByPhone);
    // o lead bloqueado foi apagado, mas a empresa continua bloqueada
    await (await import("@/lib/db")).run("DELETE FROM leads");
    await makeLead({ place_id: "ja-tenho", phone_digits: "5562999990001" });

    mockGoogle({
      places: [
        place("novo", { nationalPhoneNumber: "(62) 99999-0010" }),
        place("ja-tenho", { nationalPhoneNumber: "(62) 99999-0001" }), // mesmo place_id
        place("outro-place", { nationalPhoneNumber: "(62) 99999-0001" }), // mesmo telefone
        place("bloq-place", { nationalPhoneNumber: "(62) 99999-0099" }), // place_id bloqueado
        place("qualquer", { nationalPhoneNumber: "(62) 99999-0003" }), // telefone bloqueado
      ],
    });
    const r = ok(await run());
    expect(r).toMatchObject({ found: 5, added: 1, duplicates: 2, blocked: 2 });
    const ids = (await rows<{ place_id: string }>("SELECT place_id FROM leads")).map((l) => l.place_id);
    expect(ids.sort()).toEqual(["ja-tenho", "novo"]);
  });

  it("repetidos dentro da própria resposta entram uma vez só", async () => {
    mockGoogle({
      places: [place("a", { nationalPhoneNumber: "(62) 99999-0001" }), place("a", { nationalPhoneNumber: "(62) 99999-0001" })],
    });
    expect(ok(await run()).added).toBe(1);
  });

  it("lead sem telefone entra com nota menor", async () => {
    mockGoogle({ places: [place("sem-tel")] });
    ok(await run());
    const [l] = await rows<{ score: number; phone: string | null }>("SELECT score, phone FROM leads");
    expect(l.phone).toBeNull();
    expect(l.score).toBe(40);
  });

  it("registra a busca, o histórico de cada lead e a cota usada", async () => {
    mockGoogle({ places: [place("a", { nationalPhoneNumber: "(62) 99999-0001" })] });
    const r = ok(await run());
    const [s] = await rows<{ niche: string; city: string; found: number; added: number; requests: number; source: string }>("SELECT * FROM searches");
    expect(s).toMatchObject({ niche: "dentista", city: "Goiânia", found: 1, added: 1, requests: 1, source: "google_maps" });
    const hist = await rows<{ type: string; content: string }>("SELECT * FROM interactions");
    expect(hist).toHaveLength(1);
    expect(hist[0].content).toContain("Google Maps");
    expect((await getUsage()).used).toBe(1);
    expect(r.searchId).toBeGreaterThan(0);
  });

  it("40 e 60 empresas usam 2 e 3 requisições; devolve as que não precisou", async () => {
    // pedimos 60 (3 reservas), mas o Google respondeu só 1 página
    mockGoogle({ places: [place("a", { nationalPhoneNumber: "(62) 99999-0001" })] });
    ok(await run({ max: "60" }));
    expect((await getUsage()).used).toBe(1);
  });

  it("vários resultados em várias páginas", async () => {
    mockGoogle(
      { places: [place("a", { nationalPhoneNumber: "(62) 99999-0001" })], next: "t" },
      { places: [place("b", { nationalPhoneNumber: "(62) 99999-0002" })] },
    );
    const r = ok(await run({ max: "40" }));
    expect(r).toMatchObject({ added: 2, requests: 2 });
    expect((await getUsage()).used).toBe(2);
  });
});

describe("trava do limite grátis", () => {
  it("com o limite esgotado, nem chama o Google", async () => {
    await setSetting("limite_requisicoes", "0");
    const fetchMock = mockGoogle({ places: [] });
    const r = await run();
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Limite do mês atingido") });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await getUsage()).used).toBe(0);
  });

  it("busca grande demais para o que resta é recusada sem gastar nada", async () => {
    await setSetting("limite_requisicoes", "2");
    const fetchMock = mockGoogle({ places: [] });
    const r = await run({ max: "60" });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("restam 2") });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await getUsage()).used).toBe(0);
  });

  it("erro do Google: mostra a mensagem e mantém contada a requisição que foi feita", async () => {
    mockGoogle({ status: 403, error: "API disabled" });
    const r = await run({ max: "60" });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Places API (New)") });
    expect((await getUsage()).used).toBe(1); // reservou 3, devolveu 2
    expect(await rows("SELECT * FROM leads")).toHaveLength(0);
  });

  it("esgota a cota aos poucos e depois bloqueia", async () => {
    await setSetting("limite_requisicoes", "2");
    mockGoogle({ places: [place("a", { nationalPhoneNumber: "(62) 99999-0001" })] });
    ok(await run());
    ok(await run());
    expect(await run()).toMatchObject({ ok: false });
  });
});

describe("validações e demonstração", () => {
  it("exige nicho e cidade", async () => {
    expect(await run({ niche: "a" })).toMatchObject({ ok: false, error: "Informe o nicho e a cidade." });
    expect(await run({ city: "" })).toMatchObject({ ok: false });
  });

  it("tamanho inválido vira 20", async () => {
    const fetchMock = mockGoogle({ places: [] });
    await run({ max: "9999" });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.pageSize).toBe(20);
  });

  it("sem chave do Google, roda em demonstração: leads marcados 'demo' e cota intacta", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = ok(await run({ max: "40" }));
    expect(r.demo).toBe(true);
    expect(r.added).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await getUsage()).used).toBe(0);
    const sources = await rows<{ source: string }>("SELECT DISTINCT source FROM leads");
    expect(sources).toEqual([{ source: "demo" }]);
  });

  it("limite de 8 buscas por minuto", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "";
    for (let i = 0; i < 8; i++) ok(await run());
    expect(await run()).toMatchObject({ ok: false, error: expect.stringContaining("Muitas ações") });
  });

  it("exige login", async () => {
    const { resetRequest } = await import("./helpers");
    resetRequest();
    await expect(run()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { demoSearch, GoogleSearchError, searchGoogle } from "@/lib/places";

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

/** Simula as respostas do Google, uma por chamada. */
function mockGoogle(responses: Array<{ status?: number; json: unknown } | "network-error">) {
  const calls: Call[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      const r = responses[Math.min(i++, responses.length - 1)];
      if (r === "network-error") throw new TypeError("fetch failed");
      const status = r.status ?? 200;
      return { ok: status < 400, status, json: async () => r.json };
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const place = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  displayName: { text: `Empresa ${id}` },
  businessStatus: "OPERATIONAL",
  ...extra,
});

describe("searchGoogle", () => {
  it("junta as páginas e converte os campos", async () => {
    const calls = mockGoogle([
      {
        json: {
          places: [
            place("a", {
              nationalPhoneNumber: "(62) 99999-0000",
              websiteUri: "https://a.com.br",
              rating: 4.5,
              userRatingCount: 10,
              formattedAddress: "Rua 1",
              googleMapsUri: "https://maps/a",
            }),
          ],
          nextPageToken: "tok",
        },
      },
      { json: { places: [place("b", { internationalPhoneNumber: "+55 62 98888-7777" })] } },
    ]);
    const r = await searchGoogle("KEY", "dentista em Goiânia", 60, 3);
    expect(r.requests).toBe(2);
    expect(r.places.map((p) => p.placeId)).toEqual(["a", "b"]);
    expect(r.places[0]).toMatchObject({
      name: "Empresa a",
      phone: "(62) 99999-0000",
      website: "https://a.com.br",
      rating: 4.5,
      reviews: 10,
      address: "Rua 1",
      mapsUrl: "https://maps/a",
    });
    expect(r.places[1].phone).toBe("+55 62 98888-7777");
    expect(calls[1].body.pageToken).toBe("tok");
  });

  it("manda a chave no cabeçalho (nunca na URL) e pede os campos certos", async () => {
    const calls = mockGoogle([{ json: { places: [] } }]);
    await searchGoogle("MINHA-CHAVE", "x em y", 20, 1);
    expect(calls[0].url).not.toContain("MINHA-CHAVE");
    expect(calls[0].headers["X-Goog-Api-Key"]).toBe("MINHA-CHAVE");
    expect(calls[0].headers["X-Goog-FieldMask"]).toContain("places.websiteUri");
    expect(calls[0].headers["X-Goog-FieldMask"]).toContain("nextPageToken");
    expect(calls[0].body).toMatchObject({ textQuery: "x em y", languageCode: "pt-BR", regionCode: "BR", pageSize: 20 });
  });

  it("descarta empresas fechadas", async () => {
    mockGoogle([{ json: { places: [place("a"), place("c", { businessStatus: "CLOSED_PERMANENTLY" })] } }]);
    const r = await searchGoogle("K", "q", 20, 1);
    expect(r.places.map((p) => p.placeId)).toEqual(["a"]);
  });

  it("respeita o teto de requisições", async () => {
    const calls = mockGoogle([{ json: { places: [place("x")], nextPageToken: "t" } }]);
    const r = await searchGoogle("K", "q", 60, 1);
    expect(r.requests).toBe(1);
    expect(calls).toHaveLength(1);
    const r2 = await searchGoogle("K", "q", 60, 2);
    expect(r2.requests).toBe(2);
  });

  it("corta no máximo de resultados pedido", async () => {
    mockGoogle([{ json: { places: [place("1"), place("2"), place("3")] } }]);
    const r = await searchGoogle("K", "q", 2, 1);
    expect(r.places).toHaveLength(2);
  });

  it("erro 403 na primeira página lança com a contagem e mensagem útil", async () => {
    mockGoogle([{ status: 403, json: { error: { message: "API disabled" } } }]);
    const err = await searchGoogle("K", "q", 20, 1).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleSearchError);
    expect(err.requests).toBe(1);
    expect(err.message).toContain("Places API (New)");
    expect(err.message).toContain("API disabled");
  });

  it("chave inválida e limite de requisições têm mensagens próprias", async () => {
    mockGoogle([{ status: 400, json: { error: { message: "API key not valid" } } }]);
    expect((await searchGoogle("K", "q", 20, 1).catch((e) => e)).message).toContain("chave do Google é inválida");
    mockGoogle([{ status: 429, json: {} }]);
    expect((await searchGoogle("K", "q", 20, 1).catch((e) => e)).message).toContain("Limite de buscas");
  });

  it("falha de rede conta como 1 requisição enviada", async () => {
    mockGoogle(["network-error"]);
    const err = await searchGoogle("K", "q", 20, 3).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleSearchError);
    expect(err.requests).toBe(1);
  });

  it("erro na segunda página devolve o que já veio, sem lançar", async () => {
    mockGoogle([{ json: { places: [place("p1")], nextPageToken: "t" } }, { status: 429, json: {} }]);
    const r = await searchGoogle("K", "q", 60, 3);
    expect(r.places.map((p) => p.placeId)).toEqual(["p1"]);
    expect(r.requests).toBe(2);
  });

  it("token da próxima página que ainda não valeu: espera e tenta de novo", async () => {
    vi.useFakeTimers();
    const calls = mockGoogle([
      { json: { places: [place("a")], nextPageToken: "t" } },
      { status: 400, json: { error: { message: "token not ready" } } },
      { json: { places: [place("b")] } },
    ]);
    const promise = searchGoogle("K", "q", 60, 3);
    await vi.advanceTimersByTimeAsync(2500);
    const r = await promise;
    expect(r.places.map((p) => p.placeId)).toEqual(["a", "b"]);
    expect(r.requests).toBe(3);
    expect(calls).toHaveLength(3);
  });

  it("sem orçamento para tentar de novo, não repete", async () => {
    const calls = mockGoogle([
      { json: { places: [place("a")], nextPageToken: "t" } },
      { status: 400, json: {} },
    ]);
    const r = await searchGoogle("K", "q", 60, 2);
    expect(r.requests).toBe(2);
    expect(calls).toHaveLength(2);
  });
});

describe("demoSearch", () => {
  it("gera a quantidade pedida, sem requisições ao Google", () => {
    const r = demoSearch("barbearia", "Goiânia", 40);
    expect(r.places).toHaveLength(40);
    expect(r.requests).toBe(0);
    expect(new Set(r.places.map((p) => p.placeId)).size).toBe(40);
    expect(r.places.every((p) => p.name.startsWith("Barbearia"))).toBe(true);
    expect(r.places.every((p) => p.address?.endsWith("Goiânia"))).toBe(true);
  });

  it("mistura empresas sem site, com Instagram e com site próprio", () => {
    const sites = demoSearch("x", "y", 60).places.map((p) => p.website);
    expect(sites.some((s) => s === null)).toBe(true);
    expect(sites.some((s) => s?.includes("instagram.com"))).toBe(true);
    expect(sites.some((s) => s?.endsWith(".com.br"))).toBe(true);
  });
});

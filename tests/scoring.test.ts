import { describe, expect, it } from "vitest";
import { buildMessage, classifySite, leadScore, parsePhone, scoreTier, whatsappUrl } from "@/lib/scoring";

describe("classifySite", () => {
  it("sem endereço = sem site", () => {
    expect(classifySite(null)).toBe("none");
    expect(classifySite(undefined)).toBe("none");
    expect(classifySite("")).toBe("none");
  });

  it("redes sociais e links de bio não são site próprio", () => {
    for (const url of [
      "https://www.instagram.com/padaria",
      "https://instagram.com/x",
      "https://m.facebook.com/x",
      "https://linktr.ee/clinica",
      "https://wa.me/5562999990000",
      "https://www.ifood.com.br/delivery/x",
      "https://minhaloja.business.site",
    ]) {
      expect(classifySite(url), url).toBe("social");
    }
  });

  it("site de verdade é 'own'", () => {
    expect(classifySite("https://www.minhaclinica.com.br/")).toBe("own");
    expect(classifySite("minhaclinica.com.br")).toBe("own");
  });

  it("domínio parecido com rede social NÃO é rede social", () => {
    expect(classifySite("https://notinstagram.com")).toBe("own");
    expect(classifySite("https://wix.com")).toBe("own"); // não termina em ".x.com"
    expect(classifySite("https://meufacebook.com.br")).toBe("own");
  });

  it("endereço quebrado cai em 'sem site' sem lançar erro", () => {
    expect(classifySite("http://")).toBe("none");
  });
});

describe("parsePhone", () => {
  it("celular com DDD", () => {
    expect(parsePhone("(62) 99999-1234")).toEqual({ display: "(62) 99999-1234", digits: "5562999991234", isMobile: true });
  });

  it("fixo com +55", () => {
    expect(parsePhone("+55 62 3222-1234")).toEqual({ display: "(62) 3222-1234", digits: "556232221234", isMobile: false });
  });

  it("DDD 55 não é confundido com o código do país", () => {
    expect(parsePhone("(55) 99999-1234")?.digits).toBe("5555999991234");
    expect(parsePhone("+55 55 99999-1234")?.digits).toBe("5555999991234");
  });

  it("zero na frente do DDD é removido", () => {
    expect(parsePhone("062 99999-1234")?.digits).toBe("5562999991234");
  });

  it("números de serviço (0800, 0300...) e lixo são recusados", () => {
    expect(parsePhone("0800 123 4567")).toBeNull();
    expect(parsePhone("0300 313 0000")).toBeNull();
    expect(parsePhone("1234")).toBeNull();
    expect(parsePhone("")).toBeNull();
    expect(parsePhone(null)).toBeNull();
    expect(parsePhone(undefined)).toBeNull();
  });

  it("11 dígitos sem o 9 do celular é fixo", () => {
    expect(parsePhone("(11) 4004-1234")?.isMobile).toBe(false);
  });
});

describe("leadScore e scoreTier", () => {
  it("máximo é 100 e mínimo é 0", () => {
    expect(leadScore({ siteStatus: "none", isMobile: true, hasPhone: true, rating: 4.8, reviews: 150 })).toBe(100);
    expect(leadScore({ siteStatus: "own", isMobile: false, hasPhone: false, rating: null, reviews: null })).toBe(0);
  });

  it("pesos de cada critério", () => {
    const base = { isMobile: false, hasPhone: false, rating: null, reviews: null } as const;
    expect(leadScore({ ...base, siteStatus: "none" })).toBe(40);
    expect(leadScore({ ...base, siteStatus: "social" })).toBe(30);
    expect(leadScore({ ...base, siteStatus: "own", hasPhone: true })).toBe(8); // fixo
    expect(leadScore({ ...base, siteStatus: "own", hasPhone: true, isMobile: true })).toBe(20);
  });

  it("faixas de avaliações e de nota", () => {
    const s = (reviews: number | null, rating: number | null) =>
      leadScore({ siteStatus: "own", isMobile: false, hasPhone: false, rating, reviews });
    expect(s(2, null)).toBe(0);
    expect(s(3, null)).toBe(4);
    expect(s(10, null)).toBe(8);
    expect(s(30, null)).toBe(14);
    expect(s(100, null)).toBe(20);
    expect(s(null, 3.4)).toBe(0);
    expect(s(null, 3.5)).toBe(7);
    expect(s(null, 4.0)).toBe(14);
    expect(s(null, 4.5)).toBe(20);
  });

  it("limites das faixas quente / morno / frio", () => {
    expect(scoreTier(70)).toBe("quente");
    expect(scoreTier(69)).toBe("morno");
    expect(scoreTier(45)).toBe("morno");
    expect(scoreTier(44)).toBe("frio");
    expect(scoreTier(0)).toBe("frio");
  });
});

describe("mensagem e link do WhatsApp", () => {
  it("troca as variáveis", () => {
    const msg = buildMessage("Oi {nome}! Faço sites para {nicho} em {cidade}.", {
      name: "Clínica Sorriso",
      niche: "dentista",
      city: "Goiânia",
    });
    expect(msg).toBe("Oi Clínica Sorriso! Faço sites para dentista em Goiânia.");
  });

  it("troca todas as ocorrências e aceita campos vazios", () => {
    const msg = buildMessage("{nome} {nome} {nicho}{cidade}", { name: "A", niche: null, city: null });
    expect(msg).toBe("A A empresas como a sua");
  });

  it("monta o link com a mensagem codificada", () => {
    const url = whatsappUrl("5562999990000", "Olá & tudo bem?");
    expect(url).toBe("https://wa.me/5562999990000?text=Ol%C3%A1%20%26%20tudo%20bem%3F");
  });
});

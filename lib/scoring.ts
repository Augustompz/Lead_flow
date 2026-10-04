export type SiteStatus = "none" | "social" | "own";

// Links que o Google mostra como "site", mas que não são um site próprio.
const NOT_OWN_SITE = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "linktr.ee",
  "linktree.com",
  "beacons.ai",
  "bio.site",
  "taplink.cc",
  "campsite.bio",
  "wa.me",
  "whatsapp.com",
  "api.whatsapp.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "linkedin.com",
  "ifood.com.br",
  "rappi.com.br",
  "goomer.app",
  "menudino.com",
  "booksy.com",
  "doctoralia.com.br",
  "google.com",
  "goo.gl",
  "business.site", // sites gratuitos antigos do Google Meu Negócio
];

export function classifySite(website: string | null | undefined): SiteStatus {
  if (!website) return "none";
  let host = "";
  try {
    host = new URL(website.startsWith("http") ? website : `https://${website}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "none";
  }
  const isNotOwn = NOT_OWN_SITE.some((d) => host === d || host.endsWith(`.${d}`));
  return isNotOwn ? "social" : "own";
}

export type Phone = { display: string; digits: string; isMobile: boolean };

/** Normaliza telefone brasileiro para o formato do wa.me (55 + DDD + número). */
export function parsePhone(raw: string | null | undefined): Phone | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  // 0800, 0300, 0500 e 0900 são números de serviço (não recebem WhatsApp nem são da empresa).
  if (/^0(800|300|500|900)/.test(digits)) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  digits = digits.replace(/^0+/, "");
  if (digits.length !== 10 && digits.length !== 11) return null;
  const isMobile = digits.length === 11 && digits[2] === "9";
  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);
  const split = number.length === 9 ? 5 : 4;
  const display = `(${ddd}) ${number.slice(0, split)}-${number.slice(split)}`;
  return { display, digits: `55${digits}`, isMobile };
}

export type ScoreInput = {
  siteStatus: SiteStatus;
  isMobile: boolean;
  hasPhone: boolean;
  rating: number | null;
  reviews: number | null;
};

/**
 * Nota de 0 a 100 da chance de virar cliente:
 * 40 sem site · 20 telefone (celular conta mais) · 20 avaliações · 20 nota.
 * Empresa conhecida e bem avaliada tem mais motivo e mais caixa para investir em um site.
 */
export function leadScore(i: ScoreInput): number {
  const site = i.siteStatus === "none" ? 40 : i.siteStatus === "social" ? 30 : 0;
  const phone = i.isMobile ? 20 : i.hasPhone ? 8 : 0;
  const r = i.reviews ?? 0;
  const reviews = r >= 100 ? 20 : r >= 30 ? 14 : r >= 10 ? 8 : r >= 3 ? 4 : 0;
  const n = i.rating ?? 0;
  const rating = n >= 4.5 ? 20 : n >= 4.0 ? 14 : n >= 3.5 ? 7 : 0;
  return site + phone + reviews + rating;
}

export function scoreTier(score: number): "quente" | "morno" | "frio" {
  return score >= 70 ? "quente" : score >= 45 ? "morno" : "frio";
}

export function buildMessage(
  template: string,
  lead: { name: string; niche: string | null; city: string | null },
): string {
  return template
    .replaceAll("{nome}", lead.name)
    .replaceAll("{nicho}", lead.niche ?? "empresas como a sua")
    .replaceAll("{cidade}", lead.city ?? "");
}

export function whatsappUrl(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}

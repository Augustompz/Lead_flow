export type PlaceResult = {
  placeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  mapsUrl: string | null;
};

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
  "nextPageToken",
].join(",");

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(apiKey: string, body: Record<string, unknown>) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    places?: GooglePlace[];
    nextPageToken?: string;
    error?: { message?: string; status?: string };
  };
  return { ok: res.ok, status: res.status, json };
}

/** Erro da busca no Google. Leva a contagem de requisições já feitas, pois elas contam no limite. */
export class GoogleSearchError extends Error {
  requests: number;
  constructor(message: string, requests: number) {
    super(message);
    this.requests = requests;
  }
}

/**
 * Busca no Google Maps (Places API New - Text Search). Cada página traz até 20 empresas.
 * `maxRequests` é o teto de requisições (inclui tentativas repetidas): nunca passa dele.
 */
export async function searchGoogle(
  apiKey: string,
  textQuery: string,
  maxResults: number,
  maxRequests: number,
): Promise<{ places: PlaceResult[]; requests: number }> {
  const out: PlaceResult[] = [];
  let pageToken: string | undefined;
  let requests = 0;

  // Conta antes de enviar: se a conexão cair no meio, a requisição pode ter sido cobrada.
  const send = async (body: Record<string, unknown>) => {
    requests++;
    try {
      return await fetchPage(apiKey, body);
    } catch {
      throw new GoogleSearchError("Não consegui falar com o Google. Verifique a internet e tente de novo.", requests);
    }
  };

  while (out.length < maxResults && requests < maxRequests) {
    const body: Record<string, unknown> = {
      textQuery,
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: 20,
      ...(pageToken ? { pageToken } : {}),
    };

    let r = await send(body);
    if (!r.ok && pageToken && r.status === 400 && requests < maxRequests) {
      // O token da próxima página pode demorar um instante para ficar válido.
      await sleep(2000);
      r = await send(body);
    }
    if (!r.ok) {
      // Na primeira página o erro é do usuário resolver (chave, API desativada...).
      // Nas seguintes, ficamos com o que já veio.
      if (!pageToken) throw new GoogleSearchError(googleErrorMessage(r.status, r.json.error?.message), requests);
      break;
    }

    for (const p of r.json.places ?? []) {
      if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
      out.push({
        placeId: p.id,
        name: p.displayName?.text ?? "Sem nome",
        address: p.formattedAddress ?? null,
        phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
        website: p.websiteUri ?? null,
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? null,
        mapsUrl: p.googleMapsUri ?? null,
      });
    }

    pageToken = r.json.nextPageToken;
    if (!pageToken) break;
  }

  return { places: out.slice(0, maxResults), requests };
}

function googleErrorMessage(status: number, message?: string): string {
  if (status === 400 && message?.toLowerCase().includes("api key")) {
    return "A chave do Google é inválida. Confira GOOGLE_MAPS_API_KEY.";
  }
  if (status === 403) {
    return (
      "O Google recusou a chave (403). Verifique se a \"Places API (New)\" está ativada no projeto, " +
      "se o faturamento está ligado e se a chave não tem restrição que bloqueie este servidor." +
      (message ? ` Detalhe: ${message}` : "")
    );
  }
  if (status === 429) return "Limite de buscas do Google atingido. Tente novamente em alguns minutos.";
  return `Erro do Google (${status})${message ? `: ${message}` : ""}`;
}

// ---------------------------------------------------------------------------
// Modo demonstração: dados fictícios para testar o sistema sem chave do Google.
// ---------------------------------------------------------------------------

const PREFIXES = ["Studio", "Espaço", "Centro", "Casa", "Grupo", "Instituto", "Clínica", "Oficina", "Empório", "Atelier"];
const SUFFIXES = ["Premium", "Vida", "Prime", "Central", "Bella", "Nova Era", "Express", "do Bairro", "Excelência", "Plus"];
const STREETS = ["Av. Brasil", "Rua das Flores", "Av. Paulista", "Rua 7 de Setembro", "Rua Goiás", "Av. Central", "Rua XV de Novembro"];
const DDDS = ["11", "21", "31", "41", "51", "61", "62", "71", "81", "85"];

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[rand(0, arr.length - 1)];

export function demoSearch(niche: string, city: string, maxResults: number): { places: PlaceResult[]; requests: number } {
  const places: PlaceResult[] = [];
  const stamp = Date.now().toString(36);
  const base = niche.charAt(0).toUpperCase() + niche.slice(1);
  for (let i = 0; i < maxResults; i++) {
    const ddd = pick(DDDS);
    const mobile = Math.random() < 0.7;
    const phone = mobile
      ? `(${ddd}) 9${rand(1000, 9999)}-${rand(1000, 9999)}`
      : `(${ddd}) ${rand(3000, 3999)}-${rand(1000, 9999)}`;
    const roll = Math.random();
    const slug = `demo${stamp}${i}`;
    const website =
      roll < 0.45 ? null : roll < 0.7 ? `https://www.instagram.com/${slug}` : `https://www.${slug}.com.br`;
    const reviews = rand(0, 1) ? rand(0, 40) : rand(40, 400);
    places.push({
      placeId: `demo_${stamp}_${i}`,
      name: `${base} ${pick(SUFFIXES)} ${pick(PREFIXES)} ${i + 1}`,
      address: `${pick(STREETS)}, ${rand(10, 1500)} - ${city}`,
      phone,
      website,
      rating: reviews === 0 ? null : Math.round((3 + Math.random() * 2) * 10) / 10,
      reviews: reviews === 0 ? null : reviews,
      mapsUrl: null,
    });
  }
  return { places, requests: 0 };
}

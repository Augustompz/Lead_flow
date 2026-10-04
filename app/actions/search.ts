"use server";

import { revalidatePath } from "next/cache";
import { guardAction, RateLimitError } from "@/lib/ratelimit";
import { loadBlocklist } from "@/lib/blocklist";
import { db, getSettings, rows, run } from "@/lib/db";
import { nowISO } from "@/lib/format";
import { RESULTS_PER_REQUEST } from "@/lib/constants";
import { demoSearch, GoogleSearchError, searchGoogle, type PlaceResult } from "@/lib/places";
import { classifySite, leadScore, parsePhone } from "@/lib/scoring";
import { getUsage, limitMessage, releaseRequests, reserveRequests, usageMonth } from "@/lib/usage";

export type SearchState =
  | {
      ok: true;
      searchId: number;
      demo: boolean;
      found: number;
      added: number;
      duplicates: number;
      skipped: number;
      blocked: number;
      requests: number;
      niche: string;
      city: string;
    }
  | { ok: false; error: string }
  | undefined;

export async function searchLeadsAction(_prev: SearchState, formData: FormData): Promise<SearchState> {
  // Busca é a ação mais cara (chama o Google): no máximo 8 por minuto por usuário.
  try {
    await guardAction("busca", 8, 60);
  } catch (e) {
    // Só o limite de uso vira mensagem. O redirecionamento para o login (sessão vencida) precisa seguir adiante.
    if (e instanceof RateLimitError) return { ok: false, error: e.message };
    throw e;
  }

  const niche = String(formData.get("niche") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const max = [20, 40, 60].includes(Number(formData.get("max"))) ? Number(formData.get("max")) : 20;
  const includeSocial = formData.get("includeSocial") === "on";
  const includeOwn = formData.get("includeOwn") === "on";

  if (niche.length < 2 || city.length < 2) return { ok: false, error: "Informe o nicho e a cidade." };

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const demo = !apiKey;

  // Trava do limite grátis: reserva as requisições ANTES de chamar o Google.
  // Se não couber no que resta do mês, a busca nem sai daqui.
  const pages = Math.ceil(max / RESULTS_PER_REQUEST);
  const month = usageMonth();
  if (!demo) {
    const { limite_requisicoes: limit } = await getSettings();
    if (!(await reserveRequests(pages, limit))) {
      const usage = await getUsage();
      return { ok: false, error: limitMessage(pages, usage) };
    }
  }

  let places: PlaceResult[];
  let requests: number;
  try {
    const r = demo ? demoSearch(niche, city, max) : await searchGoogle(apiKey, `${niche} em ${city}`, max, pages);
    places = r.places;
    requests = r.requests;
  } catch (e) {
    // Devolve só o que sabemos que não foi enviado; requisições feitas continuam contando.
    if (!demo && e instanceof GoogleSearchError) await releaseRequests(pages - e.requests, month);
    revalidatePath("/", "layout");
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao buscar no Google." };
  }
  if (!demo) await releaseRequests(pages - requests, month);

  // Leads que já estão na base (mesmo place_id ou mesmo telefone).
  const existing = await rows<{ place_id: string | null; phone_digits: string | null }>(
    "SELECT place_id, phone_digits FROM leads",
  );
  const knownPlaces = new Set(existing.map((e) => e.place_id).filter(Boolean));
  const knownPhones = new Set(existing.map((e) => e.phone_digits).filter(Boolean));

  const now = nowISO();
  const source = demo ? "demo" : "google_maps";
  const searchRow = await run(
    "INSERT INTO searches (niche, city, source, found, requests, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [niche, city, source, places.length, requests, now],
  );
  const searchId = Number(searchRow.lastInsertRowid);

  const blocked = await loadBlocklist();
  let blockedCount = 0;
  let duplicates = 0;
  let skipped = 0;
  const inserts: { sql: string; args: (string | number | null)[] }[] = [];

  for (const p of places) {
    const siteStatus = classifySite(p.website);
    if ((siteStatus === "own" && !includeOwn) || (siteStatus === "social" && !includeSocial)) {
      skipped++;
      continue;
    }
    const phone = parsePhone(p.phone);
    // Lista de "não contatar": vale mesmo que o lead antigo tenha sido apagado.
    if (blocked.places.has(p.placeId) || (phone && blocked.phones.has(phone.digits))) {
      blockedCount++;
      continue;
    }
    if (knownPlaces.has(p.placeId) || (phone && knownPhones.has(phone.digits))) {
      duplicates++;
      continue;
    }
    knownPlaces.add(p.placeId);
    if (phone) knownPhones.add(phone.digits);

    const score = leadScore({
      siteStatus,
      isMobile: phone?.isMobile ?? false,
      hasPhone: !!phone,
      rating: p.rating,
      reviews: p.reviews,
    });
    inserts.push({
      sql:
        "INSERT INTO leads (place_id, search_id, name, niche, city, address, phone, phone_digits, is_mobile, " +
        "website, site_status, rating, reviews, maps_url, source, score, status, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo', ?, ?)",
      args: [
        p.placeId,
        searchId,
        p.name,
        niche,
        city,
        p.address,
        phone?.display ?? p.phone,
        phone?.digits ?? null,
        phone?.isMobile ? 1 : 0,
        p.website,
        siteStatus,
        p.rating,
        p.reviews,
        p.mapsUrl,
        source,
        score,
        now,
        now,
      ],
    });
  }

  const c = await db();
  try {
    if (inserts.length) await c.batch(inserts, "write");
  } catch {
    await run("DELETE FROM searches WHERE id = ?", [searchId]);
    return { ok: false, error: "Erro ao salvar os leads. Tente de novo." };
  }

  const label = demo ? "busca de demonstração" : "Google Maps";
  await run(
    "INSERT INTO interactions (lead_id, type, content, created_at) " +
      "SELECT id, 'captado', ?, ? FROM leads WHERE search_id = ?",
    [`Captado via ${label}: "${niche} em ${city}"`, now, searchId],
  );
  await run("UPDATE searches SET added = ?, duplicates = ?, skipped = ? WHERE id = ?", [
    inserts.length,
    duplicates,
    skipped,
    searchId,
  ]);

  revalidatePath("/", "layout");
  return {
    ok: true,
    searchId,
    demo,
    found: places.length,
    added: inserts.length,
    duplicates,
    skipped,
    blocked: blockedCount,
    requests,
    niche,
    city,
  };
}

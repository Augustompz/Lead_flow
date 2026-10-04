import bcrypt from "bcryptjs";
import { db, run } from "@/lib/db";
import { nowISO } from "@/lib/format";

/** Estado compartilhado entre os testes e as simulações do Next (cookies e cabeçalhos da "requisição"). */
export const state = {
  cookies: new Map<string, string>(),
  cookieOptions: new Map<string, Record<string, unknown>>(),
  headers: new Headers(),
};

export function resetRequest() {
  state.cookies.clear();
  state.cookieOptions.clear();
  state.headers = new Headers();
}

const TABLES = [
  "interactions",
  "leads",
  "searches",
  "sales",
  "subscriptions",
  "costs",
  "blocklist",
  "error_log",
  "api_usage",
  "rate_limits",
  "login_attempts",
  "settings",
  "users",
];

/** Esvazia o banco (mantém as tabelas) e limpa cookies/cabeçalhos. */
export async function resetAll() {
  await db();
  for (const t of TABLES) await run(`DELETE FROM ${t}`);
  resetRequest();
}

export const PASSWORD = "senha-de-teste-123";

export async function makeUser(over: Partial<{ email: string; name: string; password: string }> = {}) {
  const res = await run("INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)", [
    over.email ?? "admin@teste.com",
    over.name ?? "Admin Teste",
    await bcrypt.hash(over.password ?? PASSWORD, 4),
    nowISO(),
  ]);
  return Number(res.lastInsertRowid);
}

let seq = 0;

export type LeadSeed = Partial<{
  place_id: string | null;
  name: string;
  niche: string;
  city: string;
  phone: string | null;
  phone_digits: string | null;
  is_mobile: number;
  site_status: string;
  score: number;
  status: string;
  source: string;
  follow_up_at: string | null;
  do_not_contact: number;
  rating: number | null;
  reviews: number | null;
  created_at: string;
  search_id: number | null;
}>;

export async function makeLead(over: LeadSeed = {}) {
  seq++;
  const now = over.created_at ?? nowISO();
  const phoneDigits = over.phone_digits === undefined ? `55629999${String(seq).padStart(5, "0")}` : over.phone_digits;
  const res = await run(
    "INSERT INTO leads (place_id, search_id, name, niche, city, phone, phone_digits, is_mobile, site_status, rating, reviews, " +
      "source, score, status, follow_up_at, do_not_contact, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      over.place_id === undefined ? `place_${seq}` : over.place_id,
      over.search_id ?? null,
      over.name ?? `Empresa ${seq}`,
      over.niche ?? "dentista",
      over.city ?? "Goiânia",
      over.phone === undefined ? "(62) 99999-0000" : over.phone,
      phoneDigits,
      over.is_mobile ?? 1,
      over.site_status ?? "none",
      over.rating === undefined ? 4.5 : over.rating,
      over.reviews === undefined ? 50 : over.reviews,
      over.source ?? "google_maps",
      over.score ?? 80,
      over.status ?? "novo",
      over.follow_up_at ?? null,
      over.do_not_contact ?? 0,
      now,
      now,
    ],
  );
  return Number(res.lastInsertRowid);
}

/** Entra como o usuário (grava o cookie de sessão como o sistema faz no login). */
export async function loginAs(userId: number) {
  const { one } = await import("@/lib/db");
  const { startSession } = await import("@/lib/auth");
  const u = await one<{ id: number; email: string; name: string; token_version: number }>(
    "SELECT id, email, name, token_version FROM users WHERE id = ?",
    [userId],
  );
  if (!u) throw new Error("usuário não existe");
  await startSession({ id: u.id, email: u.email, name: u.name, v: Number(u.token_version) });
}

export function form(values: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.append(k, v);
  }
  return fd;
}

/** Roda uma ação que termina em redirect() e devolve para onde ela mandou (ou null se não redirecionou). */
export async function redirectOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    const m = e instanceof Error ? e.message.match(/^NEXT_REDIRECT:(.*)$/) : null;
    if (m) return m[1];
    throw e;
  }
}

import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Simula quem já usava uma versão ANTIGA do sistema: o banco existe com tabelas sem as colunas novas.
 * Ao abrir a versão nova, tudo precisa ser atualizado sem perder nada.
 */
beforeAll(async () => {
  const legacy = createClient({ url: process.env.DATABASE_URL! });
  await legacy.executeMultiple(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id TEXT UNIQUE,
      search_id INTEGER,
      name TEXT NOT NULL,
      niche TEXT, city TEXT, address TEXT, phone TEXT, phone_digits TEXT,
      is_mobile INTEGER NOT NULL DEFAULT 0,
      website TEXT,
      site_status TEXT NOT NULL DEFAULT 'none',
      rating REAL, reviews INTEGER, maps_url TEXT,
      source TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'novo',
      notes TEXT, follow_up_at TEXT, lost_reason TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      contacted_at TEXT, responded_at TEXT, proposal_at TEXT, closed_at TEXT, lost_at TEXT
    );
  `);
  await legacy.execute({
    sql: "INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
    args: ["antigo@teste.com", "Antigo", await bcrypt.hash("senha-antiga-123", 4), "2026-01-01T00:00:00.000Z"],
  });
  await legacy.execute({
    sql: "INSERT INTO leads (name, source, score, status, created_at, updated_at) VALUES ('Lead Antigo', 'google_maps', 77, 'contatado', ?, ?)",
    args: ["2026-01-02T00:00:00.000Z", "2026-01-02T00:00:00.000Z"],
  });
  legacy.close();
});

describe("atualização de um banco antigo", () => {
  it("cria as tabelas novas e acrescenta as colunas que faltavam, sem perder dados", async () => {
    const { db, rows } = await import("@/lib/db");
    await db();

    const userCols = (await rows<{ name: string }>("PRAGMA table_info(users)")).map((c) => c.name);
    const leadCols = (await rows<{ name: string }>("PRAGMA table_info(leads)")).map((c) => c.name);
    expect(userCols).toContain("token_version");
    expect(leadCols).toContain("do_not_contact");

    const tables = (await rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((t) => t.name);
    for (const t of ["blocklist", "error_log", "rate_limits", "api_usage", "login_attempts", "settings", "searches", "interactions", "sales", "subscriptions", "costs"]) {
      expect(tables, t).toContain(t);
    }

    const [lead] = await rows<{ name: string; score: number; status: string; do_not_contact: number }>("SELECT * FROM leads");
    expect(lead).toMatchObject({ name: "Lead Antigo", score: 77, status: "contatado", do_not_contact: 0 });
    const [user] = await rows<{ email: string; token_version: number }>("SELECT * FROM users");
    expect(user).toMatchObject({ email: "antigo@teste.com", token_version: 0 });
  });

  it("rodar a atualização de novo não dá erro nem duplica nada", async () => {
    const { db, rows } = await import("@/lib/db");
    await db();
    (globalThis as { __lfReady?: unknown; __lfVersion?: number }).__lfVersion = -1; // força init() de novo
    await db();
    expect(await rows("SELECT * FROM leads")).toHaveLength(1);
  });

  it("o usuário antigo continua entrando com a senha de sempre", async () => {
    const { loginAction } = await import("@/app/actions/auth");
    const { form, redirectOf } = await import("./helpers");
    const to = await redirectOf(() => loginAction(undefined, form({ email: "antigo@teste.com", password: "senha-antiga-123" })));
    expect(to).toBe("/");
  });

  it("uma sessão criada ANTES do campo de versão existir (sem 'v') continua valendo", async () => {
    const { SignJWT } = await import("jose");
    const { SESSION_COOKIE } = await import("@/lib/session");
    const { getSession } = await import("@/lib/auth");
    const { state } = await import("./helpers");
    const old = await new SignJWT({ email: "antigo@teste.com", name: "Antigo" }) // sem "v"
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setExpirationTime("1d")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
    state.cookies.set(SESSION_COOKIE, old);
    expect((await getSession())?.email).toBe("antigo@teste.com");
  });
});

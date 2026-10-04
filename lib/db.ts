import { createClient, type Client, type InValue } from "@libsql/client";
import bcrypt from "bcryptjs";
import { SETTING_DEFAULTS } from "./constants";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  first_at TEXT NOT NULL
);

-- Contadores do limite de uso (rate limit): uma linha por chave, ex.: "login-ip:1.2.3.4".
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

-- Quem pediu para não ser contatado. Sobrevive à exclusão do lead: a empresa nunca mais é captada.
CREATE TABLE IF NOT EXISTS blocklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT,
  phone_digits TEXT,
  name TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_block_place ON blocklist(place_id);
CREATE INDEX IF NOT EXISTS idx_block_phone ON blocklist(phone_digits);

-- Erros do servidor, para você ver o que quebrou (Ajustes) e ser avisado por e-mail.
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  digest TEXT,
  path TEXT,
  kind TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Requisições feitas ao Google por mês (YYYY-MM). Base do bloqueio do limite grátis.
CREATE TABLE IF NOT EXISTS api_usage (
  month TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  niche TEXT NOT NULL,
  city TEXT NOT NULL,
  source TEXT NOT NULL,
  found INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT UNIQUE,
  search_id INTEGER,
  name TEXT NOT NULL,
  niche TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  phone_digits TEXT,
  is_mobile INTEGER NOT NULL DEFAULT 0,
  website TEXT,
  site_status TEXT NOT NULL DEFAULT 'none',
  rating REAL,
  reviews INTEGER,
  maps_url TEXT,
  source TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'novo',
  notes TEXT,
  follow_up_at TEXT,
  lost_reason TEXT,
  do_not_contact INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  contacted_at TEXT,
  responded_at TEXT,
  proposal_at TEXT,
  closed_at TEXT,
  lost_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_digits);

CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interactions_lead ON interactions(lead_id);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  client_name TEXT NOT NULL,
  service TEXT NOT NULL,
  amount INTEGER NOT NULL,
  sold_at TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  client_name TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  created_at TEXT NOT NULL
);
`;

// Aumente ao mudar o SCHEMA para o servidor de desenvolvimento recriar as tabelas sem reiniciar.
const SCHEMA_VERSION = 5;

type G = typeof globalThis & { __lfClient?: Client; __lfReady?: Promise<void>; __lfVersion?: number };
const g = globalThis as G;

function client(): Client {
  if (!g.__lfClient) {
    g.__lfClient = createClient({
      url: process.env.DATABASE_URL || "file:local.db",
      authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
    });
  }
  return g.__lfClient;
}

async function init(c: Client) {
  await c.executeMultiple(SCHEMA);

  const userCols = await c.execute("PRAGMA table_info(users)");
  if (!userCols.rows.some((r) => r.name === "token_version")) {
    await c.execute("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0");
  }

  // Bancos criados antes desta coluna existir.
  const cols = await c.execute("PRAGMA table_info(leads)");
  if (!cols.rows.some((r) => r.name === "do_not_contact")) {
    await c.execute("ALTER TABLE leads ADD COLUMN do_not_contact INTEGER NOT NULL DEFAULT 0");
  }

  const users = await c.execute("SELECT COUNT(*) AS n FROM users");
  if (Number(users.rows[0].n) === 0) {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      await c.execute({
        sql: "INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
        args: [
          email,
          process.env.ADMIN_NAME?.trim() || "Administrador",
          await bcrypt.hash(password, 10),
          new Date().toISOString(),
        ],
      });
    }
  }
}

/** Cliente do banco, com as tabelas já criadas. */
export async function db(): Promise<Client> {
  const c = client();
  if (!g.__lfReady || g.__lfVersion !== SCHEMA_VERSION) {
    g.__lfVersion = SCHEMA_VERSION;
    g.__lfReady = init(c).catch((e) => {
      g.__lfReady = undefined;
      throw e;
    });
  }
  await g.__lfReady;
  return c;
}

export async function rows<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T[]> {
  const c = await db();
  const r = await c.execute({ sql, args });
  return r.rows.map((row) => ({ ...row }) as T);
}

export async function one<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T | null> {
  return (await rows<T>(sql, args))[0] ?? null;
}

export async function run(sql: string, args: InValue[] = []) {
  const c = await db();
  return c.execute({ sql, args });
}

export type Settings = {
  msg_template: string;
  meta_mensal: number;
  custo_requisicao: number;
  limite_requisicoes: number;
};

export async function getSettings(): Promise<Settings> {
  const list = await rows<{ key: string; value: string }>("SELECT key, value FROM settings");
  const map: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of list) map[r.key] = r.value;
  const limit = Number(map.limite_requisicoes);
  return {
    msg_template: map.msg_template,
    meta_mensal: Number(map.meta_mensal) || 0,
    custo_requisicao: Number(map.custo_requisicao) || 0,
    // 0 é um valor válido (bloqueia tudo); só cai no padrão se não for número.
    limite_requisicoes: Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : Number(SETTING_DEFAULTS.limite_requisicoes),
  };
}

export async function setSetting(key: string, value: string) {
  await run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

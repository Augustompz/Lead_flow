import { rows } from "./db";
import { todayBR } from "./format";
import type { Lead } from "./leads";

export type LeadFilters = {
  q?: string;
  status?: string;
  site?: string;
  tier?: string;
  city?: string;
  niche?: string;
  search?: string;
  source?: string;
  /** "1": só quem tem retorno marcado para hoje ou antes (e ainda em andamento). */
  due?: string;
  group?: string;
  sort?: string;
  page?: number;
};

/** Grupos da tela de leads, em linguagem de quem está trabalhando: quem chamar, quem está conversando... */
export const LEAD_GROUPS = [
  { key: "chamar", label: "Para chamar", statuses: ["novo"] },
  { key: "conversa", label: "Em conversa", statuses: ["contatado", "respondeu", "proposta"] },
  { key: "fechados", label: "Fechados", statuses: ["fechado"] },
  { key: "perdidos", label: "Perdidos", statuses: ["perdido"] },
] as const;

export const PAGE_SIZE = 50;

const ORDER: Record<string, string> = {
  score: "score DESC, id DESC",
  recent: "id DESC",
  name: "name COLLATE NOCASE ASC",
  followup: "follow_up_at IS NULL, follow_up_at ASC, score DESC",
};

function where(f: LeadFilters) {
  const clauses: string[] = [];
  const args: (string | number)[] = [];
  if (f.q) {
    clauses.push("(name LIKE ? OR phone LIKE ? OR address LIKE ? OR notes LIKE ?)");
    const like = `%${f.q}%`;
    args.push(like, like, like, like);
  }
  if (f.status) {
    clauses.push("status = ?");
    args.push(f.status);
  }
  const group = LEAD_GROUPS.find((g) => g.key === f.group);
  if (group) {
    clauses.push(`status IN (${group.statuses.map(() => "?").join(",")})`);
    args.push(...group.statuses);
  }
  if (f.due === "1") {
    clauses.push("follow_up_at IS NOT NULL AND follow_up_at <= ? AND status NOT IN ('fechado','perdido')");
    args.push(todayBR());
  }
  if (f.site) {
    clauses.push("site_status = ?");
    args.push(f.site);
  }
  if (f.tier === "quente") clauses.push("score >= 70");
  if (f.tier === "morno") clauses.push("score >= 45 AND score < 70");
  if (f.tier === "frio") clauses.push("score < 45");
  if (f.city) {
    clauses.push("city = ?");
    args.push(f.city);
  }
  if (f.niche) {
    clauses.push("niche = ?");
    args.push(f.niche);
  }
  if (f.search) {
    clauses.push("search_id = ?");
    args.push(Number(f.search));
  }
  if (f.source) {
    clauses.push("source = ?");
    args.push(f.source);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", args };
}

export async function queryLeads(f: LeadFilters, opts: { all?: boolean } = {}) {
  const w = where(f);
  const order = ORDER[f.sort ?? "score"] ?? ORDER.score;
  const page = Math.max(1, f.page ?? 1);
  const limit = opts.all ? "" : ` LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`;
  const [list, count] = await Promise.all([
    rows<Lead>(`SELECT * FROM leads ${w.sql} ORDER BY ${order}${limit}`, w.args),
    rows<{ n: number }>(`SELECT COUNT(*) AS n FROM leads ${w.sql}`, w.args),
  ]);
  return { leads: list, total: Number(count[0]?.n ?? 0) };
}

export async function distinctValues(column: "city" | "niche"): Promise<string[]> {
  const r = await rows<{ v: string }>(
    `SELECT DISTINCT ${column} AS v FROM leads WHERE ${column} IS NOT NULL AND ${column} <> '' ORDER BY v COLLATE NOCASE`,
  );
  return r.map((x) => x.v);
}

/** Lê os filtros dos parâmetros da URL. */
export function filtersFromParams(p: Record<string, string | string[] | undefined>): LeadFilters {
  const s = (k: string) => {
    const v = p[k];
    const val = Array.isArray(v) ? v[0] : v;
    return val?.trim() || undefined;
  };
  return {
    q: s("q"),
    status: s("status"),
    site: s("site"),
    tier: s("tier"),
    city: s("city"),
    niche: s("niche"),
    search: s("search"),
    source: s("source"),
    due: s("due"),
    group: s("group"),
    sort: s("sort"),
    // Inteiro entre 1 e 100000: valores estranhos na URL (-5, Infinity, 1.5) não podem quebrar a consulta.
    page: Math.min(100_000, Math.max(1, Math.floor(Number(s("page"))) || 1)),
  };
}

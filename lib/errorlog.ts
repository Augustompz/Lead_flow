import { rows, run } from "./db";
import { nowISO } from "./format";
import { emailConfigured, sendEmail } from "./notify";
import { rateLimit } from "./ratelimit";

export type ErrorRow = { id: number; message: string; digest: string | null; path: string | null; kind: string | null; created_at: string };

/** Guarda o erro do servidor e, se o e-mail estiver ligado, avisa (no máximo 1 aviso a cada 10 minutos). */
export async function recordError(err: unknown, path: string, kind: string) {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  // Bloqueios do limite de uso são esperados e não são falha do sistema.
  if (message.startsWith("Muitas ")) return;
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : null;
  // Sem a parte depois de "?", para nunca guardar dados digitados na URL.
  const cleanPath = path.split("?")[0].slice(0, 200);

  await run("INSERT INTO error_log (message, digest, path, kind, created_at) VALUES (?, ?, ?, ?, ?)", [
    message,
    digest,
    cleanPath,
    kind,
    nowISO(),
  ]);
  await run("DELETE FROM error_log WHERE id NOT IN (SELECT id FROM error_log ORDER BY id DESC LIMIT 200)");

  if (emailConfigured() && (await rateLimit("erro-email", 1, 600)).ok) {
    await sendEmail(
      "LeadFlow: algo deu errado",
      `Aconteceu um erro no sistema.\n\nPágina: ${cleanPath}\nTipo: ${kind}\nMensagem: ${message}\n${digest ? `Código: ${digest}\n` : ""}\nVeja os últimos erros em Ajustes.`,
    );
  }
}

export async function recentErrors(limit = 10): Promise<ErrorRow[]> {
  return rows<ErrorRow>(`SELECT * FROM error_log ORDER BY id DESC LIMIT ${limit}`);
}

export async function errorCountLastDays(days = 7): Promise<number> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const r = await rows<{ n: number }>("SELECT COUNT(*) AS n FROM error_log WHERE created_at >= ?", [since]);
  return Number(r[0]?.n ?? 0);
}

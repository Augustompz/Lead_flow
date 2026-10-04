import { headers } from "next/headers";
import { requireSession } from "./auth";
import { run } from "./db";
import type { Session } from "./session";

/** Lançado quando alguém passa do limite de uso (para a tela poder mostrar a mensagem sem confundir com outros erros). */
export class RateLimitError extends Error {}

export type RateResult = { ok: boolean; retryAfter: number };

/**
 * Limite de uso por chave, guardado no banco (funciona em hospedagem sem memória compartilhada).
 * A contagem é feita numa única instrução, então requisições simultâneas não furam o limite.
 * Janela fixa: até `limit` usos a cada `windowSec` segundos.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateResult> {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const cutoff = now - windowMs;

  const res = await run(
    "INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) " +
      "ON CONFLICT(key) DO UPDATE SET " +
      "count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END, " +
      "window_start = CASE WHEN window_start <= ? THEN ? ELSE window_start END " +
      "RETURNING count, window_start",
    [key, now, cutoff, cutoff, now],
  );
  const row = res.rows[0];
  const count = Number(row?.count ?? 1);
  const start = Number(row?.window_start ?? now);

  // Faxina de vez em quando: chaves paradas há mais de um dia.
  if (Math.random() < 0.01) {
    await run("DELETE FROM rate_limits WHERE window_start < ?", [now - 24 * 3600 * 1000]).catch(() => {});
  }

  if (count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) };
  return { ok: true, retryAfter: 0 };
}

/** IP de quem chamou. Atrás da Vercel/Railway o x-forwarded-for é preenchido pela própria plataforma. */
export function ipFrom(h: Pick<Headers, "get">): string {
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip") || "local";
}

export async function clientIp(): Promise<string> {
  return ipFrom(await headers());
}

export function waitText(seconds: number): string {
  return seconds >= 90 ? `${Math.ceil(seconds / 60)} minutos` : `${seconds} segundos`;
}

/**
 * Entrada de toda Server Action que muda dados: exige login e limita o ritmo por usuário.
 * 120 ações por minuto é muito mais que o uso normal, mas barra script ou sessão roubada em loop.
 */
export async function guardAction(name = "acao", limit = 120, windowSec = 60): Promise<Session> {
  const session = await requireSession();
  const r = await rateLimit(`${name}:u${session.id}`, limit, windowSec);
  if (!r.ok) throw new RateLimitError(`Muitas ações em pouco tempo. Aguarde ${waitText(r.retryAfter)} e tente de novo.`);
  return session;
}

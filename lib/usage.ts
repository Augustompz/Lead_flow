import { getSettings, one, run } from "./db";
import { todayBR } from "./format";

export type Usage = {
  month: string;
  used: number;
  limit: number;
  remaining: number;
};

/** Mês corrente (YYYY-MM) no fuso de Brasília. */
export function usageMonth(): string {
  return todayBR().slice(0, 7);
}

export async function getUsage(): Promise<Usage> {
  const month = usageMonth();
  const [row, settings] = await Promise.all([
    one<{ used: number }>("SELECT used FROM api_usage WHERE month = ?", [month]),
    getSettings(),
  ]);
  const used = Number(row?.used ?? 0);
  const limit = settings.limite_requisicoes;
  return { month, used, limit, remaining: Math.max(0, limit - used) };
}

/** Texto mostrado quando a trava barra uma busca. */
export function limitMessage(needed: number, usage: Usage): string {
  if (usage.remaining >= 1) {
    return (
      `Esta busca precisa de ${needed} requisição(ões) e ainda restam ${usage.remaining} este mês ` +
      `(${usage.used} de ${usage.limit} usadas). Escolha menos empresas.`
    );
  }
  return (
    `Limite do mês atingido: ${usage.used} de ${usage.limit} requisições ao Google usadas. ` +
    "As buscas voltam no dia 1º. Para continuar antes, aumente o limite em Configurações " +
    "(acima de 1.000 por mês o Google cobra)."
  );
}

/**
 * Reserva `n` requisições ANTES de chamar o Google. A conta é feita pelo banco numa única
 * instrução, então duas buscas ao mesmo tempo nunca passam juntas do limite.
 * Devolve false (sem reservar nada) se estourar o limite do mês.
 */
export async function reserveRequests(n: number, limit: number): Promise<boolean> {
  const month = usageMonth();
  await run("INSERT INTO api_usage (month, used) VALUES (?, 0) ON CONFLICT(month) DO NOTHING", [month]);
  const res = await run("UPDATE api_usage SET used = used + ? WHERE month = ? AND used + ? <= ?", [
    n,
    month,
    n,
    limit,
  ]);
  return res.rowsAffected === 1;
}

/** Devolve o que foi reservado e não usado (a busca terminou com menos requisições). */
export async function releaseRequests(n: number, month = usageMonth()) {
  if (n <= 0) return;
  await run("UPDATE api_usage SET used = MAX(0, used - ?) WHERE month = ?", [n, month]);
}

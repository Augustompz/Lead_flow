import { beforeEach, describe, expect, it } from "vitest";
import { getSettings, setSetting } from "@/lib/db";
import { getUsage, limitMessage, releaseRequests, reserveRequests, usageMonth } from "@/lib/usage";
import { resetAll } from "./helpers";

beforeEach(resetAll);

describe("cota mensal de requisições ao Google", () => {
  it("começa zerada, com o limite padrão", async () => {
    const u = await getUsage();
    expect(u.used).toBe(0);
    expect(u.limit).toBe(950);
    expect(u.remaining).toBe(950);
    expect(u.month).toBe(usageMonth());
  });

  it("reserva enquanto cabe e recusa quando passaria do limite", async () => {
    expect(await reserveRequests(3, 5)).toBe(true);
    expect(await reserveRequests(2, 5)).toBe(true); // exatamente no limite
    expect(await reserveRequests(1, 5)).toBe(false);
    expect((await getUsage()).used).toBe(5);
  });

  it("uma reserva recusada não consome nada", async () => {
    await reserveRequests(4, 5);
    expect(await reserveRequests(3, 5)).toBe(false);
    expect((await getUsage()).used).toBe(4);
  });

  it("devolve o que não foi usado, sem ficar negativo", async () => {
    await reserveRequests(3, 10);
    await releaseRequests(2);
    expect((await getUsage()).used).toBe(1);
    await releaseRequests(50);
    expect((await getUsage()).used).toBe(0);
    await releaseRequests(0);
    await releaseRequests(-3);
    expect((await getUsage()).used).toBe(0);
  });

  it("reservas simultâneas NUNCA passam do limite", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => reserveRequests(3, 50)));
    const approved = results.filter(Boolean).length;
    expect(approved).toBe(16); // 16 x 3 = 48 <= 50
    expect((await getUsage()).used).toBe(48);
  });

  it("o limite vem das configurações e 0 bloqueia tudo", async () => {
    await setSetting("limite_requisicoes", "0");
    const u = await getUsage();
    expect(u.limit).toBe(0);
    expect(u.remaining).toBe(0);
    expect(await reserveRequests(1, u.limit)).toBe(false);
  });

  it("configuração inválida volta ao padrão", async () => {
    await setSetting("limite_requisicoes", "abc");
    expect((await getSettings()).limite_requisicoes).toBe(950);
    await setSetting("limite_requisicoes", "-4");
    expect((await getSettings()).limite_requisicoes).toBe(950);
  });
});

describe("limitMessage", () => {
  it("quando ainda sobra um pouco, sugere buscar menos", () => {
    const msg = limitMessage(3, { month: "2026-10", used: 948, limit: 950, remaining: 2 });
    expect(msg).toContain("precisa de 3");
    expect(msg).toContain("restam 2");
  });

  it("quando acabou, explica e diz quando volta", () => {
    const msg = limitMessage(1, { month: "2026-10", used: 950, limit: 950, remaining: 0 });
    expect(msg).toContain("Limite do mês atingido");
    expect(msg).toContain("dia 1º");
  });
});

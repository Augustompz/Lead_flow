import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardAction, ipFrom, rateLimit, waitText } from "@/lib/ratelimit";
import { loginAs, makeUser, resetAll } from "./helpers";

beforeEach(resetAll);
afterEach(() => vi.useRealTimers());

describe("rateLimit", () => {
  it("deixa passar até o limite e bloqueia o resto", async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit("k", 3, 60)).ok).toBe(true);
    const blocked = await rateLimit("k", 3, 60);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it("chaves diferentes não se misturam", async () => {
    await rateLimit("a", 1, 60);
    expect((await rateLimit("a", 1, 60)).ok).toBe(false);
    expect((await rateLimit("b", 1, 60)).ok).toBe(true);
  });

  it("libera de novo quando a janela termina", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
    await rateLimit("k", 1, 60);
    expect((await rateLimit("k", 1, 60)).ok).toBe(false);
    vi.setSystemTime(new Date("2026-10-04T12:00:59Z"));
    expect((await rateLimit("k", 1, 60)).ok).toBe(false);
    vi.setSystemTime(new Date("2026-10-04T12:01:01Z"));
    expect((await rateLimit("k", 1, 60)).ok).toBe(true);
  });

  it("chamadas simultâneas não furam o limite", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => rateLimit("race", 5, 60)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });

  it("retryAfter diminui conforme o tempo passa", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
    await rateLimit("k", 1, 600);
    vi.setSystemTime(new Date("2026-10-04T12:05:00Z"));
    const r = await rateLimit("k", 1, 600);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(290);
    expect(r.retryAfter).toBeLessThanOrEqual(300);
  });
});

describe("ipFrom", () => {
  it("usa o primeiro IP do x-forwarded-for", () => {
    expect(ipFrom(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });
  it("cai em x-real-ip e depois em 'local'", () => {
    expect(ipFrom(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(ipFrom(new Headers())).toBe("local");
  });
});

describe("waitText", () => {
  it("fala em segundos ou minutos", () => {
    expect(waitText(45)).toBe("45 segundos");
    expect(waitText(600)).toBe("10 minutos");
  });
});

describe("guardAction", () => {
  it("sem login, manda para a tela de entrada", async () => {
    await expect(guardAction()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("com login, devolve a sessão", async () => {
    const id = await makeUser();
    await loginAs(id);
    const s = await guardAction();
    expect(s.id).toBe(id);
    expect(s.email).toBe("admin@teste.com");
  });

  it("passando do limite, recusa com mensagem clara", async () => {
    await loginAs(await makeUser());
    for (let i = 0; i < 3; i++) await guardAction("x", 3, 60);
    await expect(guardAction("x", 3, 60)).rejects.toThrow(/Muitas ações em pouco tempo/);
  });

  it("o limite é por usuário", async () => {
    const a = await makeUser({ email: "a@teste.com" });
    const b = await makeUser({ email: "b@teste.com" });
    await loginAs(a);
    await guardAction("x", 1, 60);
    await expect(guardAction("x", 1, 60)).rejects.toThrow();
    await loginAs(b);
    await expect(guardAction("x", 1, 60)).resolves.toBeTruthy();
  });
});

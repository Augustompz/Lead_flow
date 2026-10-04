import { describe, expect, it } from "vitest";
import { brl, brlShort, fmtDate, lastMonths, monthLabel, parseBRL, pct, todayBR } from "@/lib/format";

describe("parseBRL (valor digitado -> centavos)", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["1500", 150000],
    ["1.500", 150000],
    ["R$ 99,9", 9990],
    ["R$ 500", 50000],
    ["0,5", 50],
    ["12.50", 1250],
    ["", 0],
    ["abc", 0],
  ])("%s -> %i", (input, cents) => {
    expect(parseBRL(input)).toBe(cents);
  });

  it("aceita null e undefined", () => {
    expect(parseBRL(null)).toBe(0);
    expect(parseBRL(undefined)).toBe(0);
  });

  it("valor negativo continua negativo (as telas recusam)", () => {
    expect(parseBRL("-50")).toBe(-5000);
  });
});

describe("formatação", () => {
  it("brl", () => {
    expect(brl(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(brl(0).replace(/\s/g, " ")).toBe("R$ 0,00");
  });

  it("brlShort", () => {
    expect(brlShort(100000)).toBe("1 mil");
    expect(brlShort(250000)).toBe("2,5 mil");
    expect(brlShort(5000000)).toBe("50 mil");
    expect(brlShort(50000)).toBe("500");
    expect(brlShort(150000000)).toBe("1,5 mi");
  });

  it("pct", () => {
    expect(pct(1, 4)).toBe("25%");
    expect(pct(0, 0)).toBe("0%");
    expect(pct(5, 0)).toBe("0%");
  });

  it("fmtDate", () => {
    expect(fmtDate("2026-10-04")).toBe("04/10/2026");
    expect(fmtDate("2026-10-04T12:00:00.000Z")).toBe("04/10/2026");
    expect(fmtDate(null)).toBe("—");
  });

  it("monthLabel", () => {
    expect(monthLabel("2026-10")).toBe("out/26");
    expect(monthLabel("2027-01")).toBe("jan/27");
  });

  it("todayBR tem o formato AAAA-MM-DD", () => {
    expect(todayBR()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("lastMonths", () => {
  it("termina no mês atual e atravessa o ano", () => {
    expect(lastMonths(3, "2026-01-15")).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(lastMonths(1, "2026-10-04")).toEqual(["2026-10"]);
    expect(lastMonths(12, "2026-10-04")).toHaveLength(12);
    expect(lastMonths(12, "2026-10-04")[0]).toBe("2025-11");
  });
});

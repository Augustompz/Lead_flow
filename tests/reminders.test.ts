import { beforeEach, describe, expect, it } from "vitest";
import { todayBR } from "@/lib/format";
import type { Lead } from "@/lib/leads";
import { getLead } from "@/lib/leads";
import { countDue, digestText, icsForLead, listDue } from "@/lib/reminders";
import { makeLead, resetAll } from "./helpers";

beforeEach(resetAll);

const day = (offset: number) => {
  const d = new Date(`${todayBR()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

describe("retornos de hoje e atrasados", () => {
  it("conta hoje e atrasados; ignora futuros, sem data, fechados, perdidos e 'não contatar'", async () => {
    await makeLead({ follow_up_at: day(-3) });
    await makeLead({ follow_up_at: day(0) });
    await makeLead({ follow_up_at: day(1) });
    await makeLead({ follow_up_at: null });
    await makeLead({ follow_up_at: day(-1), status: "fechado" });
    await makeLead({ follow_up_at: day(-1), status: "perdido" });
    await makeLead({ follow_up_at: day(-1), do_not_contact: 1 });
    expect(await countDue()).toBe(2);
    expect((await listDue()).map((l) => l.follow_up_at)).toEqual([day(-3), day(0)]);
  });

  it("zero quando não há nada", async () => {
    expect(await countDue()).toBe(0);
    expect(await listDue()).toEqual([]);
  });

  it("listDue respeita o limite", async () => {
    for (let i = 0; i < 5; i++) await makeLead({ follow_up_at: day(-1) });
    expect(await listDue(3)).toHaveLength(3);
  });
});

describe("resumo por e-mail", () => {
  const lead = (name: string, phone: string | null): Lead =>
    ({ id: 1, name, phone, follow_up_at: "2026-10-02" }) as unknown as Lead;

  it("fala no singular e no plural e leva o link", () => {
    const one = digestText([lead("Padaria", "(62) 99999-0000")], "https://app.exemplo.com");
    expect(one).toContain("1 empresa para retornar");
    expect(one).toContain("• Padaria · (62) 99999-0000 — retorno marcado para 02/10/2026");
    expect(one).toContain("https://app.exemplo.com");
    expect(digestText([lead("A", null), lead("B", null)], "x")).toContain("2 empresas para retornar");
  });

  it("lead sem telefone não deixa parênteses vazios", () => {
    expect(digestText([lead("Sem Tel", null)], "x")).toContain("• Sem Tel — retorno");
  });
});

describe("arquivo de calendário (.ics)", () => {
  async function leadWith(over: Parameters<typeof makeLead>[0]) {
    const id = await makeLead(over);
    return (await getLead(id))!;
  }

  it("é um evento de dia inteiro com alarme, com quebras de linha CRLF", async () => {
    const ics = icsForLead(await leadWith({ name: "Padaria", follow_up_at: "2026-10-15", phone: "(62) 99999-0000" }));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261015");
    expect(ics).toContain("DTEND;VALUE=DATE:20261016");
    expect(ics).toContain("SUMMARY:Falar com Padaria");
    expect(ics).toContain("Telefone: (62) 99999-0000");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).not.toMatch(/[^\r]\n/); // nenhuma quebra de linha sem \r
  });

  it("o fim do evento atravessa virada de mês e de ano", async () => {
    expect(icsForLead(await leadWith({ follow_up_at: "2026-10-31" }))).toContain("DTEND;VALUE=DATE:20261101");
    expect(icsForLead(await leadWith({ follow_up_at: "2026-12-31" }))).toContain("DTEND;VALUE=DATE:20270101");
    expect(icsForLead(await leadWith({ follow_up_at: "2028-02-28" }))).toContain("DTEND;VALUE=DATE:20280229"); // ano bissexto
  });

  it("escapa vírgula, ponto e vírgula, barra e quebras de linha do nome", async () => {
    const ics = icsForLead(await leadWith({ name: "Silva, Souza; & Cia \\ Ltda", follow_up_at: "2026-10-15" }));
    expect(ics).toContain("SUMMARY:Falar com Silva\\, Souza\\; & Cia \\\\ Ltda");
  });

  it("não deixa o nome injetar linhas novas no arquivo", async () => {
    const ics = icsForLead(await leadWith({ name: "Evil\r\nBEGIN:VEVENT", follow_up_at: "2026-10-15" }));
    expect(ics.split("\r\n").filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
  });
});

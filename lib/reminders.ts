import { rows } from "./db";
import { fmtDate, todayBR } from "./format";
import type { Lead } from "./leads";

const DUE_WHERE =
  "follow_up_at IS NOT NULL AND follow_up_at <= ? AND status NOT IN ('fechado','perdido') AND do_not_contact = 0";

/** Quantos retornos estão marcados para hoje ou atrasados (mostrado no menu). */
export async function countDue(): Promise<number> {
  const r = await rows<{ n: number }>(`SELECT COUNT(*) AS n FROM leads WHERE ${DUE_WHERE}`, [todayBR()]);
  return Number(r[0]?.n ?? 0);
}

export async function listDue(limit = 30): Promise<Lead[]> {
  return rows<Lead>(`SELECT * FROM leads WHERE ${DUE_WHERE} ORDER BY follow_up_at ASC LIMIT ${limit}`, [todayBR()]);
}

/** Texto do e-mail diário de retornos. */
export function digestText(leads: Lead[], appUrl: string): string {
  const lines = leads.map(
    (l) => `• ${l.name}${l.phone ? ` · ${l.phone}` : ""} — retorno marcado para ${fmtDate(l.follow_up_at)}`,
  );
  return (
    `Você tem ${leads.length} ${leads.length === 1 ? "empresa" : "empresas"} para retornar hoje:\n\n` +
    lines.join("\n") +
    `\n\nAbra o LeadFlow: ${appUrl}\n`
  );
}

/** Arquivo de calendário (.ics) de um dia inteiro, para o lembrete tocar no celular. */
export function icsForLead(lead: Lead): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");
  const day = (lead.follow_up_at ?? todayBR()).replaceAll("-", "");
  const next = new Date(`${lead.follow_up_at ?? todayBR()}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10).replaceAll("-", "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const desc = [lead.phone ? `Telefone: ${lead.phone}` : "", lead.notes ?? ""].filter(Boolean).join("\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LeadFlow//PT-BR//",
    "BEGIN:VEVENT",
    `UID:lead-${lead.id}-${day}@leadflow`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${esc(`Falar com ${lead.name}`)}`,
    `DESCRIPTION:${esc(desc)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Retorno de lead",
    "TRIGGER:PT9H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

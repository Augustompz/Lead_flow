"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guardAction } from "@/lib/ratelimit";
import { run } from "@/lib/db";
import { nowISO } from "@/lib/format";
import { blockLead, loadBlocklist, removeBlockEntry, unblockLead } from "@/lib/blocklist";
import { getLead, logInteraction, setLeadStatus } from "@/lib/leads";
import { classifySite, leadScore, parsePhone } from "@/lib/scoring";
import { STATUSES } from "@/lib/constants";

const refresh = () => revalidatePath("/", "layout");
const validStatus = (s: string) => STATUSES.some((x) => x.key === s);

export type StatusResult = { ok: boolean; message?: string };

export async function changeStatusAction(leadId: number, status: string, lostReason?: string): Promise<StatusResult> {
  await guardAction();
  if (!validStatus(status)) return { ok: false, message: "Etapa inválida." };
  // Quem pediu para não ser contatado só volta ao jogo depois de você desfazer o bloqueio.
  if ((await getLead(leadId))?.do_not_contact) {
    return { ok: false, message: "Está em “não contatar”. Abra o lead e remova da lista para mudar a etapa." };
  }
  await setLeadStatus(leadId, status, lostReason);
  refresh();
  return { ok: true };
}

/** Chamada quando o usuário clica no botão de WhatsApp: registra o contato e marca como contatado. */
export async function whatsappClickedAction(leadId: number) {
  await guardAction();
  const lead = await getLead(leadId);
  if (!lead || lead.do_not_contact) return;
  await logInteraction(leadId, "whatsapp", "Abriu conversa no WhatsApp com a mensagem padrão");
  if (lead.status === "novo") await setLeadStatus(leadId, "contatado");
  refresh();
}

export async function saveLeadAction(formData: FormData) {
  await guardAction();
  const id = Number(formData.get("id"));
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 5000);
  const followUp = String(formData.get("follow_up_at") ?? "").trim();
  await run("UPDATE leads SET notes = ?, follow_up_at = ?, updated_at = ? WHERE id = ?", [
    notes || null,
    /^\d{4}-\d{2}-\d{2}$/.test(followUp) ? followUp : null,
    nowISO(),
    id,
  ]);
  refresh();
}

export async function addNoteAction(formData: FormData) {
  await guardAction();
  const id = Number(formData.get("id"));
  const text = String(formData.get("text") ?? "").trim().slice(0, 2000);
  if (!text) return;
  await logInteraction(id, "nota", text);
  refresh();
}

export async function deleteLeadAction(formData: FormData) {
  await guardAction();
  const id = Number(formData.get("id"));
  await run("DELETE FROM interactions WHERE lead_id = ?", [id]);
  await run("DELETE FROM leads WHERE id = ?", [id]);
  refresh();
  redirect("/leads");
}

export async function doNotContactAction(formData: FormData) {
  await guardAction();
  await blockLead(Number(formData.get("id")), String(formData.get("reason") ?? ""));
  refresh();
}

export async function undoDoNotContactAction(formData: FormData) {
  await guardAction();
  await unblockLead(Number(formData.get("id")));
  refresh();
}

export async function removeBlockEntryAction(formData: FormData) {
  await guardAction();
  await removeBlockEntry(Number(formData.get("id")));
  refresh();
}

/** Ação em vários leads de uma vez (marcados na lista): mudar etapa, "não contatar" ou excluir. */
export async function bulkLeadsAction(formData: FormData) {
  await guardAction("lote", 20, 60);
  const ids = [...new Set(formData.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
  const op = String(formData.get("op") ?? "");
  if (!ids.length) return;

  if (op === "delete") {
    const marks = ids.map(() => "?").join(",");
    await run(`DELETE FROM interactions WHERE lead_id IN (${marks})`, ids);
    await run(`DELETE FROM leads WHERE id IN (${marks})`, ids);
  } else if (op === "dnc") {
    for (const id of ids) await blockLead(id);
  } else if (op.startsWith("status:")) {
    const status = op.slice(7);
    if (!validStatus(status)) return;
    for (const id of ids) {
      if ((await getLead(id))?.do_not_contact) continue;
      await setLeadStatus(id, status);
    }
  }
  refresh();
}

export async function deleteDemoLeadsAction() {
  await guardAction();
  await run("DELETE FROM interactions WHERE lead_id IN (SELECT id FROM leads WHERE source = 'demo')");
  await run("DELETE FROM leads WHERE source = 'demo'");
  await run("DELETE FROM searches WHERE source = 'demo'");
  refresh();
}

export type ManualLeadState = { ok?: boolean; error?: string } | undefined;

export async function addManualLeadAction(_prev: ManualLeadState, formData: FormData): Promise<ManualLeadState> {
  await guardAction();
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  if (!name) return { error: "Informe o nome da empresa." };

  const phone = parsePhone(String(formData.get("phone") ?? ""));
  const rawPhone = String(formData.get("phone") ?? "").trim();
  if (rawPhone && !phone) return { error: "Telefone inválido. Use DDD + número." };

  const rawSite = String(formData.get("website") ?? "").trim();
  const website = rawSite ? (/^https?:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`) : null;
  const siteStatus = classifySite(website);
  const instagram = String(formData.get("instagram") ?? "").trim().replace(/^@/, "");
  const notes = instagram ? `Instagram: https://instagram.com/${instagram}` : null;
  const now = nowISO();

  if (phone) {
    if ((await loadBlocklist()).phones.has(phone.digits)) {
      return { error: "Esse telefone está na sua lista de não contatar. Remova de lá em Ajustes se quiser cadastrar." };
    }
    const dup = await run("SELECT id FROM leads WHERE phone_digits = ? LIMIT 1", [phone.digits]);
    if (dup.rows.length) return { error: "Já existe um lead com esse telefone." };
  }

  const res = await run(
    "INSERT INTO leads (name, niche, city, phone, phone_digits, is_mobile, website, site_status, source, score, " +
      "status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, 'novo', ?, ?, ?)",
    [
      name,
      String(formData.get("niche") ?? "").trim() || null,
      String(formData.get("city") ?? "").trim() || null,
      phone?.display ?? null,
      phone?.digits ?? null,
      phone?.isMobile ? 1 : 0,
      website,
      siteStatus,
      leadScore({ siteStatus, isMobile: phone?.isMobile ?? false, hasPhone: !!phone, rating: null, reviews: null }),
      notes,
      now,
      now,
    ],
  );
  await logInteraction(Number(res.lastInsertRowid), "captado", "Cadastrado manualmente");
  refresh();
  return { ok: true };
}

import { one, rows, run } from "./db";
import { STAGE_COLUMN, STAGE_ORDER, STATUS_LABEL } from "./constants";
import { nowISO } from "./format";

export type Lead = {
  id: number;
  place_id: string | null;
  search_id: number | null;
  name: string;
  niche: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  phone_digits: string | null;
  is_mobile: number;
  website: string | null;
  site_status: "none" | "social" | "own";
  rating: number | null;
  reviews: number | null;
  maps_url: string | null;
  source: string;
  score: number;
  status: string;
  notes: string | null;
  follow_up_at: string | null;
  lost_reason: string | null;
  do_not_contact: number;
  created_at: string;
  updated_at: string;
  contacted_at: string | null;
  responded_at: string | null;
  proposal_at: string | null;
  closed_at: string | null;
  lost_at: string | null;
};

export type Interaction = { id: number; lead_id: number; type: string; content: string; created_at: string };

export async function getLead(id: number): Promise<Lead | null> {
  return one<Lead>("SELECT * FROM leads WHERE id = ?", [id]);
}

export async function getInteractions(leadId: number): Promise<Interaction[]> {
  return rows<Interaction>("SELECT * FROM interactions WHERE lead_id = ? ORDER BY id DESC", [leadId]);
}

export async function logInteraction(leadId: number, type: string, content: string) {
  await run("INSERT INTO interactions (lead_id, type, content, created_at) VALUES (?, ?, ?, ?)", [
    leadId,
    type,
    content,
    nowISO(),
  ]);
}

/**
 * Muda o status do lead e carimba a data de cada etapa do funil que ele ainda não tinha.
 * Pular direto para "fechado" preenche também contatado/respondeu/proposta.
 */
export async function setLeadStatus(leadId: number, newStatus: string, lostReason?: string) {
  const lead = await getLead(leadId);
  if (!lead || lead.status === newStatus) return;
  const now = nowISO();

  const sets: string[] = ["status = ?", "updated_at = ?"];
  const args: (string | number | null)[] = [newStatus, now];

  if (newStatus === "perdido") {
    sets.push("lost_at = ?", "lost_reason = ?");
    args.push(now, lostReason?.trim() || null);
  } else {
    sets.push("lost_at = NULL", "lost_reason = NULL");
    const idx = STAGE_ORDER.indexOf(newStatus);
    for (let i = 1; i <= idx; i++) {
      const col = STAGE_COLUMN[STAGE_ORDER[i]];
      sets.push(`${col} = COALESCE(${col}, ?)`);
      args.push(now);
    }
  }

  await run(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`, [...args, leadId]);
  const from = STATUS_LABEL[lead.status] ?? lead.status;
  const to = STATUS_LABEL[newStatus] ?? newStatus;
  const reason = newStatus === "perdido" && lostReason?.trim() ? ` (motivo: ${lostReason.trim()})` : "";
  await logInteraction(leadId, "status", `Status: ${from} → ${to}${reason}`);
}

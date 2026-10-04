import { rows, run } from "./db";
import { nowISO } from "./format";
import { getLead, logInteraction, setLeadStatus } from "./leads";

export type BlockEntry = { id: number; place_id: string | null; phone_digits: string | null; name: string; reason: string | null; created_at: string };

/** Marca o lead como "não contatar": some das listas de chamar e a empresa nunca mais é captada. */
export async function blockLead(leadId: number, reason?: string) {
  const lead = await getLead(leadId);
  if (!lead) return;
  const why = reason?.trim() || "Pediu para não ser contatado";

  const exists = await rows<{ id: number }>(
    "SELECT id FROM blocklist WHERE (place_id IS NOT NULL AND place_id = ?) OR (phone_digits IS NOT NULL AND phone_digits = ?) LIMIT 1",
    [lead.place_id ?? "", lead.phone_digits ?? ""],
  );
  if (!exists.length) {
    await run("INSERT INTO blocklist (place_id, phone_digits, name, reason, created_at) VALUES (?, ?, ?, ?, ?)", [
      lead.place_id,
      lead.phone_digits,
      lead.name,
      why,
      nowISO(),
    ]);
  }
  await run("UPDATE leads SET do_not_contact = 1, follow_up_at = NULL, updated_at = ? WHERE id = ?", [nowISO(), leadId]);
  await logInteraction(leadId, "bloqueio", `Marcado como NÃO CONTATAR: ${why}`);
  // Cliente que já fechou e pede para não receber mensagens continua sendo cliente nos números;
  // só os demais viram "Perdido".
  if (lead.status !== "fechado") await setLeadStatus(leadId, "perdido", why);
}

/** Desfaz o "não contatar" (o lead continua como Perdido; você decide o que fazer com ele). */
export async function unblockLead(leadId: number) {
  const lead = await getLead(leadId);
  if (!lead) return;
  await run(
    "DELETE FROM blocklist WHERE (place_id IS NOT NULL AND place_id = ?) OR (phone_digits IS NOT NULL AND phone_digits = ?)",
    [lead.place_id ?? "", lead.phone_digits ?? ""],
  );
  await run("UPDATE leads SET do_not_contact = 0, updated_at = ? WHERE id = ?", [nowISO(), leadId]);
  await logInteraction(leadId, "bloqueio", "Removido da lista de não contatar");
}

export async function removeBlockEntry(id: number) {
  const entry = (await rows<BlockEntry>("SELECT * FROM blocklist WHERE id = ?", [id]))[0];
  if (!entry) return;
  await run("DELETE FROM blocklist WHERE id = ?", [id]);
  await run(
    "UPDATE leads SET do_not_contact = 0 WHERE (place_id IS NOT NULL AND place_id = ?) OR (phone_digits IS NOT NULL AND phone_digits = ?)",
    [entry.place_id ?? "", entry.phone_digits ?? ""],
  );
}

export async function loadBlocklist(): Promise<{ places: Set<string>; phones: Set<string> }> {
  const list = await rows<BlockEntry>("SELECT place_id, phone_digits FROM blocklist");
  return {
    places: new Set(list.map((b) => b.place_id).filter((v): v is string => !!v)),
    phones: new Set(list.map((b) => b.phone_digits).filter((v): v is string => !!v)),
  };
}

export async function listBlocklist(): Promise<BlockEntry[]> {
  return rows<BlockEntry>("SELECT * FROM blocklist ORDER BY id DESC");
}

"use server";

import { revalidatePath } from "next/cache";
import { guardAction } from "@/lib/ratelimit";
import { run } from "@/lib/db";
import { brl, nowISO, parseBRL, todayBR } from "@/lib/format";
import { getLead, logInteraction, setLeadStatus } from "@/lib/leads";
import { COST_CATEGORIES } from "@/lib/constants";

const refresh = () => revalidatePath("/", "layout");
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim().slice(0, 300);
const dateOr = (s: string, fallback: string) => (isDate(s) ? s : fallback);

export type FormState = { ok?: boolean; error?: string } | undefined;

export async function addSaleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await guardAction();
  const leadId = Number(formData.get("lead_id")) || null;
  const lead = leadId ? await getLead(leadId) : null;
  const clientName = text(formData, "client_name") || lead?.name || "";
  const service = text(formData, "service");
  const amount = parseBRL(formData.get("amount"));
  const monthly = parseBRL(formData.get("monthly"));
  const soldAt = dateOr(text(formData, "sold_at"), todayBR());

  if (!clientName) return { error: "Informe o nome do cliente." };
  if (!service) return { error: "Informe o serviço vendido." };
  if (amount <= 0 && monthly <= 0) return { error: "Informe o valor da venda ou da mensalidade." };

  if (amount > 0) {
    await run(
      "INSERT INTO sales (lead_id, client_name, service, amount, sold_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [leadId, clientName, service, amount, soldAt, text(formData, "notes") || null, nowISO()],
    );
  }
  if (monthly > 0) {
    await run(
      "INSERT INTO subscriptions (lead_id, client_name, plan, amount, start_date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [leadId, clientName, text(formData, "plan") || "Mensalidade", monthly, soldAt, nowISO()],
    );
  }
  if (leadId && lead) {
    await logInteraction(
      leadId,
      "venda",
      `Venda registrada: ${service}` +
        (amount > 0 ? ` — ${brl(amount)}` : "") +
        (monthly > 0 ? ` + mensalidade de ${brl(monthly)}` : ""),
    );
    await setLeadStatus(leadId, "fechado");
  }
  refresh();
  return { ok: true };
}

export async function deleteSaleAction(formData: FormData) {
  await guardAction();
  await run("DELETE FROM sales WHERE id = ?", [Number(formData.get("id"))]);
  refresh();
}

export async function addSubscriptionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await guardAction();
  const clientName = text(formData, "client_name");
  const amount = parseBRL(formData.get("amount"));
  if (!clientName) return { error: "Informe o nome do cliente." };
  if (amount <= 0) return { error: "Informe o valor mensal." };
  await run(
    "INSERT INTO subscriptions (lead_id, client_name, plan, amount, start_date, created_at) VALUES (NULL, ?, ?, ?, ?, ?)",
    [clientName, text(formData, "plan") || "Mensalidade", amount, dateOr(text(formData, "start_date"), todayBR()), nowISO()],
  );
  refresh();
  return { ok: true };
}

export async function endSubscriptionAction(formData: FormData) {
  await guardAction();
  await run("UPDATE subscriptions SET end_date = ? WHERE id = ?", [todayBR(), Number(formData.get("id"))]);
  refresh();
}

export async function deleteSubscriptionAction(formData: FormData) {
  await guardAction();
  await run("DELETE FROM subscriptions WHERE id = ?", [Number(formData.get("id"))]);
  refresh();
}

export async function addCostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await guardAction();
  const description = text(formData, "description");
  const amount = parseBRL(formData.get("amount"));
  const category = text(formData, "category");
  const kind = text(formData, "kind") === "mensal" ? "mensal" : "unico";
  if (!description) return { error: "Descreva o custo." };
  if (amount <= 0) return { error: "Informe o valor." };
  if (!COST_CATEGORIES.some((c) => c.key === category)) return { error: "Escolha uma categoria." };
  await run(
    "INSERT INTO costs (description, category, amount, kind, start_date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [description, category, amount, kind, dateOr(text(formData, "start_date"), todayBR()), nowISO()],
  );
  refresh();
  return { ok: true };
}

export async function endCostAction(formData: FormData) {
  await guardAction();
  await run("UPDATE costs SET end_date = ? WHERE id = ?", [todayBR(), Number(formData.get("id"))]);
  refresh();
}

// ---------- edição ----------

const optionalDate = (s: string) => (isDate(s) ? s : null);

export async function updateSaleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await guardAction();
  const id = Number(formData.get("id"));
  const clientName = text(formData, "client_name");
  const service = text(formData, "service");
  const amount = parseBRL(formData.get("amount"));
  if (!clientName) return { error: "Informe o nome do cliente." };
  if (!service) return { error: "Informe o que foi vendido." };
  if (amount <= 0) return { error: "Informe o valor da venda." };
  await run("UPDATE sales SET client_name = ?, service = ?, amount = ?, sold_at = ? WHERE id = ?", [
    clientName,
    service,
    amount,
    dateOr(text(formData, "sold_at"), todayBR()),
    id,
  ]);
  refresh();
  return { ok: true };
}

export async function updateSubscriptionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await guardAction();
  const id = Number(formData.get("id"));
  const clientName = text(formData, "client_name");
  const amount = parseBRL(formData.get("amount"));
  const start = dateOr(text(formData, "start_date"), todayBR());
  const end = optionalDate(text(formData, "end_date"));
  if (!clientName) return { error: "Informe o nome do cliente." };
  if (amount <= 0) return { error: "Informe o valor mensal." };
  if (end && end < start) return { error: "O fim não pode ser antes do começo." };
  await run("UPDATE subscriptions SET client_name = ?, plan = ?, amount = ?, start_date = ?, end_date = ? WHERE id = ?", [
    clientName,
    text(formData, "plan") || "Mensalidade",
    amount,
    start,
    end,
    id,
  ]);
  refresh();
  return { ok: true };
}

export async function updateCostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await guardAction();
  const id = Number(formData.get("id"));
  const description = text(formData, "description");
  const amount = parseBRL(formData.get("amount"));
  const category = text(formData, "category");
  const kind = text(formData, "kind") === "mensal" ? "mensal" : "unico";
  const start = dateOr(text(formData, "start_date"), todayBR());
  const end = kind === "mensal" ? optionalDate(text(formData, "end_date")) : null;
  if (!description) return { error: "Descreva o custo." };
  if (amount <= 0) return { error: "Informe o valor." };
  if (!COST_CATEGORIES.some((c) => c.key === category)) return { error: "Escolha um tipo." };
  if (end && end < start) return { error: "O fim não pode ser antes do começo." };
  await run("UPDATE costs SET description = ?, category = ?, amount = ?, kind = ?, start_date = ?, end_date = ? WHERE id = ?", [
    description,
    category,
    amount,
    kind,
    start,
    end,
    id,
  ]);
  refresh();
  return { ok: true };
}

export async function deleteCostAction(formData: FormData) {
  await guardAction();
  await run("DELETE FROM costs WHERE id = ?", [Number(formData.get("id"))]);
  refresh();
}

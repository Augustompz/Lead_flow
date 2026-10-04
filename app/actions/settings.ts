"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { startSession } from "@/lib/auth";
import { sendEmail } from "@/lib/notify";
import { guardAction, rateLimit, waitText } from "@/lib/ratelimit";
import { one, run, setSetting } from "@/lib/db";
import { GOOGLE_FREE_REQUESTS } from "@/lib/constants";
import { nowISO, parseBRL } from "@/lib/format";
import type { FormState } from "./finance";

export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await guardAction("ajustes", 30, 600);
  const template = String(formData.get("msg_template") ?? "").trim();
  if (template.length < 10) return { error: "A mensagem está curta demais." };

  const rawLimit = String(formData.get("limite_requisicoes") ?? "").trim();
  const limit = Number(rawLimit);
  if (rawLimit === "" || !Number.isInteger(limit) || limit < 0) {
    return { error: "O limite de requisições deve ser um número inteiro (0 bloqueia todas as buscas)." };
  }
  // Passar da franquia grátis significa pagar o Google; exige confirmação consciente.
  if (limit > GOOGLE_FREE_REQUESTS && formData.get("accept_charges") !== "on") {
    return {
      error:
        `Acima de ${GOOGLE_FREE_REQUESTS.toLocaleString("pt-BR")} requisições por mês o Google cobra. ` +
        "Marque a caixa de confirmação para aumentar o limite.",
    };
  }
  await setSetting("limite_requisicoes", String(limit));
  await setSetting("msg_template", template);
  await setSetting("meta_mensal", String(parseBRL(formData.get("meta_mensal"))));
  await setSetting("custo_requisicao", String(parseBRL(formData.get("custo_requisicao"))));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guardAction("senha-tela", 60, 600);
  // Quem tem sessão roubada não pode adivinhar a senha atual em loop.
  const lim = await rateLimit(`senha:u${session.id}`, 5, 900);
  if (!lim.ok) return { error: `Muitas tentativas de trocar a senha. Aguarde ${waitText(lim.retryAfter)}.` };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) return { error: "A nova senha precisa ter pelo menos 8 caracteres." };
  if (Buffer.byteLength(next) > 72) return { error: "A senha pode ter no máximo 72 caracteres." };
  const user = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [session.id]);
  if (!user || !(await bcrypt.compare(current, user.password_hash))) return { error: "Senha atual incorreta." };
  const version = session.v + 1;
  await run("UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?", [await bcrypt.hash(next, 10), version, session.id]);
  // Outros aparelhos/sessões perdem o acesso; esta continua logada.
  await startSession({ ...session, v: version });
  return { ok: true };
}

export async function addUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guardAction("usuario-tela", 60, 600);
  const lim = await rateLimit(`novo-usuario:u${session.id}`, 10, 3600);
  if (!lim.ok) return { error: `Muitos usuários criados em pouco tempo. Aguarde ${waitText(lim.retryAfter)}.` };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "E-mail inválido." };
  if (!name) return { error: "Informe o nome." };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (Buffer.byteLength(password) > 72) return { error: "A senha pode ter no máximo 72 caracteres." };
  if (await one("SELECT id FROM users WHERE email = ?", [email])) return { error: "Já existe um usuário com esse e-mail." };
  await run("INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)", [
    email,
    name,
    await bcrypt.hash(password, 10),
    nowISO(),
  ]);
  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function clearErrorLogAction() {
  await guardAction("ajustes", 30, 600);
  await run("DELETE FROM error_log");
  revalidatePath("/configuracoes");
}

export async function sendTestEmailAction(): Promise<FormState> {
  await guardAction("ajustes", 30, 600);
  const lim = await rateLimit("teste-email", 3, 600);
  if (!lim.ok) return { error: `Aguarde ${waitText(lim.retryAfter)} para testar de novo.` };
  const r = await sendEmail("LeadFlow: teste de aviso", "Se você recebeu este e-mail, os avisos do LeadFlow estão funcionando.");
  return r.ok ? { ok: true } : { error: r.error ?? "Não foi possível enviar." };
}

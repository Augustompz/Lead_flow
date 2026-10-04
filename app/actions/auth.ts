"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { endSession, startSession } from "@/lib/auth";
import { one, run } from "@/lib/db";
import { clientIp, rateLimit, waitText } from "@/lib/ratelimit";

export type LoginState = { error?: string; email?: string } | undefined;

const DUMMY_HASH = bcrypt.hashSync("senha-inexistente", 10);
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Informe e-mail e senha.", email };

  // Limites por IP e geral, além do limite por e-mail abaixo: barram quem testa muitos e-mails
  // e ataques distribuídos. Contam toda tentativa, certa ou errada.
  const byIp = await rateLimit(`login-ip:${await clientIp()}`, 20, 600);
  const overall = await rateLimit("login-global", 300, 600);
  if (!byIp.ok || !overall.ok) {
    const wait = Math.max(byIp.retryAfter, overall.retryAfter);
    return { error: `Muitas tentativas de entrada. Aguarde ${waitText(wait)}.`, email };
  }

  const attempt = await one<{ count: number; first_at: string }>(
    "SELECT count, first_at FROM login_attempts WHERE email = ?",
    [email],
  );
  const inWindow = attempt && Date.now() - new Date(attempt.first_at).getTime() < WINDOW_MS;
  if (attempt && inWindow && attempt.count >= MAX_ATTEMPTS) {
    return { error: "Muitas tentativas. Aguarde 15 minutos e tente de novo.", email };
  }

  const user = await one<{ id: number; email: string; name: string; password_hash: string; token_version: number }>(
    "SELECT id, email, name, password_hash, token_version FROM users WHERE email = ?",
    [email],
  );
  // Compara sempre (mesmo sem usuário) para não revelar se o e-mail existe pelo tempo de resposta.
  const hash = user?.password_hash ?? DUMMY_HASH;
  const ok = (await bcrypt.compare(password, hash)) && !!user;

  if (!ok) {
    if (attempt && inWindow) {
      await run("UPDATE login_attempts SET count = count + 1 WHERE email = ?", [email]);
    } else {
      await run(
        "INSERT INTO login_attempts (email, count, first_at) VALUES (?, 1, ?) " +
          "ON CONFLICT(email) DO UPDATE SET count = 1, first_at = excluded.first_at",
        [email, new Date().toISOString()],
      );
    }
    return { error: "E-mail ou senha incorretos.", email };
  }

  await run("DELETE FROM login_attempts WHERE email = ?", [email]);
  await startSession({ id: user.id, email: user.email, name: user.name, v: Number(user.token_version) });
  redirect("/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

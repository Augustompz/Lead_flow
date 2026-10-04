// Redefine a senha de um usuário (não há "esqueci minha senha" por e-mail).
// Uso:  node scripts/reset-password.mjs email@exemplo.com NovaSenha123
// Lê DATABASE_URL / DATABASE_AUTH_TOKEN do .env.local, como o sistema.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error("Uso: node scripts/reset-password.mjs email@exemplo.com NovaSenha (mínimo 8 caracteres)");
  process.exit(1);
}

const db = createClient({
  url: process.env.DATABASE_URL || "file:local.db",
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});
const res = await db.execute({
  sql: "UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE email = ?",
  args: [await bcrypt.hash(password, 10), email.trim().toLowerCase()],
});
if (res.rowsAffected === 0) {
  console.error(`Nenhum usuário com o e-mail ${email}.`);
  process.exit(1);
}
await db.execute({ sql: "DELETE FROM login_attempts WHERE email = ?", args: [email.trim().toLowerCase()] });
console.log("Senha alterada. Todas as sessões abertas foram encerradas; entre de novo com a nova senha.");

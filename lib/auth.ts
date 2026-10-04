import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { one } from "./db";
import { SESSION_COOKIE, SESSION_DAYS, isHttps, signSession, verifySession, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  // O cookie assinado não basta: o usuário precisa existir e a versão da sessão precisa ser a atual.
  const user = await one<{ token_version: number }>("SELECT token_version FROM users WHERE id = ?", [session.id]);
  if (!user || Number(user.token_version) !== session.v) return null;
  return session;
}

/** Use no começo de toda página e de toda Server Action: o proxy sozinho não basta. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function startSession(user: Session) {
  const store = await cookies();
  const secure = isHttps((await headers()).get("x-forwarded-proto"));
  store.set(SESSION_COOKIE, await signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

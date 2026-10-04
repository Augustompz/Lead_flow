import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "lf_session";
export const SESSION_DAYS = 14;

/** v = versão da sessão do usuário: trocar a senha aumenta o número e derruba as sessões antigas. */
export type Session = { id: number; email: string; name: string; v: number };

/**
 * O cookie só leva a flag Secure quando a conexão é HTTPS (Vercel, Railway etc. enviam x-forwarded-proto).
 * Usar NODE_ENV aqui quebraria o login ao abrir `npm start` pelo IP da rede (http://192.168...),
 * pois o navegador descarta cookie Secure em HTTP.
 */
export function isHttps(forwardedProto: string | null | undefined): boolean {
  return (forwardedProto ?? "").split(",")[0].trim().toLowerCase() === "https";
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET não configurado (mínimo 16 caracteres). Veja o arquivo .env.example.");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(user: Session): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, v: user.v })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return {
      id: Number(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      v: Number(payload.v ?? 0),
    };
  } catch {
    return null;
  }
}

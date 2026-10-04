import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Checagem otimista: manda para o login quem não tem sessão válida.
// A segurança de verdade está em requireSession(), chamado em cada página e ação.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // /api/cron se protege sozinho com CRON_SECRET (a Vercel não tem cookie de login).
  if (pathname === "/login" || pathname.startsWith("/api/cron/")) return NextResponse.next();

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

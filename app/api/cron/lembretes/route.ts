import { timingSafeEqual } from "node:crypto";
import { emailConfigured, sendEmail } from "@/lib/notify";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { digestText, listDue } from "@/lib/reminders";

/**
 * E-mail diário com quem precisa de retorno. A Vercel chama esta rota todo dia (veja vercel.json)
 * enviando "Authorization: Bearer <CRON_SECRET>". Sem CRON_SECRET a rota fica desligada.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET não configurado." }, { status: 503 });

  const rate = await rateLimit(`cron:${await clientIp()}`, 30, 600);
  if (!rate.ok) return new Response("Muitas chamadas.", { status: 429 });

  // Comparação em tempo constante, para não vazar o segredo pelo tempo de resposta.
  const sent = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
    return new Response("Não autorizado", { status: 401 });
  }

  const due = await listDue();
  if (due.length === 0) return Response.json({ ok: true, due: 0, sent: false });
  if (!emailConfigured()) return Response.json({ ok: true, due: due.length, sent: false, reason: "e-mail não configurado" });

  const appUrl = process.env.APP_URL?.trim() || new URL(request.url).origin;
  const res = await sendEmail(
    `LeadFlow: ${due.length} ${due.length === 1 ? "retorno" : "retornos"} para hoje`,
    digestText(due, appUrl),
  );
  return Response.json({ ok: res.ok, due: due.length, sent: res.ok, error: res.error }, { status: res.ok ? 200 : 502 });
}

/**
 * Envio de e-mail (avisos de retorno e de erro) pelo Resend (resend.com, plano gratuito).
 * Só liga quando RESEND_API_KEY e ALERT_EMAIL estão definidos; sem isso tudo continua funcionando, sem e-mail.
 */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim() && !!process.env.ALERT_EMAIL?.trim();
}

export async function sendEmail(subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!emailConfigured()) return { ok: false, error: "E-mail não configurado (RESEND_API_KEY e ALERT_EMAIL)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM?.trim() || "LeadFlow <onboarding@resend.dev>",
        to: process.env
          .ALERT_EMAIL!.split(",")
          .map((e) => e.trim())
          .filter(Boolean),
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: body.message ?? `Resend respondeu ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Não consegui falar com o serviço de e-mail." };
  }
}

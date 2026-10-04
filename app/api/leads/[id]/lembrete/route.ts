import { getSession } from "@/lib/auth";
import { getLead } from "@/lib/leads";
import { icsForLead } from "@/lib/reminders";

/** Baixa o lembrete do retorno em formato de calendário (.ics) para abrir no celular. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("Não autorizado", { status: 401 });
  const id = Number((await ctx.params).id);
  const lead = Number.isInteger(id) ? await getLead(id) : null;
  if (!lead || !lead.follow_up_at) return new Response("Esse lead não tem retorno marcado.", { status: 404 });

  return new Response(icsForLead(lead), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="retorno-lead-${lead.id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}

import { getSession } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { STATUS_LABEL, SITE_STATUS_LABEL } from "@/lib/constants";
import { filtersFromParams, queryLeads } from "@/lib/lead-query";
import { fmtDate } from "@/lib/format";

// Evita que o Excel execute fórmulas escondidas em nomes de empresas (=, +, -, @).
function cell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Não autorizado", { status: 401 });
  // Exportar baixa a base inteira: 10 por 10 minutos por usuário.
  const rate = await rateLimit(`export:u${session.id}`, 10, 600);
  if (!rate.ok) {
    return new Response("Muitos downloads seguidos. Aguarde um pouco e tente de novo.", {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfter) },
    });
  }

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { leads } = await queryLeads(filtersFromParams(params), { all: true });

  const header = [
    "Nome",
    "Nicho",
    "Cidade",
    "Telefone",
    "Endereço",
    "Situação do site",
    "Site",
    "Nota",
    "Avaliações",
    "Chance (0-100)",
    "Status",
    "Follow-up",
    "Origem",
    "Google Maps",
    "Observações",
    "Captado em",
  ];
  const lines = [header.map(cell).join(";")];
  for (const l of leads) {
    lines.push(
      [
        l.name,
        l.niche,
        l.city,
        l.phone,
        l.address,
        SITE_STATUS_LABEL[l.site_status],
        l.website,
        l.rating,
        l.reviews,
        l.score,
        STATUS_LABEL[l.status] ?? l.status,
        l.follow_up_at ? fmtDate(l.follow_up_at) : "",
        l.source,
        l.maps_url,
        l.notes,
        fmtDate(l.created_at),
      ]
        .map(cell)
        .join(";"),
    );
  }

  // BOM + ponto e vírgula: o Excel em português abre com acentos e colunas certas.
  const body = "﻿" + lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

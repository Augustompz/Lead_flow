import Link from "next/link";
import { deleteDemoLeadsAction } from "@/app/actions/leads";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Icon } from "@/components/Icon";
import { SearchForm } from "@/components/SearchForm";
import { UsageMeter } from "@/components/UsageMeter";
import { PageHeader, SectionTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { rows } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { getUsage } from "@/lib/usage";

// A busca no Google pode levar alguns segundos (até 3 páginas de resultados).
export const maxDuration = 60;

type SearchRow = {
  id: number;
  niche: string;
  city: string;
  source: string;
  found: number;
  added: number;
  duplicates: number;
  skipped: number;
  requests: number;
  created_at: string;
};

export default async function BuscarPage() {
  await requireSession();
  const demo = !process.env.GOOGLE_MAPS_API_KEY?.trim();
  const [history, demoCount, usage] = await Promise.all([
    rows<SearchRow>("SELECT * FROM searches ORDER BY id DESC LIMIT 15"),
    rows<{ n: number }>("SELECT COUNT(*) AS n FROM leads WHERE source = 'demo'"),
    getUsage(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Buscar leads"
        intro="Diga o tipo de empresa e a cidade. O sistema procura no Google Maps e guarda só quem ainda não tem site."
      />

      {demo && (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-[14.5px] text-warn">
          <b>Modo demonstração:</b> as empresas são fictícias, só para você conhecer o sistema.{" "}
          <Link href="/configuracoes" className="font-semibold underline">
            Como ligar a busca real
          </Link>
        </p>
      )}

      {!demo && <UsageMeter usage={usage} />}

      <SearchForm demo={demo} remaining={usage.remaining} />

      {demo && Number(demoCount[0]?.n) > 0 && (
        <form action={deleteDemoLeadsAction} className="card-soft flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14.5px] text-ink-2">
            Terminou de testar? Você tem <b>{demoCount[0].n}</b> leads de demonstração.
          </p>
          <ConfirmButton message="Apagar todos os leads e buscas de demonstração?" className="btn btn-sm">
            Apagar leads de demonstração
          </ConfirmButton>
        </form>
      )}

      <section>
        <SectionTitle>Buscas anteriores</SectionTitle>
        {history.length === 0 ? (
          <p className="card-soft text-[15px] text-ink-2">Quando você fizer a primeira busca, ela fica registrada aqui.</p>
        ) : (
          <ul className="card divide-y divide-line !p-0">
            {history.map((s) => (
              <li key={s.id}>
                <Link href={`/leads?search=${s.id}`} className="flex min-h-[64px] items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[15.5px] font-semibold">
                      {s.niche} em {s.city}
                      {s.source === "demo" && <span className="chip ml-2 bg-warn-soft !py-0 text-warn">demo</span>}
                    </span>
                    <span className="text-[13.5px] text-muted">
                      {fmtDateTime(s.created_at)} · {s.added} novos de {s.found} encontrados
                      {s.duplicates > 0 && ` · ${s.duplicates} repetidos`}
                    </span>
                  </span>
                  <Icon name="arrow" size={18} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

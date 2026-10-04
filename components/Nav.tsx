"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

const ITEMS: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/", label: "Início", short: "Início", icon: "home" },
  { href: "/leads", label: "Meus leads", short: "Leads", icon: "users" },
  { href: "/buscar", label: "Buscar leads", short: "Buscar", icon: "search" },
  { href: "/financeiro", label: "Dinheiro", short: "Dinheiro", icon: "wallet" },
  { href: "/configuracoes", label: "Ajustes", short: "Ajustes", icon: "sliders" },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

/** Menu lateral (computador). */
export function SideNav({ due = 0 }: { due?: number }) {
  const isActive = useActive();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[46px] items-center gap-3 rounded-xl px-3 text-[15px] font-semibold ${
              active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2"
            }`}
          >
            <Icon name={item.icon} />
            {item.label}
            {item.href === "/" && due > 0 && <DueBadge n={due} />}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra fixa embaixo (celular): sempre ao alcance do polegar. */
export function BottomNav({ due = 0 }: { due?: number }) {
  const isActive = useActive();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[62px] flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <span
                  className={`relative flex h-8 w-14 items-center justify-center rounded-full ${active ? "bg-accent-soft" : ""}`}
                >
                  <Icon name={item.icon} size={22} />
                  {item.href === "/" && due > 0 && <DueBadge n={due} floating />}
                </span>
                {item.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Bolinha com quantos retornos estão para hoje ou atrasados. */
function DueBadge({ n, floating = false }: { n: number; floating?: boolean }) {
  return (
    <span
      className={`inline-flex min-w-[20px] items-center justify-center rounded-full bg-rose-soft px-1.5 text-[12px] font-bold leading-5 text-rose ${
        floating ? "absolute -right-0.5 -top-1" : "ml-auto"
      }`}
      title={`${n} retorno(s) para hoje ou atrasados`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

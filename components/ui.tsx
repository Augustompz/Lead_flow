import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** Título da página + frase que explica para que ela serve. */
export function PageHeader({
  title,
  intro,
  actions,
}: {
  title: string;
  intro?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-[60ch]">
        <h1 className="font-display text-[30px] font-bold leading-tight tracking-tight md:text-[34px]">{title}</h1>
        {intro && <p className="mt-1.5 text-[15.5px] text-ink-2">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Ajuda curta que abre ao toque ("O que é isso?"), sem tirar o foco da tela. */
export function Hint({ label = "O que é isso?", children }: { label?: string; children: ReactNode }) {
  return (
    <details className="group text-[14px]">
      <summary className="inline-flex min-h-[32px] cursor-pointer list-none items-center gap-1.5 font-semibold text-accent [&::-webkit-details-marker]:hidden">
        <Icon name="info" size={16} />
        {label}
      </summary>
      <div className="mt-1 max-w-[62ch] rounded-xl bg-surface-2 p-3.5 text-ink-2">{children}</div>
    </details>
  );
}

/** Tela vazia: diz o que vai aparecer ali e qual é o primeiro passo. */
export function EmptyState({
  icon = "spark",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface-2 p-6 sm:p-8">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon name={icon} size={22} />
      </span>
      <div className="max-w-[52ch]">
        <p className="font-display text-[19px] font-semibold">{title}</p>
        {children && <p className="mt-1 text-[15px] text-ink-2">{children}</p>}
      </div>
      {action && (
        <Link href={action.href} className="btn btn-primary">
          {action.label}
          <Icon name="arrow" size={18} />
        </Link>
      )}
    </div>
  );
}

/** Cabeçalho de seção dentro de uma página. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-display text-[20px] font-semibold tracking-tight">{children}</h2>
      {aside}
    </div>
  );
}

import { Icon } from "./Icon";

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-[var(--accent-ink)]">
        <Icon name="chat" size={18} />
      </span>
      <span className="font-display text-[19px] font-bold tracking-tight">LeadFlow</span>
    </span>
  );
}

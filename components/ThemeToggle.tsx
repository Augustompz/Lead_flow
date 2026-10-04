"use client";

import { useSyncExternalStore } from "react";
import { Icon, type IconName } from "./Icon";

type Mode = "auto" | "light" | "dark";
const KEY = "leadflow_theme";
const EVENT = "leadflow-theme";

const OPTIONS: { mode: Mode; label: string; icon: IconName }[] = [
  { mode: "auto", label: "Automático", icon: "monitor" },
  { mode: "light", label: "Claro", icon: "sun" },
  { mode: "dark", label: "Escuro", icon: "moon" },
];

function apply(mode: Mode) {
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  try {
    if (mode === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
  window.dispatchEvent(new Event(EVENT));
}

function readMode(): Mode {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "auto";
  } catch {
    return "auto";
  }
}

function subscribeMode(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function useMode(): [Mode, (m: Mode) => void] {
  const mode = useSyncExternalStore(subscribeMode, readMode, () => "auto" as Mode);
  return [mode, apply];
}

/** O aparelho prefere escuro? Só o navegador sabe; no servidor assume claro. */
function useSystemDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const q = window.matchMedia("(prefers-color-scheme: dark)");
      q.addEventListener("change", cb);
      return () => q.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

/** Escolha completa (Automático / Claro / Escuro), usada em Ajustes. */
export function ThemeSwitch() {
  const [mode, set] = useMode();
  return (
    <div className="seg seg-fill" role="group" aria-label="Aparência">
      {OPTIONS.map((o) => (
        <button key={o.mode} type="button" aria-pressed={mode === o.mode} onClick={() => set(o.mode)}>
          <Icon name={o.icon} size={16} className="mr-1.5 hidden sm:block" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Botão pequeno que alterna claro/escuro rapidinho (menu lateral, barra do celular e login). */
export function ThemeButton({ className = "" }: { className?: string }) {
  const [mode, set] = useMode();
  const systemDark = useSystemDark();
  const isDark = mode === "dark" || (mode === "auto" && systemDark);
  return (
    <button
      type="button"
      className={`btn btn-sm btn-ghost ${className}`}
      onClick={() => set(isDark ? "light" : "dark")}
      aria-label={isDark ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
      title={isDark ? "Tema claro" : "Tema escuro suave"}
    >
      <Icon name={isDark ? "sun" : "moon"} size={18} />
    </button>
  );
}

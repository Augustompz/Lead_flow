"use client";

import type { ReactNode } from "react";

/** Botão de submit que pede confirmação antes de enviar o formulário. */
export function ConfirmButton({
  message,
  children,
  className = "btn btn-sm btn-danger",
}: {
  message: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        // Se o navegador não conseguir mostrar a confirmação, NÃO segue (melhor não apagar do que apagar sem perguntar).
        let ok = false;
        try {
          ok = window.confirm(message);
        } catch {
          ok = false;
        }
        if (!ok) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

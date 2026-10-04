"use client";

import { useState, useTransition } from "react";
import { changeStatusAction } from "@/app/actions/leads";
import { STATUSES } from "@/lib/constants";

const TONE: Record<string, string> = {
  novo: "bg-surface-2 text-ink-2",
  contatado: "bg-accent-soft text-accent",
  respondeu: "bg-accent-soft text-accent",
  proposta: "bg-accent-soft text-accent",
  fechado: "bg-good-soft text-good",
  perdido: "bg-rose-soft text-rose",
};

/** Menu de status com cara de etiqueta: toque, escolha, pronto. */
export function StatusSelect({ leadId, status }: { leadId: number; status: string }) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <>
    <select
      aria-label="Etapa da conversa"
      className={`min-h-[40px] max-w-full cursor-pointer rounded-full border-0 py-1.5 pl-3.5 pr-3 text-[14px] font-semibold ${TONE[value] ?? TONE.novo} ${
        pending ? "opacity-60" : ""
      }`}
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        let reason: string | undefined;
        if (next === "perdido") {
          try {
            const answer = window.prompt("O que aconteceu? (opcional, ajuda a aprender)");
            if (answer === null) return;
            reason = answer;
          } catch {
            // Alguns navegadores embutidos não suportam prompt(): segue sem o motivo.
          }
        }
        setValue(next);
        setNote(null);
        startTransition(async () => {
          const r = await changeStatusAction(leadId, next, reason);
          // O servidor recusou (ex.: lead em "não contatar"): volta para a etapa real e explica.
          if (!r.ok) {
            setValue(status);
            setNote(r.message ?? "Não foi possível mudar a etapa.");
          }
        });
      }}
    >
      {STATUSES.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
    </select>
    {note && (
      <span role="alert" className="basis-full text-[13px] text-rose">
        {note}
      </span>
    )}
    </>
  );
}

"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { bulkLeadsAction } from "@/app/actions/leads";
import { STATUSES } from "@/lib/constants";

/**
 * Seleção de vários leads: "Marcar todos" no topo da lista e uma barra fixa embaixo
 * (acima do menu no celular) que aparece quando há algum lead marcado.
 * Fica dentro do <form> da lista; os checkboxes dos cartões têm name="ids".
 * A contagem vem direto das caixinhas marcadas, então nunca fica desatualizada
 * (por exemplo, depois de excluir leads ou trocar de página).
 */
export function BulkBar({ total }: { total: number }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [op, setOp] = useState("status:contatado");

  const boxes = () => Array.from(anchor.current?.closest("form")?.querySelectorAll<HTMLInputElement>("input[name=ids]") ?? []);

  const count = useSyncExternalStore(
    (notify) => {
      const form = anchor.current?.closest("form");
      if (!form) return () => {};
      form.addEventListener("change", notify);
      const watcher = new MutationObserver(notify);
      watcher.observe(form, { childList: true, subtree: true });
      return () => {
        form.removeEventListener("change", notify);
        watcher.disconnect();
      };
    },
    () => boxes().filter((b) => b.checked).length,
    () => 0,
  );

  function toggleAll() {
    const all = boxes();
    const mark = count < all.length;
    all.forEach((b) => (b.checked = mark));
    anchor.current?.closest("form")?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function onApply(e: React.MouseEvent<HTMLButtonElement>) {
    const msg =
      op === "delete"
        ? `Excluir ${count} lead(s) e o histórico deles? Não dá para desfazer.`
        : op === "dnc"
          ? `Marcar ${count} lead(s) como "não contatar"? Eles somem das listas e nunca mais serão captados.`
          : null;
    if (msg) {
      let ok = false;
      try {
        ok = window.confirm(msg);
      } catch {
        ok = false;
      }
      if (!ok) {
        e.preventDefault();
        return;
      }
    }
    // Desmarca depois que o formulário já foi lido, para não repetir a ação sem querer.
    setTimeout(() => {
      boxes().forEach((b) => (b.checked = false));
      anchor.current?.closest("form")?.dispatchEvent(new Event("change", { bubbles: true }));
    }, 0);
  }

  return (
    <div ref={anchor}>
      <button type="button" onClick={toggleAll} className="mb-3 min-h-[36px] text-[14.5px] font-semibold text-accent hover:underline">
        {count > 0 && count === total ? "Desmarcar todos" : `Marcar todos desta página (${total})`}
      </button>

      {count > 0 && (
        <div
          role="region"
          aria-label="Ação nos leads marcados"
          className="fixed inset-x-3 bottom-[calc(70px+env(safe-area-inset-bottom,0px))] z-40 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-[0_8px_30px_rgba(0,0,0,0.25)] md:bottom-5 md:left-[272px] md:right-8 md:mx-auto md:max-w-[1000px]"
        >
          <span className="px-1 text-[15px] font-semibold">{count} marcado(s)</span>
          <select
            name="op"
            value={op}
            onChange={(e) => setOp(e.target.value)}
            className="input !min-h-[42px] min-w-0 flex-1 basis-44"
            aria-label="O que fazer com os marcados"
          >
            <optgroup label="Mover para">
              {STATUSES.map((s) => (
                <option key={s.key} value={`status:${s.key}`}>
                  {s.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Outras ações">
              <option value="dnc">Não contatar mais</option>
              <option value="delete">Excluir</option>
            </optgroup>
          </select>
          <button type="submit" formAction={bulkLeadsAction} onClick={onApply} className="btn btn-primary btn-sm">
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}

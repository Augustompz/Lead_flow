"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";

type State = { ok?: boolean; error?: string } | undefined;

/**
 * Formulário ligado a uma Server Action.
 * Não usa o `action` nativo para que os campos NÃO sejam apagados quando há erro de validação;
 * só limpa quando salva com sucesso.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  successMessage = "Salvo.",
  className,
  resetOnSuccess = true,
  submitClassName = "btn btn-primary",
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  children: ReactNode;
  submitLabel: string;
  successMessage?: string;
  className?: string;
  resetOnSuccess?: boolean;
  submitClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className={submitClassName} disabled={pending}>
          {pending ? "Salvando…" : submitLabel}
        </button>
        {state?.error && (
          <p role="alert" className="rounded-xl bg-rose-soft px-3.5 py-2 text-[14.5px] text-rose">
            {state.error}
          </p>
        )}
        {state?.ok && !pending && (
          <p role="status" className="rounded-xl bg-good-soft px-3.5 py-2 text-[14.5px] font-semibold text-good">
            {successMessage}
          </p>
        )}
      </div>
    </form>
  );
}

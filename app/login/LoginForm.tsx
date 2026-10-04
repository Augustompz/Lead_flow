"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { loginAction } from "@/app/actions/auth";

const KEY = "leadflow_email";

// Usa o `action` nativo do formulário: se o JavaScript ainda não carregou (ou foi bloqueado),
// o envio continua indo para o servidor por POST, nunca para a URL.
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [show, setShow] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);

  // Preenche o e-mail salvo neste aparelho (o armazenamento pode estar bloqueado: nunca pode quebrar a tela).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && emailRef.current && !emailRef.current.value) {
        emailRef.current.value = saved;
        if (rememberRef.current) rememberRef.current.checked = true;
      }
    } catch {
      /* sem armazenamento: segue sem lembrar */
    }
  }, []);

  function rememberChoice() {
    try {
      if (rememberRef.current?.checked && emailRef.current?.value) localStorage.setItem(KEY, emailRef.current.value);
      else localStorage.removeItem(KEY);
    } catch {
      /* ignora */
    }
  }

  return (
    <form action={action} onSubmit={rememberChoice} className="space-y-5">
      <div>
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state?.email}
          placeholder="voce@exemplo.com"
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Senha
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            className="input !pr-24"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            className="absolute inset-y-1 right-1 min-w-[76px] rounded-lg px-3 text-[14px] font-semibold text-accent hover:bg-surface-2"
          >
            {show ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-[15px] text-ink-2">
        <input ref={rememberRef} type="checkbox" className="h-5 w-5" /> Lembrar meu e-mail neste aparelho
      </label>

      {state?.error && (
        <p role="alert" className="rounded-xl bg-rose-soft px-4 py-3 text-[14.5px] text-rose">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block !min-h-[52px] text-[16px]" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

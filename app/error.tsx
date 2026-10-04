"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md text-center">
        <h1 className="text-xl font-bold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted">
          Não foi possível carregar esta página. Seus dados não foram perdidos. Tente de novo; se continuar, reinicie o
          sistema.
        </p>
        {error.digest && <p className="mt-2 text-xs text-muted">Código: {error.digest}</p>}
        <button className="btn btn-primary mt-4" onClick={reset}>
          Tentar de novo
        </button>
      </div>
    </main>
  );
}

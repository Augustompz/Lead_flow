import type { Instrumentation } from "next";

// Chamado pelo Next.js toda vez que o servidor captura um erro (página, ação ou rota).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordError } = await import("./lib/errorlog");
    await recordError(err, request.path, context.routeType);
  } catch {
    // Registrar o erro nunca pode causar outro erro.
  }
};

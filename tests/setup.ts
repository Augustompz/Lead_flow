import { mkdirSync, rmSync } from "node:fs";
import { afterAll, vi } from "vitest";

// Banco temporário só deste arquivo de teste (nunca toca no seu local.db).
mkdirSync(".test-tmp", { recursive: true });
const file = `.test-tmp/teste-${process.pid}-${Date.now()}.db`;
process.env.DATABASE_URL = `file:${file}`;
process.env.DATABASE_AUTH_TOKEN = "";
process.env.AUTH_SECRET = "segredo-de-teste-com-mais-de-trinta-caracteres";
process.env.GOOGLE_MAPS_API_KEY = "";
process.env.RESEND_API_KEY = "";
process.env.ALERT_EMAIL = "";
process.env.CRON_SECRET = "";
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

afterAll(() => {
  // No Windows o arquivo só pode ser apagado depois de fechar o cliente do banco.
  (globalThis as { __lfClient?: { close: () => void } }).__lfClient?.close();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try {
      rmSync(file + suffix, { force: true });
    } catch {
      /* o globalSetup apaga a pasta inteira no fim */
    }
  }
});

// ---- Simulação do que o Next.js fornece durante uma requisição ----
vi.mock("next/headers", async () => {
  const { state } = await import("./helpers");
  return {
    cookies: async () => ({
      get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name) } : undefined),
      set: (name: string, value: string, options?: Record<string, unknown>) => {
        state.cookies.set(name, value);
        state.cookieOptions.set(name, options ?? {});
      },
      delete: (name: string) => {
        state.cookies.delete(name);
      },
    }),
    headers: async () => state.headers,
  };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));

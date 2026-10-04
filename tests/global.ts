import { mkdirSync, rmSync } from "node:fs";

// Bancos temporários dos testes ficam em .test-tmp. No Windows um arquivo pode continuar
// "preso" por alguns instantes depois do teste; então a limpeza nunca pode derrubar a execução.
function clean() {
  try {
    rmSync(".test-tmp", { recursive: true, force: true });
  } catch {
    /* sobra de uma execução anterior: será apagada na próxima */
  }
}

export function setup() {
  clean();
  mkdirSync(".test-tmp", { recursive: true });
}

export function teardown() {
  clean();
}

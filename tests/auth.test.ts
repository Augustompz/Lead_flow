import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAction, logoutAction } from "@/app/actions/auth";
import { addUserAction, changePasswordAction } from "@/app/actions/settings";
import { endSession, getSession, requireSession, startSession } from "@/lib/auth";
import { one, run } from "@/lib/db";
import { SESSION_COOKIE, isHttps, signSession, verifySession } from "@/lib/session";
import { proxy } from "@/proxy";
import { PASSWORD, form, loginAs, makeUser, redirectOf, resetAll, resetRequest, state } from "./helpers";

beforeEach(resetAll);

const login = (email: string, password: string) => loginAction(undefined, form({ email, password }));

describe("login", () => {
  it("entra com e-mail e senha corretos e vai para o início", async () => {
    await makeUser();
    const to = await redirectOf(() => login("admin@teste.com", PASSWORD));
    expect(to).toBe("/");
    const s = await getSession();
    expect(s?.email).toBe("admin@teste.com");
    expect(s?.name).toBe("Admin Teste");
  });

  it("ignora maiúsculas e espaços no e-mail", async () => {
    await makeUser();
    expect(await redirectOf(() => login("  ADMIN@Teste.com ", PASSWORD))).toBe("/");
  });

  it("senha errada: mensagem genérica, e-mail preservado, sem sessão", async () => {
    await makeUser();
    const r = await login("admin@teste.com", "errada");
    expect(r).toEqual({ error: "E-mail ou senha incorretos.", email: "admin@teste.com" });
    expect(await getSession()).toBeNull();
  });

  it("e-mail que não existe dá a MESMA mensagem (não revela quem tem conta)", async () => {
    await makeUser();
    const r = await login("naoexiste@teste.com", PASSWORD);
    expect(r).toEqual({ error: "E-mail ou senha incorretos.", email: "naoexiste@teste.com" });
  });

  it("campos vazios", async () => {
    expect(await login("", "")).toMatchObject({ error: "Informe e-mail e senha." });
  });

  it("depois de 5 erros bloqueia o e-mail, mesmo com a senha certa", async () => {
    await makeUser();
    for (let i = 0; i < 5; i++) await login("admin@teste.com", "errada");
    const r = await login("admin@teste.com", PASSWORD);
    expect(r).toMatchObject({ error: expect.stringContaining("Muitas tentativas") });
    expect(await getSession()).toBeNull();
  });

  it("acertar a senha zera o contador de erros", async () => {
    await makeUser();
    for (let i = 0; i < 4; i++) await login("admin@teste.com", "errada");
    await redirectOf(() => login("admin@teste.com", PASSWORD));
    expect(await one("SELECT * FROM login_attempts WHERE email = ?", ["admin@teste.com"])).toBeNull();
    resetRequest();
    for (let i = 0; i < 4; i++) await login("admin@teste.com", "errada");
    expect(await redirectOf(() => login("admin@teste.com", PASSWORD))).toBe("/");
  });

  it("limite por IP: muitos e-mails diferentes do mesmo IP são barrados", async () => {
    state.headers.set("x-forwarded-for", "8.8.8.8");
    let last: unknown;
    for (let i = 1; i <= 21; i++) last = await login(`x${i}@teste.com`, "errada");
    expect(last).toMatchObject({ error: expect.stringContaining("Muitas tentativas de entrada") });
  });

  it("IPs diferentes têm contadores separados", async () => {
    state.headers.set("x-forwarded-for", "8.8.8.8");
    for (let i = 1; i <= 21; i++) await login(`x${i}@teste.com`, "errada");
    state.headers.set("x-forwarded-for", "7.7.7.7");
    expect(await login("outro@teste.com", "errada")).toMatchObject({ error: "E-mail ou senha incorretos." });
  });
});

describe("cookie de sessão", () => {
  it("é httpOnly e sameSite=lax; Secure só quando a conexão é HTTPS", async () => {
    await makeUser();
    await redirectOf(() => login("admin@teste.com", PASSWORD));
    expect(state.cookieOptions.get(SESSION_COOKIE)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });

    resetRequest();
    state.headers.set("x-forwarded-proto", "https");
    await redirectOf(() => login("admin@teste.com", PASSWORD));
    expect(state.cookieOptions.get(SESSION_COOKIE)).toMatchObject({ secure: true });
  });

  it("isHttps entende o x-forwarded-proto", () => {
    expect(isHttps("https")).toBe(true);
    expect(isHttps("https, http")).toBe(true);
    expect(isHttps("HTTPS")).toBe(true);
    expect(isHttps("http")).toBe(false);
    expect(isHttps(null)).toBe(false);
  });

  it("logout apaga o cookie", async () => {
    await loginAs(await makeUser());
    expect(await getSession()).not.toBeNull();
    expect(await redirectOf(() => logoutAction())).toBe("/login");
    expect(state.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await getSession()).toBeNull();
  });

  it("requireSession manda para o login quando não há sessão", async () => {
    expect(await redirectOf(() => requireSession())).toBe("/login");
  });
});

describe("validade da sessão", () => {
  it("cookie adulterado não vale", async () => {
    await loginAs(await makeUser());
    const token = state.cookies.get(SESSION_COOKIE)!;
    state.cookies.set(SESSION_COOKIE, token.slice(0, -3) + "abc");
    expect(await getSession()).toBeNull();
  });

  it("cookie lixo ou vazio não vale", async () => {
    state.cookies.set(SESSION_COOKIE, "isso-nao-e-um-token");
    expect(await getSession()).toBeNull();
    state.cookies.delete(SESSION_COOKIE);
    expect(await getSession()).toBeNull();
  });

  it("token assinado com outro segredo não vale", async () => {
    const id = await makeUser();
    const forged = await new SignJWT({ email: "admin@teste.com", name: "x", v: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setExpirationTime("1d")
      .sign(new TextEncoder().encode("outro-segredo-qualquer-bem-longo-123456"));
    state.cookies.set(SESSION_COOKIE, forged);
    expect(await getSession()).toBeNull();
  });

  it("token vencido não vale", async () => {
    const id = await makeUser();
    const expired = await new SignJWT({ email: "admin@teste.com", name: "x", v: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
    expect(await verifySession(expired)).toBeNull();
  });

  it("token com algoritmo 'none' é recusado", async () => {
    const id = await makeUser();
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: String(id), email: "a", name: "a", v: 0 })}.`;
    expect(await verifySession(unsigned)).toBeNull();
  });

  it("aumentar a versão da sessão do usuário derruba as sessões antigas", async () => {
    const id = await makeUser();
    await loginAs(id);
    expect(await getSession()).not.toBeNull();
    await run("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [id]);
    expect(await getSession()).toBeNull();
  });

  it("usuário apagado perde a sessão", async () => {
    const id = await makeUser();
    await loginAs(id);
    await run("DELETE FROM users WHERE id = ?", [id]);
    expect(await getSession()).toBeNull();
  });

  it("sign e verify devolvem os mesmos dados", async () => {
    const token = await signSession({ id: 7, email: "a@b.com", name: "Ana", v: 3 });
    expect(await verifySession(token)).toEqual({ id: 7, email: "a@b.com", name: "Ana", v: 3 });
  });

  it("startSession/endSession gravam e removem o cookie", async () => {
    await startSession({ id: 1, email: "a@b.com", name: "Ana", v: 0 });
    expect(state.cookies.has(SESSION_COOKIE)).toBe(true);
    await endSession();
    expect(state.cookies.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("troca de senha", () => {
  const change = (current: string, next: string) => changePasswordAction(undefined, form({ current, next }));

  it("com a senha atual certa: troca, mantém ESTA sessão e derruba as antigas", async () => {
    const id = await makeUser();
    await loginAs(id);
    const oldToken = state.cookies.get(SESSION_COOKIE)!;

    expect(await change(PASSWORD, "nova-senha-456")).toEqual({ ok: true });

    expect(await getSession()).not.toBeNull(); // a sessão atual foi renovada
    state.cookies.set(SESSION_COOKIE, oldToken); // outro aparelho, com o cookie antigo
    expect(await getSession()).toBeNull();

    resetRequest();
    expect(await login("admin@teste.com", PASSWORD)).toMatchObject({ error: "E-mail ou senha incorretos." });
    resetRequest();
    expect(await redirectOf(() => login("admin@teste.com", "nova-senha-456"))).toBe("/");
  });

  it("recusa senha atual errada, nova curta e nova longa demais", async () => {
    await loginAs(await makeUser());
    expect(await change("errada", "nova-senha-456")).toEqual({ error: "Senha atual incorreta." });
    expect(await change(PASSWORD, "curta")).toMatchObject({ error: expect.stringContaining("pelo menos 8") });
    expect(await change(PASSWORD, "x".repeat(73))).toMatchObject({ error: expect.stringContaining("no máximo 72") });
    // nada mudou
    resetRequest();
    expect(await redirectOf(() => login("admin@teste.com", PASSWORD))).toBe("/");
  });

  it("limita as tentativas de trocar a senha (sessão roubada não adivinha a atual)", async () => {
    await loginAs(await makeUser());
    for (let i = 0; i < 5; i++) await change("errada", "nova-senha-456");
    expect(await change(PASSWORD, "nova-senha-456")).toMatchObject({ error: expect.stringContaining("Muitas tentativas") });
  });

  it("exige estar logado", async () => {
    expect(await redirectOf(() => change(PASSWORD, "nova-senha-456"))).toBe("/login");
  });
});

describe("adicionar usuário", () => {
  const add = (email: string, name: string, password: string) => addUserAction(undefined, form({ email, name, password }));

  it("cria e a pessoa consegue entrar", async () => {
    await loginAs(await makeUser());
    expect(await add("Maria@Teste.com", "Maria", "senha-da-maria-1")).toEqual({ ok: true });
    resetRequest();
    expect(await redirectOf(() => login("maria@teste.com", "senha-da-maria-1"))).toBe("/");
  });

  it("valida e-mail, nome, senha e duplicidade", async () => {
    await loginAs(await makeUser());
    expect(await add("sem-arroba", "Ana", "senha-longa-123")).toMatchObject({ error: "E-mail inválido." });
    expect(await add("a@b.com", "", "senha-longa-123")).toMatchObject({ error: "Informe o nome." });
    expect(await add("a@b.com", "Ana", "curta")).toMatchObject({ error: expect.stringContaining("pelo menos 8") });
    expect(await add("a@b.com", "Ana", "x".repeat(80))).toMatchObject({ error: expect.stringContaining("no máximo 72") });
    expect(await add("admin@teste.com", "Outro", "senha-longa-123")).toMatchObject({ error: expect.stringContaining("Já existe") });
  });

  it("limita a criação de usuários", async () => {
    await loginAs(await makeUser());
    for (let i = 0; i < 10; i++) await add(`u${i}@teste.com`, "U", "senha-longa-123");
    expect(await add("u99@teste.com", "U", "senha-longa-123")).toMatchObject({ error: expect.stringContaining("Muitos usuários") });
  });
});

describe("proxy (checagem antes de cada página)", () => {
  const req = (path: string, cookie?: string) =>
    new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} });

  it("sem sessão, manda para /login", async () => {
    const res = await proxy(req("/leads"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("/login e /api/cron ficam abertos (o cron se protege sozinho)", async () => {
    expect((await proxy(req("/login"))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(req("/api/cron/lembretes"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("com sessão válida, deixa passar", async () => {
    const token = await signSession({ id: 1, email: "a@b.com", name: "Ana", v: 0 });
    expect((await proxy(req("/leads", token))).headers.get("x-middleware-next")).toBe("1");
  });

  it("com cookie falso, manda para /login", async () => {
    const res = await proxy(req("/leads", "falso"));
    expect(res.status).toBe(307);
  });
});

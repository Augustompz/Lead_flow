import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeButton } from "@/components/ThemeToggle";
import { Hint } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getSession()) redirect("/");

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Fundo decorado: formas suaves, só enfeite (sem texto, sem peso) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage: "radial-gradient(var(--line-strong) 1px, transparent 1.4px)",
            backgroundSize: "26px 26px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 28%, #000 85%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 28%, #000 85%)",
          }}
        />
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-[44%_56%_60%_40%] bg-accent-soft" />
        <div className="absolute -right-20 top-1/4 h-56 w-56 rounded-[60%_40%_45%_55%] bg-good-soft" />
        <div className="absolute -bottom-28 left-[12%] h-80 w-80 rounded-[52%_48%_40%_60%] bg-accent-soft" />
        <div className="absolute bottom-12 right-[10%] h-24 w-24 rounded-[34px] bg-warn-soft" />
      </div>

      <div className="absolute right-3 top-3">
        <ThemeButton />
      </div>
      <div className="w-full max-w-[430px]">
        <div className="card !p-7 sm:!p-9">
          <Logo />
          <h1 className="font-display mt-7 text-[32px] font-bold leading-tight tracking-tight">Bem-vindo de volta</h1>
          <p className="mb-7 mt-2 text-[16px] text-ink-2">Entre para ver quem chamar hoje.</p>
          <LoginForm />
        </div>

        <div className="mt-4 px-2">
          <Hint label="Esqueci minha senha">
            Não enviamos e-mail de recuperação. Peça para quem administra o LeadFlow redefinir a sua senha; leva menos de um
            minuto.
          </Hint>
        </div>
      </div>
    </main>
  );
}

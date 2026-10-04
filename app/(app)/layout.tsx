import { logoutAction } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { BottomNav, SideNav } from "@/components/Nav";
import { ThemeButton } from "@/components/ThemeToggle";
import { requireSession } from "@/lib/auth";
import { countDue } from "@/lib/reminders";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const due = await countDue();

  return (
    <div className="min-h-screen md:flex">
      {/* Computador: menu lateral */}
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:justify-between md:border-r md:border-line md:bg-surface md:px-4 md:py-7">
        <div>
          <div className="mb-8 px-2">
            <Logo />
          </div>
          <SideNav due={due} />
        </div>
        <div className="border-t border-line px-2 pt-4">
          <p className="truncate text-sm font-semibold">{session.name}</p>
          <p className="truncate text-xs text-muted">{session.email}</p>
          <div className="mt-3 flex items-center gap-2">
            <form action={logoutAction} className="flex-1">
              <button className="btn btn-sm btn-block">
                <Icon name="logout" size={16} /> Sair
              </button>
            </form>
            <ThemeButton />
          </div>
        </div>
      </aside>

      {/* Celular: barra de cima simples */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur md:hidden"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex min-h-[56px] items-center">
          <Logo />
        </div>
        <div className="flex items-center">
          <ThemeButton />
          <form action={logoutAction}>
            <button className="btn btn-sm btn-ghost" aria-label="Sair">
              <Icon name="logout" size={18} />
            </button>
          </form>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-32 pt-6 md:px-10 md:pb-14 md:pt-10">
        <div className="mx-auto w-full max-w-[1040px]">{children}</div>
      </main>

      <BottomNav due={due} />
    </div>
  );
}

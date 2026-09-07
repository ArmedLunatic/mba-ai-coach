import { NavLinks } from './nav-links';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl">
      <aside className="hidden w-56 shrink-0 border-r border-border p-4 md:block">
        <div className="mb-6 px-3 text-lg font-semibold tracking-tight">MBA Coach</div>
        <NavLinks orientation="side" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur md:hidden">
          <NavLinks orientation="bottom" />
        </div>
      </div>
    </div>
  );
}

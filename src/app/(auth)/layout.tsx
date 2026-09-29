import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5 text-3xl font-extrabold tracking-tight">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-accent-fg shadow-card">F</span> Forma
        </div>
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">{children}</div>
      </div>
    </div>
  );
}

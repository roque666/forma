'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { NAV, isActive } from './items';
import type { Role } from '@/lib/auth/session';
import type { ReactNode } from 'react';

export function Sidebar({ role, userBlock }: { role: Role; userBlock: ReactNode }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface p-4 md:flex">
      <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 pt-1 text-xl font-extrabold tracking-tight">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent text-accent-fg">F</span> Forma
      </Link>
      <nav className="flex-1 space-y-1" aria-label="Principal">
        {NAV[role].all.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                active ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:bg-surface2 hover:text-fg',
              )}
            >
              <Icon className="h-5 w-5" /> {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-4">
        {userBlock}
        <ThemeToggle />
      </div>
    </aside>
  );
}

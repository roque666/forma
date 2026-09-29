'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { NAV, isActive } from './items';
import type { Role } from '@/lib/auth/session';
import type { ReactNode } from 'react';

export function BottomNav({ role, logout }: { role: Role; logout: ReactNode }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);

  // Durante um treino a barra desaparece: mais espaço e menos toques acidentais.
  if (pathname.startsWith('/session/')) return null;

  const { primary, more: extra } = NAV[role];
  const moreActive = extra.some((i) => isActive(pathname, i.href));
  return (
    <>
      {more && <button aria-label="Fechar menu" className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMore(false)} />}
      {more && (
        <div className="fixed inset-x-3 bottom-[4.75rem] z-50 animate-rise rounded-2xl border border-line bg-surface p-2 shadow-2xl md:hidden safe-bottom">
          {extra.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn('flex items-center gap-3 rounded-xl px-4 py-3.5 text-base font-semibold', isActive(pathname, href) ? 'bg-accent text-accent-fg' : 'hover:bg-surface2')}>
              <Icon className="h-5 w-5" /> {label}
            </Link>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-line px-2 pt-2">
            {logout}
            <ThemeToggle />
          </div>
        </div>
      )}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 backdrop-blur md:hidden safe-bottom">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {primary.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? 'page' : undefined} className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition', active ? 'text-accent-text' : 'text-muted')}>
                  <span className={cn('grid h-7 w-12 place-items-center rounded-full transition', active && 'bg-accent/30')}>
                    <Icon className="h-5 w-5" />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button onClick={() => setMore((v) => !v)} aria-expanded={more} className={cn('flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold', moreActive || more ? 'text-accent-text' : 'text-muted')}>
              <span className={cn('grid h-7 w-12 place-items-center rounded-full', (moreActive || more) && 'bg-accent/30')}>
                <MoreHorizontal className="h-5 w-5" />
              </span>
              Mais
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

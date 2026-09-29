import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './cn';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)} />;
}

/** Card inteiro clicável (navegação rápida). */
export function LinkCard({ className, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={cn(
        'group block rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-accent-text/40 hover:shadow-md active:scale-[0.99] sm:p-5',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function CardTitle({ children, action, href }: { children: ReactNode; action?: ReactNode; href?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {action ??
        (href ? (
          <Link href={href} className="flex items-center text-sm font-medium text-accent-text hover:underline">
            Ver mais <ChevronRight className="h-4 w-4" />
          </Link>
        ) : null)}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            ← {back.label}
          </Link>
        )}
        <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

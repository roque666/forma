import Link from 'next/link';
import { cn } from '@/components/ui/cn';

const TABS = [
  { key: 'diary', href: '/nutrition', label: 'Diário' },
  { key: 'pantry', href: '/nutrition/pantry', label: 'Despensa' },
  { key: 'plans', href: '/nutrition/plans', label: 'Planos' },
  { key: 'calendar', href: '/nutrition/calendar', label: 'Calendário' },
] as const;

export function NutritionTabs({ active }: { active: (typeof TABS)[number]['key'] }) {
  return (
    <nav aria-label="Secções da nutrição" className="mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-surface2 p-1">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? 'page' : undefined}
          className={cn('flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-center text-sm font-semibold transition', t.key === active ? 'bg-surface shadow-sm' : 'text-muted hover:text-fg')}>{t.label}</Link>
      ))}
    </nav>
  );
}

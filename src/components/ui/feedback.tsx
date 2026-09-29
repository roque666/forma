import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from './cn';

const tones = {
  neutral: 'bg-surface2 text-muted',
  accent: 'bg-accent text-accent-fg',
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/15 text-danger',
  protein: 'bg-protein/15 text-protein',
  carbs: 'bg-carbs/15 text-carbs',
  fat: 'bg-fat/15 text-fat',
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}

const barColors = { accent: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', protein: 'bg-protein', carbs: 'bg-carbs', fat: 'bg-fat' } as const;

export function ProgressBar({ value, max = 100, tone = 'accent', height = 'h-2.5', label }: { value: number; max?: number; tone?: keyof typeof barColors; height?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn('w-full overflow-hidden rounded-full bg-surface2', height)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', barColors[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Alert({ tone = 'info', children, className }: { tone?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode; className?: string }) {
  const map = {
    info: ['bg-surface2 text-fg', Info],
    error: ['bg-danger/10 text-danger', AlertTriangle],
    warn: ['bg-warn/10 text-warn', AlertTriangle],
    success: ['bg-ok/10 text-ok', CheckCircle2],
  } as const;
  const [cls, Icon] = map[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm', cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="mb-1 text-muted">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface2', className)} />;
}

export function Stat({ label, value, unit, hint, tone }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1 text-3xl font-bold leading-none tracking-tight">
        {value}
        {unit && <span className="text-sm font-medium text-muted">{unit}</span>}
      </p>
      {hint && <div className="mt-1.5 text-xs text-muted">{tone ? <Badge tone={tone}>{hint}</Badge> : hint}</div>}
    </div>
  );
}

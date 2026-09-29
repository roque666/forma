import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import type { SessionListItem } from '@/lib/data/sessions';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { fmtNum } from '@/lib/labels';
import { formatDateTimePt, formatDuration } from '@/lib/dates';

export function HistoryList({ items, tz, hrefFor, extra, emptyAction }: {
  items: (SessionListItem & { studentName?: string })[]; tz: string; hrefFor: (id: string) => string; extra?: (i: SessionListItem) => React.ReactNode; emptyAction?: boolean;
}) {
  if (items.length === 0)
    return <EmptyState icon={<CalendarDays className="h-8 w-8" />} title="Ainda sem treinos concluídos" description="Quando terminares um treino, aparece aqui com o volume, duração e recordes."
      action={emptyAction ? <LinkButton href="/workouts">Ir para treinos</LinkButton> : undefined} />;
  return (
    <Card className="divide-y divide-line p-0 sm:p-0">
      {items.map((s) => (
        <Link key={s.sessionId} href={hrefFor(s.sessionId)} className="flex items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-surface2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{s.studentName ? `${s.studentName} · ` : ''}{s.dayName ?? s.planName ?? 'Treino livre'}</p>
            <p className="text-xs text-muted">{formatDateTimePt(s.startedAt, tz)} · {formatDuration(s.durationSeconds)}</p>
          </div>
          <div className="shrink-0 text-right text-sm tabular-nums"><p className="font-semibold">{fmtNum(s.volumeKg, 0)} kg</p><p className="text-xs text-muted">{s.setsCompleted} séries</p>{extra?.(s)}</div>
        </Link>
      ))}
    </Card>
  );
}

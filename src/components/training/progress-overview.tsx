import Link from 'next/link';
import { TrendingUp, Trophy } from 'lucide-react';
import type { ExerciseSummary, PrEventRow } from '@/lib/data/sessions';
import { Card, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { fmtNum, prValueText, PR_LABELS } from '@/lib/labels';
import { formatDatePt, isoToLocalDate } from '@/lib/dates';

export function ProgressOverview({ exercises, prs, hrefFor, tz }: { exercises: ExerciseSummary[]; prs: PrEventRow[]; hrefFor: (exerciseId: string) => string; tz: string }) {
  return (
    <div className="space-y-6">
      {prs.length > 0 && (
        <section>
          <CardTitle>Recordes recentes</CardTitle>
          <Card className="divide-y divide-line p-0 sm:p-0">
            {prs.map((p) => (
              <Link key={p.id} href={p.exerciseId ? hrefFor(p.exerciseId) : '#'} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface2">
                <span className="flex min-w-0 items-center gap-2"><Trophy className="h-4 w-4 shrink-0 text-accent-text" /><span className="min-w-0"><span className="block truncate font-medium">{p.exerciseName}</span><span className="text-xs text-muted">{PR_LABELS[p.prType]} · {formatDatePt(isoToLocalDate(p.createdAt, tz))}</span></span></span>
                <strong className="shrink-0 tabular-nums">{prValueText(p.prType, p.value, p.weightKg, p.reps)}</strong>
              </Link>
            ))}
          </Card>
        </section>
      )}
      <section>
        <CardTitle>Exercícios com histórico</CardTitle>
        {exercises.length === 0 ? <EmptyState icon={<TrendingUp className="h-8 w-8" />} title="Ainda sem dados de progressão" description="Conclui séries num treino para veres a evolução de cada exercício." />
          : <div className="grid gap-3 sm:grid-cols-2">{exercises.map((e) => (
            <Link key={e.exerciseId} href={hrefFor(e.exerciseId)} className="rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-accent-text/40">
              <p className="truncate font-semibold">{e.exerciseName}</p>
              <p className="mt-1 text-xs text-muted">{e.sessions} {e.sessions === 1 ? 'treino' : 'treinos'} · último {formatDatePt(isoToLocalDate(e.lastAt, tz))}</p>
              <p className="mt-2 text-sm tabular-nums">Melhor carga <strong>{e.topWeightKg != null ? `${fmtNum(e.topWeightKg, 2)} kg` : '—'}</strong> · 1RM est. <strong>{e.bestE1rm != null ? `${fmtNum(e.bestE1rm, 1)} kg` : '—'}</strong></p>
            </Link>))}</div>}
      </section>
    </div>
  );
}

import { Trophy } from 'lucide-react';
import { withUser } from '@/lib/db/pool';
import { getExercise } from '@/lib/data/exercises';
import { getExerciseHistorySets, getExerciseProgress, getPersonalRecords } from '@/lib/data/sessions';
import { Card, CardTitle } from '@/components/ui/card';
import { EmptyState, Stat } from '@/components/ui/feedback';
import { TrendChart } from '@/components/charts/trend-chart';
import { fmtNum, prValueText, PR_LABELS } from '@/lib/labels';
import { formatDatePt, isoToLocalDate } from '@/lib/dates';

export async function ExerciseProgress({ viewerId, studentId, exerciseId, tz }: { viewerId: string; studentId: string; exerciseId: string; tz: string }) {
  const d = await withUser(viewerId, async (db) => ({
    ex: await getExercise(db, exerciseId),
    points: await getExerciseProgress(db, studentId, exerciseId),
    prs: await getPersonalRecords(db, studentId, exerciseId),
    sets: await getExerciseHistorySets(db, studentId, exerciseId, 6),
  }));
  if (!d.ex) return null;
  const chart = d.points.map((p) => ({ label: formatDatePt(isoToLocalDate(p.startedAt, tz)), e1rm: p.bestE1rm, top: p.topWeightKg, volume: p.volumeKg }));
  const best = (k: 'bestE1rm' | 'topWeightKg') => d.points.reduce<number | null>((m, p) => (p[k] != null && (m == null || p[k]! > m) ? p[k] : m), null);
  const last = d.points[d.points.length - 1], first = d.points[0];
  const delta = last && first && last.bestE1rm != null && first.bestE1rm != null ? Math.round((last.bestE1rm - first.bestE1rm) * 10) / 10 : null;
  const bySession = new Map<string, typeof d.sets>();
  for (const s of d.sets) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);
  if (d.points.length === 0) return <EmptyState title="Sem histórico neste exercício" description="Regista séries deste exercício num treino para veres a evolução." />;
  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Melhor carga" value={fmtNum(best('topWeightKg'), 2)} unit="kg" />
        <Stat label="1RM estimado" value={fmtNum(best('bestE1rm'), 1)} unit="kg" />
        <Stat label="Treinos" value={d.points.length} />
        <Stat label="Evolução 1RM" value={delta == null ? '—' : `${delta > 0 ? '+' : ''}${fmtNum(delta, 1)}`} unit="kg" />
      </Card>
      <Card><CardTitle>1RM estimado e carga máxima</CardTitle>
        <TrendChart data={chart} type="line" unit="kg" series={[{ key: 'e1rm', name: '1RM est.' }, { key: 'top', name: 'Carga máx.', dashed: true }]} />
        <p className="mt-2 text-xs text-muted">1RM estimado pela fórmula de Epley (só séries até 12 repetições).</p></Card>
      <Card><CardTitle>Volume por treino</CardTitle><TrendChart data={chart} type="bar" unit="kg" series={[{ key: 'volume', name: 'Volume' }]} /></Card>
      {d.prs.length > 0 && (
        <Card><CardTitle>Recordes pessoais</CardTitle>
          <ul className="divide-y divide-line">{d.prs.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 text-sm"><span className="flex items-center gap-2"><Trophy className="h-4 w-4 text-accent-text" />{PR_LABELS[p.prType]}<span className="text-xs text-muted">{formatDatePt(isoToLocalDate(p.achievedAt, tz))}</span></span><strong className="tabular-nums">{prValueText(p.prType, p.value, p.weightKg, p.reps)}</strong></li>))}</ul></Card>
      )}
      <Card><CardTitle>Últimos treinos</CardTitle>
        <div className="space-y-3">{[...bySession.values()].map((sets) => (
          <div key={sets[0].sessionId}><p className="mb-1 text-xs font-semibold text-muted">{formatDatePt(isoToLocalDate(sets[0].startedAt, tz), { day: 'numeric', month: 'long' })}</p>
            <p className="flex flex-wrap gap-1.5">{sets.map((s) => <span key={`${s.sessionId}-${s.setNumber}`} className="rounded-lg bg-surface2 px-2.5 py-1 text-sm tabular-nums">{s.weightKg != null ? `${fmtNum(s.weightKg, 2)}×` : ''}{s.reps}</span>)}</p></div>))}</div></Card>
    </div>
  );
}

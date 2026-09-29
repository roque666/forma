import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { withUser } from '@/lib/db/pool';
import { getDailyTotals } from '@/lib/services/nutrition';
import { periodStats, type DayRecord } from '@/lib/nutrition/diary';
import { addDays, endOfMonth, formatDatePt, rangeDays, startOfMonth, startOfWeek, todayInTz } from '@/lib/dates';
import { Card, CardTitle } from '@/components/ui/card';
import { EmptyState, ProgressBar, Stat } from '@/components/ui/feedback';
import { TrendChart } from '@/components/charts/trend-chart';
import { cn } from '@/components/ui/cn';
import { fmtNum } from '@/lib/labels';

export async function NutritionStats({ viewerId, studentId, tz, range, ref, href }: {
  viewerId: string; studentId: string; tz: string; range: 'week' | 'month'; ref: string; href: (range: 'week' | 'month', ref: string) => string;
}) {
  const from = range === 'week' ? startOfWeek(ref) : startOfMonth(ref);
  const to = range === 'week' ? addDays(from, 6) : endOfMonth(ref);
  const today = todayInTz(tz);
  const rows = await withUser(viewerId, (db) => getDailyTotals(db, studentId, from, to));
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const days = rangeDays(from, to);
  const records: DayRecord[] = rows.filter((r) => r.targetKcal).map((r) => ({
    date: r.date, totals: { kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, fiberG: r.fiberG },
    target: { kcal: r.targetKcal!, proteinG: r.targetProteinG ?? 0, carbsG: r.targetCarbsG ?? 0, fatG: r.targetFatG ?? 0 },
  }));
  const all = rows.map((r) => ({ kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG }));
  const logged = all.length;
  const avg = (k: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') => (logged ? Math.round(all.reduce((s, r) => s + r[k], 0) / logged) : 0);
  const ps = periodStats(records, { daysInPeriod: days.length });
  const targets = rows.map((r) => r.targetKcal).filter((v): v is number => v != null);
  const avgTarget = targets.length ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : null;
  const chart = days.map((d) => ({ label: range === 'week' ? formatDatePt(d, { weekday: 'short' }) : String(Number(d.slice(8))), kcal: byDate.get(d)?.kcal ?? 0, protein: byDate.get(d)?.proteinG ?? 0 }));
  const prev = range === 'week' ? addDays(from, -7) : addDays(from, -1);
  const next = addDays(to, 1);
  const title = range === 'week' ? `${formatDatePt(from)} – ${formatDatePt(to)}` : formatDatePt(from, { month: 'long', year: 'numeric' });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">{(['week', 'month'] as const).map((r) => <Link key={r} href={href(r, ref)} className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold', r === range ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted')}>{r === 'week' ? 'Semana' : 'Mês'}</Link>)}</div>
        <div className="flex items-center gap-1"><Link href={href(range, prev)} aria-label="Anterior" className="grid h-10 w-10 place-items-center rounded-xl bg-surface2"><ChevronLeft className="h-5 w-5" /></Link>
          <span className="min-w-32 text-center text-sm font-semibold capitalize">{title}</span>
          <Link href={href(range, next > today ? today : next)} aria-label="Seguinte" aria-disabled={next > today} className={cn('grid h-10 w-10 place-items-center rounded-xl bg-surface2', next > today && 'pointer-events-none opacity-40')}><ChevronRight className="h-5 w-5" /></Link></div>
      </div>
      {logged === 0 ? <EmptyState title="Sem registos neste período" description="Regista refeições no diário para veres médias e adesão ao objetivo." /> : (
        <>
          <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Média diária" value={fmtNum(avg('kcal'), 0)} unit="kcal" hint={avgTarget ? `objetivo ${fmtNum(avgTarget, 0)}` : undefined} />
            <Stat label="Proteína" value={fmtNum(avg('proteinG'), 0)} unit="g" />
            <Stat label="Hidratos" value={fmtNum(avg('carbsG'), 0)} unit="g" />
            <Stat label="Gordura" value={fmtNum(avg('fatG'), 0)} unit="g" />
          </Card>
          <Card><CardTitle>Calorias por dia</CardTitle>
            <TrendChart data={chart} type="bar" unit="kcal" series={[{ key: 'kcal', name: 'Calorias' }]} reference={avgTarget ? { y: avgTarget, label: 'objetivo' } : undefined} height={200} /></Card>
          <Card><CardTitle>Adesão ao objetivo</CardTitle>
            {records.length === 0 ? <p className="text-sm text-muted">Define um objetivo nutricional para ver a adesão.</p> : (
              <div className="space-y-3 text-sm">
                <div><div className="mb-1 flex justify-between"><span>Dias dentro do objetivo (±10%)</span><strong>{ps.daysWithin}/{ps.daysLogged}</strong></div><ProgressBar value={ps.daysWithin} max={Math.max(ps.daysLogged, 1)} tone="ok" label="Dias dentro do objetivo" /></div>
                <div><div className="mb-1 flex justify-between"><span>Dias com proteína ≥ 90% do objetivo</span><strong>{ps.daysProteinOnTarget}/{ps.daysLogged}</strong></div><ProgressBar value={ps.daysProteinOnTarget} max={Math.max(ps.daysLogged, 1)} tone="protein" label="Dias de proteína" /></div>
                <p className="text-muted">Acima: {ps.daysOver} · Abaixo: {ps.daysUnder} · Dias registados: {ps.daysLogged} de {days.length}</p>
              </div>)}</Card>
        </>
      )}
    </div>
  );
}

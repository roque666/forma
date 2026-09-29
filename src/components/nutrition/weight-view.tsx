import { Trash2, Scale } from 'lucide-react';
import { withUser } from '@/lib/db/pool';
import { getCurrentGoal, getWeightGoal, listWeights, type WeightRow } from '@/lib/services/nutrition';
import { compareWithGoal, goalProgress, movingAverage, weeklyAverages, weightTrendKgPerWeek } from '@/lib/body/weight';
import { deleteWeightAction } from '@/lib/actions/nutrition';
import { Card, CardTitle } from '@/components/ui/card';
import { Alert, Badge, EmptyState, ProgressBar, Stat } from '@/components/ui/feedback';
import { TrendChart } from '@/components/charts/trend-chart';
import { LogWeightForm, WeightGoalForm } from './weight-forms';
import { addDays, formatDatePt, todayInTz } from '@/lib/dates';
import { fmtNum, GOAL_LABELS } from '@/lib/labels';

const PACE_PT = {
  on_track: ['ok', 'Ritmo em linha com o objetivo'], faster: ['warn', 'A mudar mais depressa do que o previsto'], slower: ['warn', 'A mudar mais devagar do que o previsto'],
  opposite: ['danger', 'A tendência vai no sentido oposto ao objetivo'], insufficient_data: ['neutral', 'Ainda sem dados suficientes (mín. 3 registos em 7+ dias)'],
} as const;

export async function WeightView({ viewerId, studentId, tz, readOnly, coachGoalForm, entryExtra }: { viewerId: string; studentId: string; tz: string; readOnly?: boolean; coachGoalForm?: boolean; entryExtra?: (w: WeightRow) => React.ReactNode }) {
  const today = todayInTz(tz);
  const d = await withUser(viewerId, async (db) => ({ list: await listWeights(db, studentId), wGoal: await getWeightGoal(db, studentId), nGoal: await getCurrentGoal(db, studentId, today) }));
  const entries = d.list.map((w) => ({ date: w.date, weightKg: w.weightKg, bodyFatPct: w.bodyFatPct }));
  const ma = movingAverage(entries, 7);
  const trend = weightTrendKgPerWeek(entries, 28);
  const first = entries[0], last = entries[entries.length - 1];
  const weeks = weeklyAverages(entries).slice(-8).reverse();
  const gp = d.wGoal && last ? goalProgress({ startKg: d.wGoal.startWeightKg, currentKg: last.weightKg, targetKg: d.wGoal.targetWeightKg }) : null;
  const pace = d.nGoal ? compareWithGoal({ goal: d.nGoal.goalType, tdee: d.nGoal.tdee, caloriesTarget: d.nGoal.caloriesTarget, trendKgPerWeek: trend }) : null;
  const chart = ma.slice(-90).map((p) => ({ label: formatDatePt(p.date), peso: p.weightKg, media: p.average }));
  const weekAgo = entries.filter((e) => e.date <= addDays(today, -7)).pop();
  return (
    <div className="space-y-4">
      {!readOnly && <Card><CardTitle>Registar peso</CardTitle><LogWeightForm today={today} lastKg={last?.weightKg} /></Card>}
      {entries.length === 0 ? <EmptyState icon={<Scale className="h-8 w-8" />} title="Ainda sem registos de peso" description={readOnly ? 'O aluno ainda não registou o peso.' : 'Regista o teu peso para veres a evolução e a média semanal.'} /> : (
        <>
          <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Peso atual" value={fmtNum(last.weightKg, 1)} unit="kg" hint={formatDatePt(last.date)} />
            <Stat label="Média 7 dias" value={fmtNum(ma[ma.length - 1].average, 1)} unit="kg" />
            <Stat label="Desde o início" value={`${last.weightKg - first.weightKg > 0 ? '+' : ''}${fmtNum(last.weightKg - first.weightKg, 1)}`} unit="kg" hint={`de ${fmtNum(first.weightKg, 1)} kg`} />
            <Stat label="Tendência" value={trend == null ? '—' : `${trend > 0 ? '+' : ''}${fmtNum(trend, 2)}`} unit="kg/sem" hint={weekAgo ? `${last.weightKg - weekAgo.weightKg > 0 ? '+' : ''}${fmtNum(last.weightKg - weekAgo.weightKg, 1)} kg vs. há 7 dias` : undefined} />
          </Card>
          <Card><CardTitle>Evolução</CardTitle>
            <TrendChart data={chart} type="line" unit="kg" series={[{ key: 'peso', name: 'Peso' }, { key: 'media', name: 'Média 7 dias', dashed: true }]} reference={d.wGoal ? { y: d.wGoal.targetWeightKg, label: 'objetivo' } : undefined} /></Card>
        </>
      )}
      <Card>
        <CardTitle>Objetivo de peso</CardTitle>
        {gp && d.wGoal ? (
          <div className="mb-4 space-y-2">
            <div className="flex items-baseline justify-between"><p className="text-sm">{fmtNum(gp.startKg, 1)} kg → <strong>{fmtNum(gp.targetKg, 1)} kg</strong>{d.wGoal.targetDate && <span className="text-muted"> até {formatDatePt(d.wGoal.targetDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}</p>{gp.reached && <Badge tone="ok">Alcançado 🎉</Badge>}</div>
            <ProgressBar value={gp.percent} max={100} tone={gp.reached ? 'ok' : 'accent'} label="Progresso do objetivo de peso" />
            <p className="text-sm text-muted">{gp.percent}% · {gp.reached ? 'objetivo atingido' : `faltam ${fmtNum(Math.abs(gp.differenceToGoalKg), 1)} kg`} · evolução {gp.evolutionKg > 0 ? '+' : ''}{fmtNum(gp.evolutionKg, 1)} kg</p>
          </div>
        ) : <p className="mb-3 text-sm text-muted">{entries.length === 0 ? 'Regista primeiro o peso atual para definir um objetivo.' : 'Sem objetivo de peso definido.'}</p>}
        {(!readOnly || coachGoalForm) && entries.length > 0 && <WeightGoalForm studentId={coachGoalForm ? studentId : undefined} defaultTarget={d.wGoal?.targetWeightKg} defaultDate={d.wGoal?.targetDate} />}
      </Card>
      {pace && entries.length > 0 && (
        <Card><CardTitle>Peso vs. objetivo nutricional</CardTitle>
          <p className="mb-2 text-sm"><Badge>{GOAL_LABELS[d.nGoal!.goalType]}</Badge> ritmo previsto <strong>{pace.expectedKgPerWeek > 0 ? '+' : ''}{fmtNum(pace.expectedKgPerWeek, 2)} kg/sem</strong>{pace.actualKgPerWeek != null && <> · real <strong>{pace.actualKgPerWeek > 0 ? '+' : ''}{fmtNum(pace.actualKgPerWeek, 2)} kg/sem</strong></>}</p>
          <Alert tone={PACE_PT[pace.status][0] === 'ok' ? 'success' : PACE_PT[pace.status][0] === 'neutral' ? 'info' : 'warn'}>{PACE_PT[pace.status][1]}</Alert></Card>
      )}
      {weeks.length > 0 && (
        <Card><CardTitle>Médias semanais</CardTitle>
          <ul className="divide-y divide-line text-sm">{weeks.map((w) => (<li key={w.weekStart} className="flex justify-between py-2.5"><span className="text-muted">Semana de {formatDatePt(w.weekStart)} · {w.entries} {w.entries === 1 ? 'registo' : 'registos'}</span><strong className="tabular-nums">{fmtNum(w.avgWeightKg, 2)} kg</strong></li>))}</ul></Card>
      )}
      {d.list.length > 0 && (
        <Card><CardTitle>Registos</CardTitle>
          <ul className="divide-y divide-line">{[...d.list].reverse().slice(0, 30).map((w) => (
            <li key={w.id} className="py-2.5 text-sm"><div className="flex items-center justify-between gap-2">
              <span><strong className="tabular-nums">{fmtNum(w.weightKg, 2)} kg</strong>{w.bodyFatPct != null && <span className="text-muted"> · {fmtNum(w.bodyFatPct, 1)}% gordura</span>}{w.notes && <span className="block text-xs text-muted">{w.notes}</span>}</span>
              <span className="flex items-center gap-1 text-muted">{formatDatePt(w.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                {!readOnly && <form action={deleteWeightAction}><input type="hidden" name="id" value={w.id} /><button aria-label="Apagar registo" className="rounded-lg p-2 hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button></form>}</span></div>{entryExtra?.(w)}
            </li>))}</ul></Card>
      )}
    </div>
  );
}

import Link from 'next/link';
import { ClipboardList, Flame, Scale, Trophy, TrendingUp, Utensils, Dumbbell } from 'lucide-react';
import type { SessionUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getActivePlan } from '@/lib/data/plans';
import { getInProgressSession, getRecentPrEvents, getScheduleContext, listSessions } from '@/lib/data/sessions';
import { getCurrentGoal, getDailyTotals, getWeightGoal, listWeights } from '@/lib/services/nutrition';
import { myPendingInvites } from '@/lib/services/coach';
import { expectedSessionsPerWeek, resolveSchedule } from '@/lib/training/schedule';
import { dailyProgress } from '@/lib/nutrition/diary';
import { goalProgress } from '@/lib/body/weight';
import { addDays, isoToLocalDate, relativeDayLabel, todayInTz, weekdayShort, formatDatePt } from '@/lib/dates';
import { acceptInviteAction } from '@/lib/actions/coach';
import { Card, CardTitle, LinkCard, PageHeader } from '@/components/ui/card';
import { Alert, Badge, ProgressBar, Stat } from '@/components/ui/feedback';
import { Ring } from '@/components/ui/ring';
import { Button, LinkButton } from '@/components/ui/button';
import { StartWorkoutButton } from '@/components/training/start-button';
import { fmtNum, GOAL_LABELS, prValueText, PR_LABELS } from '@/lib/labels';

export async function StudentDashboard({ user }: { user: SessionUser }) {
  const today = todayInTz(user.timezone);
  const d = await withUser(user.id, async (db) => {
    const plan = await getActivePlan(db, user.id);
    return {
      plan, inProgress: await getInProgressSession(db, user.id), ctx: plan ? await getScheduleContext(db, user.id, today, user.timezone) : null,
      sessions: await listSessions(db, user.id, { limit: 30 }), prs: await getRecentPrEvents(db, user.id, 3), goal: await getCurrentGoal(db, user.id, today),
      totals: await getDailyTotals(db, user.id, addDays(today, -6), today), weights: await listWeights(db, user.id), wGoal: await getWeightGoal(db, user.id), invites: await myPendingInvites(db),
    };
  });
  const sched = d.plan && d.ctx ? resolveSchedule({ days: d.plan.days, today, ...d.ctx }) : null;
  const todayTotals = d.totals.find((t) => t.date === today);
  const target = d.goal ? { kcal: d.goal.caloriesTarget, proteinG: d.goal.proteinG, carbsG: d.goal.carbsG, fatG: d.goal.fatG } : null;
  const prog = target ? dailyProgress({ kcal: todayTotals?.kcal ?? 0, proteinG: todayTotals?.proteinG ?? 0, carbsG: todayTotals?.carbsG ?? 0, fatG: todayTotals?.fatG ?? 0, fiberG: null }, target) : null;
  const w = d.weights; const cur = w[w.length - 1]; const first = w[0];
  const wp = d.wGoal && cur ? goalProgress({ startKg: d.wGoal.startWeightKg, currentKg: cur.weightKg, targetKg: d.wGoal.targetWeightKg }) : null;
  const last = d.sessions[0];
  const weekStart = addDays(today, -6);
  const weekSessions = d.sessions.filter((s) => isoToLocalDate(s.startedAt, user.timezone) >= weekStart);
  const expected = d.plan ? expectedSessionsPerWeek(d.plan.days) : 0;
  const weekVolume = weekSessions.reduce((s, x) => s + x.volumeKg, 0);
  const loggedDays = d.totals.filter((t) => t.kcal > 0);
  const avgKcal = loggedDays.length ? Math.round(loggedDays.reduce((s, t) => s + t.kcal, 0) / loggedDays.length) : null;
  const todayDay = sched?.today ? d.plan!.days.find((x) => x.id === sched.today!.id) : null;
  const first_name = user.fullName.split(' ')[0];

  return (
    <>
      <PageHeader title={`Olá, ${first_name} 👋`} subtitle={formatDatePt(today, { weekday: 'long', day: 'numeric', month: 'long' })} />
      {d.invites.length > 0 && (
        <Alert tone="info" className="mb-4"><div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{d.invites[0].coachName}</strong> convidou-te para seres acompanhado.</span>
          <form action={acceptInviteAction}><input type="hidden" name="id" value={d.invites[0].linkId} /><Button type="submit" size="sm">Aceitar</Button></form></div></Alert>
      )}
      {d.inProgress && (
        <Link href={`/session/${d.inProgress.id}`} className="mb-4 flex items-center justify-between rounded-2xl bg-accent px-4 py-4 font-bold text-accent-fg shadow-card"><span>Treino em curso: {d.inProgress.dayName ?? 'Treino livre'}</span><span>Continuar →</span></Link>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        {/* Treino de hoje */}
        <Card>
          <CardTitle href="/workouts">Treino de hoje</CardTitle>
          {!d.plan ? (
            <div className="space-y-3"><div className="flex items-center gap-3 text-muted"><ClipboardList className="h-8 w-8" /><p className="text-sm">Ainda não tens plano ativo.</p></div>
              <div className="flex gap-2"><LinkButton href="/workouts/new" size="md">Criar plano</LinkButton><StartWorkoutButton label="Treino livre" variant="outline" size="md" /></div></div>
          ) : sched?.today ? (
            <div><div className="flex items-start justify-between gap-2"><div><p className="text-2xl font-bold">{sched.today.name}</p><p className="text-sm text-muted">{d.plan.name} · {todayDay?.exercises.length ?? 0} exercícios</p></div>{sched.doneToday && <Badge tone="ok">Feito ✓</Badge>}</div>
              <StartWorkoutButton dayId={sched.today.id} label={sched.doneToday ? 'Repetir treino' : 'Iniciar treino'} variant={sched.doneToday ? 'outline' : 'primary'} className="mt-4" /></div>
          ) : (
            <div><p className="text-xl font-bold">Dia de descanso</p><p className="text-sm text-muted">Recupera bem. Se quiseres, podes treinar na mesma:</p><div className="mt-3"><StartWorkoutButton label="Treino livre" variant="outline" size="md" /></div></div>
          )}
          {sched?.next && <p className="mt-3 border-t border-line pt-3 text-sm text-muted">Próximo treino: <strong className="text-fg">{sched.next.day.name}</strong>{sched.next.date && ` · ${weekdayShort(new Date(sched.next.date + 'T00:00:00Z').getUTCDay() || 7)} ${formatDatePt(sched.next.date)}`}</p>}
        </Card>

        {/* Calorias */}
        <LinkCard href="/nutrition">
          <CardTitle action={<Utensils className="h-4 w-4 text-muted" />}>Calorias de hoje</CardTitle>
          {!target ? (<div className="space-y-2"><p className="text-3xl font-bold tabular-nums">{fmtNum(todayTotals?.kcal ?? 0, 0)} <span className="text-sm font-medium text-muted">kcal</span></p><p className="text-sm text-muted">Define o teu objetivo para veres o que falta.</p><span className="text-sm font-semibold text-accent-text">Calcular objetivo →</span></div>) : (
            <div className="flex items-center gap-5">
              <Ring value={todayTotals?.kcal ?? 0} max={target.kcal} size={120} stroke={11} tone={prog!.kcal.over ? 'danger' : 'accent'}><div className="text-center"><p className="text-xl font-bold tabular-nums">{fmtNum(prog!.kcal.consumed, 0)}</p><p className="text-[11px] text-muted">/ {fmtNum(target.kcal, 0)}</p></div></Ring>
              <div className="min-w-0 flex-1 space-y-2"><p className="text-sm"><strong className={prog!.kcal.over ? 'text-danger' : ''}>{prog!.kcal.over ? `${fmtNum(-prog!.kcal.remaining, 0)} acima` : `${fmtNum(prog!.kcal.remaining, 0)} restantes`}</strong> <Badge>{GOAL_LABELS[d.goal!.goalType]}</Badge></p>
                <div><div className="mb-1 flex justify-between text-xs"><span>Proteína</span><span className="tabular-nums text-muted">{fmtNum(prog!.protein.consumed, 0)} / {fmtNum(prog!.protein.target, 0)} g</span></div><ProgressBar value={prog!.protein.consumed} max={prog!.protein.target} tone="protein" height="h-2" label="Proteína" /></div></div>
            </div>)}
        </LinkCard>

        {/* Peso */}
        <LinkCard href="/weight">
          <CardTitle action={<Scale className="h-4 w-4 text-muted" />}>Peso</CardTitle>
          {cur ? (<div className="space-y-2"><Stat label="Atual" value={fmtNum(cur.weightKg, 1)} unit="kg" hint={first && first !== cur ? `${cur.weightKg - first.weightKg > 0 ? '+' : ''}${fmtNum(cur.weightKg - first.weightKg, 1)} kg desde o início` : relativeDayLabel(cur.date, today)} />
            {wp && <div><ProgressBar value={wp.percent} max={100} tone={wp.reached ? 'ok' : 'accent'} label="Objetivo de peso" /><p className="mt-1 text-xs text-muted">{wp.reached ? 'Objetivo atingido 🎉' : `Faltam ${fmtNum(Math.abs(wp.differenceToGoalKg), 1)} kg para ${fmtNum(wp.targetKg, 1)} kg`}</p></div>}</div>)
            : <div className="space-y-2"><p className="text-sm text-muted">Ainda sem registos de peso.</p><span className="text-sm font-semibold text-accent-text">Registar peso →</span></div>}
        </LinkCard>

        {/* Último treino */}
        <LinkCard href={last ? `/session/${last.sessionId}` : '/history'}>
          <CardTitle action={<Dumbbell className="h-4 w-4 text-muted" />}>Último treino</CardTitle>
          {last ? (<div><p className="text-lg font-bold">{last.dayName ?? last.planName ?? 'Treino livre'}</p><p className="text-sm text-muted">{relativeDayLabel(isoToLocalDate(last.startedAt, user.timezone), today)} · {last.setsCompleted} séries · {fmtNum(last.volumeKg, 0)} kg de volume</p></div>)
            : <p className="text-sm text-muted">Ainda não concluíste nenhum treino.</p>}
        </LinkCard>

        {/* PRs */}
        <LinkCard href="/progress">
          <CardTitle action={<Trophy className="h-4 w-4 text-muted" />}>Últimos recordes</CardTitle>
          {d.prs.length ? <ul className="space-y-2 text-sm">{d.prs.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate"><Trophy className="mr-1 inline h-3.5 w-3.5 text-accent-text" />{p.exerciseName} <span className="text-xs text-muted">{PR_LABELS[p.prType]}</span></span><strong className="shrink-0 tabular-nums">{prValueText(p.prType, p.value, p.weightKg, p.reps)}</strong></li>)}</ul>
            : <p className="text-sm text-muted">Os recordes aparecem aqui quando superares um valor anterior.</p>}
        </LinkCard>

        {/* Resumo semanal */}
        <LinkCard href="/progress" className="lg:col-span-2">
          <CardTitle action={<TrendingUp className="h-4 w-4 text-muted" />}>Resumo dos últimos 7 dias</CardTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Treinos" value={`${weekSessions.length}${expected ? `/${expected}` : ''}`} hint={expected ? `${Math.min(100, Math.round((weekSessions.length / expected) * 100))}% do plano` : undefined} />
            <Stat label="Volume" value={fmtNum(weekVolume, 0)} unit="kg" />
            <Stat label="Média calorias" value={avgKcal ? fmtNum(avgKcal, 0) : '—'} unit="kcal" hint={loggedDays.length ? `${loggedDays.length} dias registados` : undefined} />
            <Stat label="Recordes" value={d.prs.filter((p) => isoToLocalDate(p.createdAt, user.timezone) >= weekStart).length} />
          </div>
        </LinkCard>
      </div>
    </>
  );
}

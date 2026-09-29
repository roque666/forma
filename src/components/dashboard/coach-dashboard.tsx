import { Activity, AlertTriangle, CalendarCheck, TrendingUp, Users } from 'lucide-react';
import type { SessionUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listStudentOverview } from '@/lib/data/coach';
import { getThresholds, withFollowUp } from '@/lib/services/coach';
import { FOLLOWUP_REASON_LABELS_PT } from '@/lib/coach/followup';
import { addDays, isoToLocalDate, relativeDayLabel, todayInTz } from '@/lib/dates';
import { Card, CardTitle, LinkCard, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState, ProgressBar, Stat } from '@/components/ui/feedback';
import { Avatar } from '@/components/ui/avatar';
import { LinkButton } from '@/components/ui/button';
import { fmtNum } from '@/lib/labels';
import Link from 'next/link';

export async function CoachDashboard({ user }: { user: SessionUser }) {
  const today = todayInTz(user.timezone);
  const weekStart = addDays(today, -6);
  const d = await withUser(user.id, async (db) => {
    const rows = await listStudentOverview(db);
    const thresholds = await getThresholds(db, user.id);
    const sessions = await db.query<{ studentId: string; startedAt: string; status: string }>(
      `select student_id as "studentId", started_at as "startedAt", status::text from public.workout_sessions
        where student_id <> $1 and status in ('completed','in_progress') and (started_at at time zone $2)::date >= $3::date`, [user.id, user.timezone, weekStart]);
    const expected = await db.query<{ studentId: string; expected: number }>(
      `select p.student_id as "studentId", coalesce(nullif(sum(cardinality(d.weekdays)), 0), least(count(d.id), 7))::int as expected
         from public.workout_plans p join public.workout_days d on d.plan_id = p.id where p.is_active and not p.is_template and p.archived_at is null and p.student_id is not null group by p.student_id`);
    const weights = await db.query<{ studentId: string; first: number; last: number }>(
      `select student_id as "studentId", (array_agg(weight_kg order by measured_on))[1] as first, (array_agg(weight_kg order by measured_on desc))[1] as last
         from public.body_metrics where measured_on >= $1::date - 30 and student_id <> $2 group by student_id having count(*) >= 2`, [today, user.id]);
    const prs = await db.one<{ n: number }>(`select count(distinct student_id) as n from public.pr_events where student_id <> $1 and created_at > now() - interval '30 days'`, [user.id]);
    return { rows, thresholds, sessions, expected, weights, prs: prs?.n ?? 0 };
  });
  const list = withFollowUp(d.rows, today, d.thresholds, user.timezone);
  const active = list.filter((r) => r.linkStatus === 'active');
  const activeIds = new Set(active.map((r) => r.studentId));
  const sess = d.sessions.filter((s) => activeIds.has(s.studentId));
  const todaySessions = sess.filter((s) => isoToLocalDate(s.startedAt, user.timezone) === today);
  const trainedToday = new Set(todaySessions.map((s) => s.studentId)).size;
  const trainedWeek = new Set(sess.filter((s) => s.status === 'completed').map((s) => s.studentId));
  const noActivity = active.filter((r) => r.followUp.status === 'inactive' || (!trainedWeek.has(r.studentId!) && r.followUp.status !== 'on_track'));
  const expectedMap = new Map(d.expected.map((e) => [e.studentId, e.expected]));
  const withPlan = active.filter((r) => expectedMap.has(r.studentId!));
  const totalExpected = withPlan.reduce((s, r) => s + expectedMap.get(r.studentId!)!, 0);
  const totalDone = withPlan.reduce((s, r) => s + Math.min(expectedMap.get(r.studentId!)!, sess.filter((x) => x.studentId === r.studentId && x.status === 'completed').length), 0);
  const adherence = totalExpected ? Math.round((totalDone / totalExpected) * 100) : null;
  const wDeltas = d.weights.filter((w) => activeIds.has(w.studentId)).map((w) => w.last - w.first);
  const avgDelta = wDeltas.length ? wDeltas.reduce((a, b) => a + b, 0) / wDeltas.length : null;
  const alerts = active.filter((r) => r.followUp.status === 'attention' || r.followUp.status === 'inactive');

  return (
    <>
      <PageHeader title={`Olá, ${user.fullName.split(' ')[0]} 👋`} subtitle="Visão geral dos teus alunos" actions={<LinkButton href="/students" variant="outline"><Users className="h-4 w-4" /> Meus alunos</LinkButton>} />
      {active.length === 0 ? <EmptyState icon={<Users className="h-8 w-8" />} title="Ainda não tens alunos" description="Convida um aluno por email ou cria-lhe uma conta para começares a acompanhar treinos, nutrição e peso." action={<LinkButton href="/students">Adicionar aluno</LinkButton>} /> : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-4">
          <LinkCard href="/students"><CardTitle action={<Users className="h-4 w-4 text-muted" />}>Alunos ativos</CardTitle><Stat label="Total" value={active.length} hint={list.length > active.length ? `${list.length - active.length} convite(s) pendente(s)` : undefined} /></LinkCard>
          <LinkCard href="/history"><CardTitle action={<CalendarCheck className="h-4 w-4 text-muted" />}>Treinos hoje</CardTitle><Stat label="Alunos que treinaram" value={trainedToday} hint={`${todaySessions.length} sessões`} /></LinkCard>
          <LinkCard href="/students"><CardTitle action={<Activity className="h-4 w-4 text-muted" />}>Treinaram esta semana</CardTitle><Stat label="Últimos 7 dias" value={`${trainedWeek.size}/${active.length}`} hint={noActivity.length ? `${noActivity.length} sem atividade` : 'todos ativos'} tone={noActivity.length ? 'warn' : 'ok'} /></LinkCard>
          <LinkCard href="/progress"><CardTitle action={<TrendingUp className="h-4 w-4 text-muted" />}>Evolução média</CardTitle><Stat label="Peso (30 dias)" value={avgDelta == null ? '—' : `${avgDelta > 0 ? '+' : ''}${fmtNum(avgDelta, 1)}`} unit="kg" hint={`${d.prs} aluno(s) com recordes`} /></LinkCard>
          <Card className="md:col-span-2 xl:col-span-4"><CardTitle>Adesão aos planos (últimos 7 dias)</CardTitle>
            {adherence == null ? <p className="text-sm text-muted">Sem planos ativos para calcular a adesão.</p> : (<div className="space-y-2"><div className="flex items-baseline justify-between"><span className="text-3xl font-bold tabular-nums">{adherence}%</span><span className="text-sm text-muted">{totalDone} de {totalExpected} treinos previstos</span></div><ProgressBar value={adherence} max={100} tone={adherence >= 75 ? 'ok' : adherence >= 40 ? 'warn' : 'danger'} label="Adesão" /></div>)}</Card>
          <Card className="md:col-span-2 xl:col-span-4"><CardTitle action={<AlertTriangle className="h-4 w-4 text-warn" />}>Alertas</CardTitle>
            {alerts.length === 0 ? <p className="text-sm text-muted">Sem alertas — os teus alunos estão em dia. 🎉</p> : (
              <ul className="divide-y divide-line">{alerts.map((r) => (
                <li key={r.linkId}><Link href={`/students/${r.studentId}`} className="flex items-center gap-3 py-3 hover:opacity-80"><Avatar name={r.fullName ?? '?'} src={r.avatarUrl} size={36} />
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.fullName}</p><p className="truncate text-xs text-muted">{r.followUp.status === 'inactive' ? 'Sem atividade recente' : r.followUp.reasons.map((x) => FOLLOWUP_REASON_LABELS_PT[x]).join(' · ')}</p></div>
                  <Badge tone={r.followUp.status === 'inactive' ? 'danger' : 'warn'}>{r.lastWorkoutAt ? relativeDayLabel(isoToLocalDate(r.lastWorkoutAt, user.timezone), today) : 'sem treinos'}</Badge></Link></li>))}</ul>)}</Card>
        </div>
      )}
    </>
  );
}

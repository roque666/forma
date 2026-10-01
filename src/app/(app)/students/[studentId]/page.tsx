import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getStudentProfile, listStudentOverview } from '@/lib/data/coach';
import { listPlans, listTemplates, listActivePlans, toCalPlans } from '@/lib/data/plans';
import { getRecentPrEvents, getScheduleContext, listExercisesWithHistory, listSessions } from '@/lib/data/sessions';
import { getCurrentGoal, getDailyTotals, listWeights } from '@/lib/services/nutrition';
import { getThresholds, listNotes, withFollowUp } from '@/lib/services/coach';
import { FOLLOWUP_LABELS_PT, FOLLOWUP_REASON_LABELS_PT } from '@/lib/coach/followup';
import { expectedForWeek, recurrenceLabel, resolveToday } from '@/lib/training/calendar';
import { addDays, startOfWeek, isValidYmd, isoToLocalDate, relativeDayLabel, todayInTz } from '@/lib/dates';
import { deleteNoteAction, endLinkAction } from '@/lib/actions/coach';
import { uuid } from '@/lib/validation/common';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardTitle, LinkCard, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState, ProgressBar, Stat } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { HistoryList } from '@/components/training/history-list';
import { ProgressOverview } from '@/components/training/progress-overview';
import { DiaryView } from '@/components/nutrition/diary-view';
import { NutritionStats } from '@/components/nutrition/nutrition-stats';
import { WeightView } from '@/components/nutrition/weight-view';
import { GoalForm } from '@/components/nutrition/goal-form';
import { CorrectMealItemForm, CorrectWeightForm, NoteForm } from '@/components/coach/correct-forms';
import { AssignTemplateForm } from '@/components/coach/assign-template-form';
import { cn } from '@/components/ui/cn';
import { fmtNum, GOAL_LABELS } from '@/lib/labels';
import { getNutritionProfile } from '@/lib/services/nutrition';

export const metadata = { title: 'Atleta' };

const TABS = [['summary', 'Resumo'], ['workouts', 'Treinos'], ['progress', 'Progressão'], ['nutrition', 'Nutrição'], ['weight', 'Peso'], ['history', 'Histórico']] as const;

export default async function StudentPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (user.role !== 'coach') redirect('/dashboard');
  const { studentId } = await params;
  const sp = await searchParams;
  if (!uuid.safeParse(studentId).success) notFound();
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'summary';
  const today = todayInTz(user.timezone);
  const base = await withUser(user.id, async (db) => ({
    student: await getStudentProfile(db, studentId),
    overview: (await listStudentOverview(db)).find((r) => r.studentId === studentId && r.linkStatus === 'active') ?? null,
    thresholds: await getThresholds(db, user.id),
  }));
  if (!base.student || !base.overview) notFound(); // sem vínculo ativo não há acesso (a RLS também o garante)
  const follow = withFollowUp([base.overview], today, base.thresholds, user.timezone)[0];
  const href = (t: string, extra = '') => `/students/${studentId}?tab=${t}${extra}`;
  const tone = { on_track: 'ok', attention: 'warn', inactive: 'danger', pending: 'neutral' } as const;

  return (
    <>
      <PageHeader title={base.student.fullName} back={{ href: '/students', label: 'Atletas' }}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={tone[follow.followUp.status]}>{FOLLOWUP_LABELS_PT[follow.followUp.status]}</Badge>{base.overview.inviteEmail}</span>}
        actions={<form action={endLinkAction}><input type="hidden" name="id" value={base.overview.linkId} /><ConfirmSubmit variant="ghost" confirmLabel="Terminar acompanhamento?">Terminar vínculo</ConfirmSubmit></form>} />
      <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Secções do atleta">
        {TABS.map(([k, label]) => <Link key={k} href={href(k)} aria-current={tab === k ? 'page' : undefined} className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-semibold', tab === k ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted hover:text-fg')}>{label}</Link>)}
        <Link href={`/students/${studentId}/photos`} className="shrink-0 rounded-full bg-surface2 px-4 py-2 text-sm font-semibold text-muted hover:text-fg">Fotos</Link>
      </nav>
      {tab === 'summary' && <Summary viewerId={user.id} studentId={studentId} tz={user.timezone} today={today} follow={follow} />}
      {tab === 'workouts' && <Workouts viewerId={user.id} studentId={studentId} name={base.student.fullName} />}
      {tab === 'progress' && <Progress viewerId={user.id} studentId={studentId} tz={user.timezone} />}
      {tab === 'nutrition' && <NutritionTab viewerId={user.id} studentId={studentId} tz={user.timezone} sp={sp} today={today} href={href} />}
      {tab === 'weight' && <WeightView viewerId={user.id} studentId={studentId} tz={user.timezone} readOnly coachGoalForm entryExtra={(w) => <CorrectWeightForm studentId={studentId} entry={w} />} />}
      {tab === 'history' && <History viewerId={user.id} studentId={studentId} tz={user.timezone} />}
    </>
  );
}

async function Summary({ viewerId, studentId, tz, today, follow }: { viewerId: string; studentId: string; tz: string; today: string; follow: ReturnType<typeof withFollowUp>[number] }) {
  const d = await withUser(viewerId, async (db) => {
    const plans = await listActivePlans(db, studentId);
    const sessions = await listSessions(db, studentId, { limit: 30 });
    return {
      plans, sessions, prs: await getRecentPrEvents(db, studentId, 5), notes: await listNotes(db, studentId),
      goal: await getCurrentGoal(db, studentId, today), totals: await getDailyTotals(db, studentId, today, today), weights: (await listWeights(db, studentId)).slice(-2),
      ctx: plans.length ? await getScheduleContext(db, studentId, today, tz) : null,
    };
  });
  const weekAgo = addDays(today, -6);
  const week = d.sessions.filter((s) => isoToLocalDate(s.startedAt, tz) >= weekAgo).length;
  const cal = toCalPlans(d.plans);
  const expected = expectedForWeek(cal, startOfWeek(today));
  const todayRes = resolveToday(cal, today, d.ctx ?? {});
  const t = d.totals[0];
  const w = d.weights;
  return (
    <div className="space-y-4">
      {follow.followUp.reasons.length > 0 && <Card className="border-warn/40"><CardTitle>Alertas</CardTitle><ul className="list-disc space-y-1 pl-5 text-sm">{follow.followUp.reasons.map((r) => <li key={r}>{FOLLOWUP_REASON_LABELS_PT[r]}</li>)}</ul></Card>}
      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Treinos (7 dias)" value={`${week}${expected ? `/${expected}` : ''}`} hint={expected ? `${Math.min(100, Math.round((week / expected) * 100))}% do plano` : 'sem plano'} />
        <Stat label="Último treino" value={d.sessions[0] ? relativeDayLabel(isoToLocalDate(d.sessions[0].startedAt, tz), today) : '—'} hint={d.sessions[0]?.dayName ?? undefined} />
        <Stat label="Peso" value={w.length ? fmtNum(w[w.length - 1].weightKg, 1) : '—'} unit="kg" hint={w.length === 2 ? `${w[1].weightKg - w[0].weightKg > 0 ? '+' : ''}${fmtNum(w[1].weightKg - w[0].weightKg, 1)} kg` : undefined} />
        <Stat label="Calorias hoje" value={t ? fmtNum(t.kcal, 0) : '0'} unit={d.goal ? `/ ${fmtNum(d.goal.caloriesTarget, 0)}` : 'kcal'} />
      </Card>
      {d.goal && t && <Card><div className="mb-1 flex justify-between text-sm"><span>{GOAL_LABELS[d.goal.goalType]}</span><span className="tabular-nums text-muted">P {fmtNum(t.proteinG, 0)}/{d.goal.proteinG} g</span></div><ProgressBar value={t.kcal} max={d.goal.caloriesTarget} label="Calorias de hoje" /></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardTitle href={`/students/${studentId}?tab=workouts`}>Planos no calendário</CardTitle>{d.plans.length > 0 ? <><ul className="space-y-1">{d.plans.map((p) => <li key={p.id}><Link href={`/workouts/${p.id}`} className="font-semibold hover:underline">{p.name}</Link> <span className="text-xs text-muted">· {recurrenceLabel(p.recurrence)}</span></li>)}</ul>{todayRes.entries.map((e) => <p key={e.day.id} className="mt-2 text-sm text-muted">Hoje: {e.day.name}{e.done && ' ✓'}</p>)}</> : <EmptyState title="Sem planos no calendário" description="Cria um plano ou atribui um modelo." action={<LinkButton href={`/students/${studentId}?tab=workouts`} variant="outline" size="sm">Ir para treinos</LinkButton>} />}</Card>
        <Card><CardTitle href={`/students/${studentId}?tab=progress`}>Últimos recordes</CardTitle>{d.prs.length === 0 ? <p className="text-sm text-muted">Ainda sem recordes.</p> : <ul className="space-y-1.5 text-sm">{d.prs.map((p) => <li key={p.id} className="flex justify-between gap-2"><span className="truncate">{p.exerciseName}</span><span className="shrink-0 text-muted">{relativeDayLabel(isoToLocalDate(p.createdAt, tz), today)}</span></li>)}</ul>}</Card>
      </div>
      <Card><CardTitle>Notas privadas</CardTitle>
        {d.notes.length > 0 && <ul className="mb-4 divide-y divide-line">{d.notes.map((n) => <li key={n.id} className="flex items-start justify-between gap-2 py-2 text-sm"><span><span className="block whitespace-pre-wrap">{n.body}</span><span className="text-xs text-muted">{relativeDayLabel(isoToLocalDate(n.createdAt, tz), today)}</span></span>
          <form action={deleteNoteAction.bind(null, studentId)}><input type="hidden" name="id" value={n.id} /><button aria-label="Apagar nota" className="rounded p-2 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button></form></li>)}</ul>}
        <NoteForm studentId={studentId} /></Card>
    </div>
  );
}

async function Workouts({ viewerId, studentId, name }: { viewerId: string; studentId: string; name: string }) {
  const d = await withUser(viewerId, async (db) => ({ plans: await listPlans(db, studentId, true), templates: await listTemplates(db, viewerId) }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <LinkButton href={`/workouts/new?student=${studentId}`}>Novo plano para {name.split(' ')[0]}</LinkButton>
        {d.templates.length > 0 && <div className="min-w-64 flex-1"><AssignTemplateForm studentId={studentId} templates={d.templates} /></div>}
      </div>
      {d.plans.length === 0 ? <EmptyState title="Este atleta ainda não tem planos" /> : <div className="grid gap-3 sm:grid-cols-2">{d.plans.map((p) => (
        <LinkCard key={p.id} href={`/workouts/${p.id}`} className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{p.name}</p><p className="text-xs text-muted">{p.daysCount} {p.daysCount === 1 ? 'dia' : 'dias'} · {p.exercisesCount} {p.exercisesCount === 1 ? 'exercício' : 'exercícios'}{p.createdByCoach ? ' · criado pelo coach' : ''}</p></div>
          <span className="flex gap-1">{p.isActive && <Badge tone="accent">Atual</Badge>}{p.archived && <Badge>Arquivado</Badge>}</span></LinkCard>))}</div>}
    </div>
  );
}

async function Progress({ viewerId, studentId, tz }: { viewerId: string; studentId: string; tz: string }) {
  const d = await withUser(viewerId, async (db) => ({ ex: await listExercisesWithHistory(db, studentId), prs: await getRecentPrEvents(db, studentId, 8) }));
  return <ProgressOverview exercises={d.ex} prs={d.prs} tz={tz} hrefFor={(id) => `/progress/${id}?student=${studentId}`} />;
}

async function History({ viewerId, studentId, tz }: { viewerId: string; studentId: string; tz: string }) {
  const items = await withUser(viewerId, (db) => listSessions(db, studentId, { limit: 40 }));
  return <HistoryList items={items} tz={tz} hrefFor={(id) => `/session/${id}`} />;
}

async function NutritionTab({ viewerId, studentId, tz, sp, today, href }: { viewerId: string; studentId: string; tz: string; sp: Record<string, string | undefined>; today: string; href: (t: string, extra?: string) => string }) {
  const view = sp.view === 'stats' ? 'stats' : sp.view === 'goal' ? 'goal' : 'diary';
  const sub = ([['diary', 'Diário'], ['stats', 'Estatísticas'], ['goal', 'Objetivo']] as const).map(([k, l]) => <Link key={k} href={href('nutrition', `&view=${k}`)} className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold', view === k ? 'bg-fg text-bg' : 'bg-surface2 text-muted')}>{l}</Link>);
  if (view === 'goal') {
    const d = await withUser(viewerId, async (db) => ({ profile: await getNutritionProfile(db, studentId), goal: await getCurrentGoal(db, studentId, today), w: (await listWeights(db, studentId)).slice(-1) }));
    return (<div className="space-y-4"><div className="flex gap-1.5">{sub}</div>
      {!d.profile && <p className="rounded-xl bg-surface2 px-3 py-2 text-sm">O atleta ainda não preencheu o perfil nutricional — completa os dados abaixo para calcular o objetivo.</p>}
      <GoalForm coachMode studentId={studentId} today={today} defaults={{ sex: d.profile?.sex ?? d.goal?.sex, birthDate: d.profile?.birthDate, heightCm: d.profile?.heightCm ?? d.goal?.heightCm, activityLevel: d.profile?.activityLevel ?? d.goal?.activityLevel, bmrFormula: d.profile?.bmrFormula, weightKg: d.w[0]?.weightKg ?? d.goal?.weightKg, bodyFatPct: d.goal?.bodyFatPct, goal: d.goal?.goalType }} /></div>);
  }
  if (view === 'stats') {
    const range = sp.range === 'month' ? 'month' : 'week';
    const ref = isValidYmd(sp.ref) ? sp.ref : today;
    return (<div className="space-y-4"><div className="flex gap-1.5">{sub}</div><NutritionStats viewerId={viewerId} studentId={studentId} tz={tz} range={range} refDate={ref} href={(r, d) => href('nutrition', `&view=stats&range=${r}&ref=${d}`)} /></div>);
  }
  const date = isValidYmd(sp.date) ? sp.date : today;
  return (<div className="space-y-4"><div className="flex gap-1.5">{sub}</div>
    <DiaryView viewerId={viewerId} studentId={studentId} date={date} tz={tz} readOnly hrefForDate={(d) => href('nutrition', `&date=${d}`)} goalsHref={href('nutrition', '&view=goal')} itemExtra={(it) => <CorrectMealItemForm studentId={studentId} item={it} />} /></div>);
}

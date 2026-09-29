import Link from 'next/link';
import { ClipboardList, Dumbbell, Plus, Play, Library } from 'lucide-react';
import { requireUser, type SessionUser } from '@/lib/auth/session';
import { withUser, type Db } from '@/lib/db/pool';
import { getActivePlan, listPlans, listTemplates, type PlanSummary } from '@/lib/data/plans';
import { getInProgressSession, getScheduleContext } from '@/lib/data/sessions';
import { resolveSchedule } from '@/lib/training/schedule';
import { todayInTz, weekdayShort, formatDatePt, relativeDayLabel } from '@/lib/dates';
import { Card, CardTitle, LinkCard, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { StartWorkoutButton } from '@/components/training/start-button';

export const metadata = { title: 'Treinos' };

function PlanRow({ p }: { p: PlanSummary }) {
  return (
    <LinkCard href={`/workouts/${p.id}`} className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{p.name}</p>
        <p className="text-xs text-muted">{p.daysCount} {p.daysCount === 1 ? 'dia' : 'dias'} · {p.exercisesCount} exercícios{p.createdByCoach && !p.isTemplate ? ` · por ${p.createdByName ?? 'coach'}` : ''}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {p.isActive && <Badge tone="accent">Atual</Badge>}
        {p.isTemplate && <Badge>Modelo</Badge>}
        {p.archived && <Badge>Arquivado</Badge>}
      </div>
    </LinkCard>
  );
}

async function StudentView({ user }: { user: SessionUser }) {
  const today = todayInTz(user.timezone);
  const data = await withUser(user.id, async (db: Db) => {
    const [active, plans, inProgress, ctx] = await Promise.all([
      getActivePlan(db, user.id), listPlans(db, user.id), getInProgressSession(db, user.id), getScheduleContext(db, user.id, today, user.timezone),
    ]);
    return { active, plans, inProgress, ctx };
  });
  const sched = data.active ? resolveSchedule({ days: data.active.days, today, ...data.ctx }) : null;
  const others = data.plans.filter((p) => !p.isActive);
  const dayInfo = (id: string) => data.active!.days.find((d) => d.id === id)!;
  return (
    <>
      <PageHeader title="Treinos" actions={<>
        <LinkButton href="/exercises" variant="outline"><Library className="h-4 w-4" /> Exercícios</LinkButton>
        <LinkButton href="/workouts/new" variant="secondary"><Plus className="h-4 w-4" /> Novo plano</LinkButton>
      </>} />
      {data.inProgress && (
        <Link href={`/session/${data.inProgress.id}`} className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-4 text-accent-fg shadow-card">
          <div><p className="text-xs font-semibold uppercase opacity-80">Treino em curso</p><p className="text-lg font-bold">{data.inProgress.dayName ?? data.inProgress.planName ?? 'Treino livre'}</p></div>
          <span className="inline-flex items-center gap-1 font-bold"><Play className="h-5 w-5" /> Continuar</span>
        </Link>
      )}
      {data.active && sched?.today ? (
        <Card className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{sched.doneToday ? 'Concluído hoje' : sched.mode === 'weekday' ? 'Treino de hoje' : 'Treino sugerido'}</p>
              <h2 className="truncate text-xl font-bold">{sched.today.name}</h2>
              <p className="text-sm text-muted">{data.active.name} · {dayInfo(sched.today.id).exercises.length} exercícios</p>
            </div>
            {sched.doneToday && <Badge tone="ok">Feito ✓</Badge>}
          </div>
          <StartWorkoutButton dayId={sched.today.id} label={sched.doneToday ? 'Repetir treino' : 'Iniciar treino'} variant={sched.doneToday ? 'outline' : 'primary'} className="mt-4" />
          {sched.next && <p className="mt-3 text-sm text-muted">Próximo: <strong className="text-fg">{sched.next.day.name}</strong>{sched.next.date && ` · ${relativeDayLabel(sched.next.date, today) === 'Hoje' ? 'hoje' : weekdayShort(new Date(sched.next.date + 'T00:00:00Z').getUTCDay() || 7)} ${formatDatePt(sched.next.date)}`}</p>}
        </Card>
      ) : data.active ? (
        <Card className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Hoje</p>
          <h2 className="text-lg font-bold">Dia de descanso</h2>
          {sched?.next && <p className="text-sm text-muted">Próximo treino: <strong className="text-fg">{sched.next.day.name}</strong>{sched.next.date && ` · ${weekdayShort(new Date(sched.next.date + 'T00:00:00Z').getUTCDay() || 7)} ${formatDatePt(sched.next.date)}`}</p>}
          <p className="mt-2 text-sm text-muted">Queres treinar mesmo assim? Escolhe um dia do plano ou faz um treino livre.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.active.days.map((d) => <StartWorkoutButton key={d.id} dayId={d.id} label={d.name} variant="outline" size="md" />)}
          </div>
        </Card>
      ) : (
        <div className="mb-4"><EmptyState icon={<ClipboardList className="h-8 w-8" />} title="Ainda não tens um plano ativo" description="Cria um plano com os teus dias e exercícios, ou pede ao teu coach. Podes também fazer um treino livre." action={<LinkButton href="/workouts/new">Criar plano</LinkButton>} /></div>
      )}
      <div className="mb-6"><StartWorkoutButton label="Treino livre (sem plano)" variant="secondary" size="md" /></div>

      {data.active && (<section className="mb-6"><CardTitle>Plano atual</CardTitle><PlanRow p={data.active} /></section>)}
      {others.length > 0 && (
        <section className="mb-6"><CardTitle>Outros planos</CardTitle><div className="grid gap-3 sm:grid-cols-2">{others.map((p) => <PlanRow key={p.id} p={p} />)}</div></section>
      )}
    </>
  );
}

async function CoachView({ user }: { user: SessionUser }) {
  const { templates, studentPlans } = await withUser(user.id, async (db) => ({
    templates: await listTemplates(db, user.id),
    studentPlans: await db.query<PlanSummary & { studentName: string }>(
      `select p.id, p.name, p.is_active as "isActive", p.is_template as "isTemplate", p.archived_at is not null as archived, p.student_id as "studentId", st.full_name as "studentName",
              (select count(*) from public.workout_days d where d.plan_id = p.id) as "daysCount", (select count(*) from public.plan_exercises pe where pe.plan_id = p.id) as "exercisesCount"
         from public.workout_plans p join public.profiles st on st.id = p.student_id
        where not p.is_template and p.archived_at is null order by st.full_name, p.is_active desc, p.updated_at desc`),
  }));
  return (
    <>
      <PageHeader title="Treinos" subtitle="Modelos reutilizáveis e planos dos teus alunos" actions={<>
        <LinkButton href="/exercises" variant="outline"><Library className="h-4 w-4" /> Exercícios</LinkButton>
        <LinkButton href="/workouts/new"><Plus className="h-4 w-4" /> Novo plano</LinkButton>
      </>} />
      <section className="mb-6">
        <CardTitle>Modelos</CardTitle>
        {templates.length === 0 ? <EmptyState icon={<Dumbbell className="h-8 w-8" />} title="Sem modelos" description="Cria um modelo (ex.: “Full body iniciante”) e atribui-o a vários alunos." action={<LinkButton href="/workouts/new?template=1" variant="outline">Criar modelo</LinkButton>} />
          : <div className="grid gap-3 sm:grid-cols-2">{templates.map((p) => <PlanRow key={p.id} p={p} />)}</div>}
      </section>
      <section>
        <CardTitle>Planos dos alunos</CardTitle>
        {studentPlans.length === 0 ? <EmptyState title="Ainda não há planos de alunos" description="Adiciona um aluno e cria-lhe um plano." action={<LinkButton href="/students" variant="outline">Ver alunos</LinkButton>} />
          : <div className="grid gap-3 sm:grid-cols-2">{studentPlans.map((p) => (
            <LinkCard key={p.id} href={`/workouts/${p.id}`} className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="truncate font-semibold">{p.name}</p><p className="truncate text-xs text-muted">{p.studentName} · {p.daysCount} {p.daysCount === 1 ? 'dia' : 'dias'} · {p.exercisesCount} {p.exercisesCount === 1 ? 'exercício' : 'exercícios'}</p></div>
              {p.isActive && <Badge tone="accent">Atual</Badge>}
            </LinkCard>))}</div>}
      </section>
    </>
  );
}

export default async function WorkoutsPage() {
  const user = await requireUser();
  return user.role === 'coach' ? <CoachView user={user} /> : <StudentView user={user} />;
}

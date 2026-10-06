import Link from 'next/link';
import { CalendarDays, Dumbbell, Plus, Play, Library } from 'lucide-react';
import { requireUser, type SessionUser } from '@/lib/auth/session';
import { withUser, type Db } from '@/lib/db/pool';
import { listActivePlans, listPlans, listTemplates, toCalPlans, type PlanSummary } from '@/lib/data/plans';
import { getInProgressSession, getScheduleContext } from '@/lib/data/sessions';
import { recurrenceLabel, resolveToday } from '@/lib/training/calendar';
import { listTodayActivities } from '@/lib/activities/activities';
import { TodayBody } from '@/components/training/today-card';
import { todayInTz } from '@/lib/dates';
import { Card, CardTitle, LinkCard, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { StartWorkoutButton } from '@/components/training/start-button';
import { applyTemplateAction } from '@/lib/actions/training';
import { SubmitButton } from '@/components/ui/form';

export const metadata = { title: 'Treinos' };

function PlanRow({ p }: { p: PlanSummary }) {
  return (
    <LinkCard href={`/workouts/${p.id}`} className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{p.name}</p>
        <p className="text-xs text-muted">{p.daysCount} {p.daysCount === 1 ? 'dia' : 'dias'} · {p.exercisesCount} exercícios{p.createdByCoach && !p.isTemplate ? ` · por ${p.createdByName ?? 'coach'}` : ''}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {p.isActive && <Badge tone="accent">{recurrenceLabel(p.recurrence)}</Badge>}
        {p.isTemplate && <Badge>Modelo</Badge>}
        {p.archived && <Badge>Arquivado</Badge>}
      </div>
    </LinkCard>
  );
}

async function StudentView({ user }: { user: SessionUser }) {
  const today = todayInTz(user.timezone);
  const data = await withUser(user.id, async (db: Db) => {
    const [active, plans, inProgress, ctx, templates] = await Promise.all([
      listActivePlans(db, user.id), listPlans(db, user.id), getInProgressSession(db, user.id), getScheduleContext(db, user.id, today, user.timezone),
      user.realRole === 'coach' ? listTemplates(db, user.id) : Promise.resolve([] as PlanSummary[]), // coach em "O meu treino" vê os seus modelos
    ]);
    return { active, plans, inProgress, ctx, templates, todayActs: await listTodayActivities(db, user.id, today) };
  });
  const todayRes = resolveToday(toCalPlans(data.active), today, data.ctx);
  const others = data.plans.filter((p) => !p.isActive);
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
      <Card className="mb-4"><CardTitle action={<LinkButton href="/calendar" variant="ghost" size="sm"><CalendarDays className="h-4 w-4" /> Calendário</LinkButton>}>Hoje</CardTitle><TodayBody result={todayRes} plans={data.active} activities={data.todayActs} today={today} /></Card>
      <div className="mb-6"><StartWorkoutButton label="Treino livre (sem plano)" variant="secondary" size="md" /></div>

      {data.active.length > 0 && (<section className="mb-6"><CardTitle>No calendário</CardTitle><div className="grid gap-3 sm:grid-cols-2">{data.plans.filter((p) => p.isActive).map((p) => <PlanRow key={p.id} p={p} />)}</div></section>)}
      {others.length > 0 && (
        <section className="mb-6"><CardTitle>Outros planos</CardTitle><div className="grid gap-3 sm:grid-cols-2">{others.map((p) => <PlanRow key={p.id} p={p} />)}</div></section>
      )}
      {data.templates.length > 0 && (
        <section className="mb-6">
          <CardTitle>Os meus modelos</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">{data.templates.map((p) => (
            <div key={p.id} className="space-y-2">
              <PlanRow p={p} />
              <form action={applyTemplateAction}><input type="hidden" name="id" value={p.id} /><SubmitButton variant="outline" size="md" className="w-full" pendingLabel="A copiar…">Usar como meu plano</SubmitButton></form>
            </div>))}
          </div>
          <p className="mt-2 text-xs text-muted">É criada uma cópia tua que entra no calendário (o modelo não muda). Ajusta a regularidade na página do plano.</p>
        </section>
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
        where not p.is_template and p.archived_at is null and p.student_id <> $1 order by st.full_name, p.is_active desc, p.updated_at desc`, [user.id]),
  }));
  return (
    <>
      <PageHeader title="Treinos" subtitle="Modelos reutilizáveis e planos dos teus atletas" actions={<>
        <LinkButton href="/exercises" variant="outline"><Library className="h-4 w-4" /> Exercícios</LinkButton>
        <LinkButton href="/workouts/new"><Plus className="h-4 w-4" /> Novo plano</LinkButton>
      </>} />
      <section className="mb-6">
        <CardTitle>Modelos</CardTitle>
        {templates.length === 0 ? <EmptyState icon={<Dumbbell className="h-8 w-8" />} title="Sem modelos" description="Cria um modelo (ex.: “Full body iniciante”) e atribui-o a vários atletas." action={<LinkButton href="/workouts/new?template=1" variant="outline">Criar modelo</LinkButton>} />
          : <div className="grid gap-3 sm:grid-cols-2">{templates.map((p) => <PlanRow key={p.id} p={p} />)}</div>}
      </section>
      <section>
        <CardTitle>Planos dos atletas</CardTitle>
        {studentPlans.length === 0 ? <EmptyState title="Ainda não há planos de atletas" description="Adiciona um atleta e cria-lhe um plano." action={<LinkButton href="/students" variant="outline">Ver atletas</LinkButton>} />
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

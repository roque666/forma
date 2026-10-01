import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listStudentOverview } from '@/lib/data/coach';
import { getDailyTotals } from '@/lib/services/nutrition';
import { isValidYmd, todayInTz } from '@/lib/dates';
import { DiaryView } from '@/components/nutrition/diary-view';
import { LinkButton } from '@/components/ui/button';
import { LinkCard, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState, ProgressBar } from '@/components/ui/feedback';
import { Avatar } from '@/components/ui/avatar';
import { fmtNum, GOAL_LABELS } from '@/lib/labels';

export const metadata = { title: 'Nutrição' };

export default async function NutritionPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser();
  const today = todayInTz(user.timezone);
  if (user.role === 'coach') {
    const { rows, totals } = await withUser(user.id, async (db) => {
      const rows = (await listStudentOverview(db)).filter((r) => r.studentId && r.linkStatus === 'active');
      const totals = new Map<string, Awaited<ReturnType<typeof getDailyTotals>>[number]>();
      for (const r of rows) { const t = await getDailyTotals(db, r.studentId!, today, today); if (t[0]) totals.set(r.studentId!, t[0]); }
      return { rows, totals };
    });
    return (
      <>
        <PageHeader title="Nutrição" subtitle="Consumo de hoje dos teus atletas" />
        {rows.length === 0 ? <EmptyState title="Ainda sem atletas" action={<LinkButton href="/students" variant="outline">Ir para atletas</LinkButton>} /> : (
          <div className="grid gap-3 sm:grid-cols-2">{rows.map((r) => {
            const t = totals.get(r.studentId!);
            return (
              <LinkCard key={r.linkId} href={`/students/${r.studentId}?tab=nutrition`}>
                <div className="mb-3 flex items-center gap-3"><Avatar name={r.fullName ?? '?'} src={r.avatarUrl} /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.fullName}</p><p className="text-xs text-muted">{r.goalType ? `${GOAL_LABELS[r.goalType]} · ${fmtNum(r.caloriesTarget, 0)} kcal/dia` : 'Sem objetivo definido'}</p></div>{!t && <Badge tone="warn">Sem registos hoje</Badge>}</div>
                {t && r.caloriesTarget && <><ProgressBar value={t.kcal} max={r.caloriesTarget} tone={t.kcal > r.caloriesTarget * 1.1 ? 'danger' : 'accent'} label="Calorias" /><p className="mt-1 text-xs text-muted tabular-nums">{fmtNum(t.kcal, 0)} / {fmtNum(r.caloriesTarget, 0)} kcal · P {fmtNum(t.proteinG, 0)} g</p></>}
              </LinkCard>);
          })}</div>)}
      </>
    );
  }
  const sp = await searchParams;
  const date = isValidYmd(sp.date) ? sp.date : today;
  return (
    <>
      <PageHeader title="Nutrição" actions={<LinkButton href="/nutrition/goals" variant="outline">Objetivo e calorias</LinkButton>} />
      <DiaryView viewerId={user.id} studentId={user.id} date={date} tz={user.timezone} hrefForDate={(d) => `/nutrition?date=${d}`} goalsHref="/nutrition/goals" />
    </>
  );
}

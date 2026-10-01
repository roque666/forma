import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getCurrentGoal, getNutritionProfile, listGoals, listWeights } from '@/lib/services/nutrition';
import { todayInTz, formatDatePt } from '@/lib/dates';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/feedback';
import { GoalForm } from '@/components/nutrition/goal-form';
import { fmtNum, GOAL_LABELS } from '@/lib/labels';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Objetivo nutricional' };

export default async function GoalsPage() {
  const user = await requireUser();
  if (user.role === 'coach') redirect('/nutrition');
  const today = todayInTz(user.timezone);
  const d = await withUser(user.id, async (db) => ({
    profile: await getNutritionProfile(db, user.id), goal: await getCurrentGoal(db, user.id, today), history: await listGoals(db, user.id, 10),
    weights: (await listWeights(db, user.id)).slice(-1),
  }));
  return (
    <>
      <PageHeader title="Objetivo nutricional" back={{ href: '/nutrition', label: 'Nutrição' }} subtitle={d.goal ? `Atual: ${GOAL_LABELS[d.goal.goalType]} · ${fmtNum(d.goal.caloriesTarget, 0)} kcal` : 'Calcula as tuas calorias e macros'} />
      <GoalForm today={today} relaxed={user.realRole === 'coach'} defaults={{
        sex: d.profile?.sex, birthDate: d.profile?.birthDate, heightCm: d.profile?.heightCm, activityLevel: d.profile?.activityLevel, bmrFormula: d.profile?.bmrFormula,
        weightKg: d.weights[0]?.weightKg ?? d.goal?.weightKg, bodyFatPct: d.goal?.bodyFatPct, goal: d.goal?.goalType,
      }} />
      {d.history.length > 0 && (
        <Card className="mt-6"><CardTitle>Histórico de objetivos</CardTitle>
          <ul className="divide-y divide-line">{d.history.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div><p className="font-semibold">{GOAL_LABELS[g.goalType]} · {fmtNum(g.caloriesTarget, 0)} kcal {g.isManualOverride && <Badge tone="warn">manual</Badge>}</p>
                <p className="text-xs text-muted">Desde {formatDatePt(g.validFrom, { day: 'numeric', month: 'long', year: 'numeric' })} · definido por {g.setByName ?? '—'} · P {g.proteinG} · H {g.carbsG} · G {g.fatG}{g.note ? ` · ${g.note}` : ''}</p></div>
            </li>))}</ul></Card>
      )}
    </>
  );
}

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getCurrentGoal, listPantryFoods } from '@/lib/services/nutrition';
import { todayInTz } from '@/lib/dates';
import { PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { PlanGenerator } from '@/components/nutrition/plan-generator';

export const metadata = { title: 'Gerar refeições' };

export default async function GeneratePage() {
  const user = await requireUser();
  if (user.role !== 'student') redirect('/nutrition');
  const d = await withUser(user.id, async (db) => ({ goal: await getCurrentGoal(db, user.id, todayInTz(user.timezone)), pantry: (await listPantryFoods(db, user.id)).length }));
  return (
    <>
      <PageHeader title="Gerar refeições" back={{ href: '/nutrition/plans', label: 'Planos' }} subtitle="Com os alimentos da tua despensa, a bater as macros diárias" />
      {!d.goal ? <EmptyState title="Define primeiro o teu objetivo" description="Precisamos das tuas calorias e macros diárias." action={<LinkButton href="/nutrition/goals">Definir objetivo</LinkButton>} />
        : d.pantry < 3 ? <EmptyState title="Despensa quase vazia" description={`Tens ${d.pantry} alimentos. Adiciona pelo menos 3 (idealmente com proteína, hidratos e gordura).`} action={<LinkButton href="/nutrition/pantry">Abrir despensa</LinkButton>} />
        : <PlanGenerator target={{ kcal: d.goal.caloriesTarget, proteinG: d.goal.proteinG, carbsG: d.goal.carbsG, fatG: d.goal.fatG }} />}
    </>
  );
}

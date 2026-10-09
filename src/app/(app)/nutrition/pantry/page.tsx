import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listFoodCategories, listPantryFoods } from '@/lib/services/nutrition';
import { PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { NutritionTabs } from '@/components/nutrition/nutrition-tabs';
import { PantryManager } from '@/components/nutrition/pantry-manager';

export const metadata = { title: 'Despensa' };

export default async function PantryPage() {
  const user = await requireUser();
  if (user.role !== 'student') redirect('/nutrition');
  const d = await withUser(user.id, async (db) => ({ foods: await listPantryFoods(db, user.id), cats: await listFoodCategories(db) }));
  return (
    <>
      <PageHeader title="Nutrição" subtitle="Os alimentos que tens em casa" actions={d.foods.length >= 3 ? <LinkButton href="/nutrition/plans/generate">Gerar refeições</LinkButton> : undefined} />
      <NutritionTabs active="pantry" />
      <PantryManager initial={d.foods} categories={d.cats} />
    </>
  );
}

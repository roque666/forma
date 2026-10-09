import { redirect } from 'next/navigation';
import { Star } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listSavedMeals, recentFoods, searchFoods } from '@/lib/services/nutrition';
import { isValidYmd, todayInTz } from '@/lib/dates';
import { MEAL_TYPES, fmtNum } from '@/lib/labels';
import { Card, PageHeader } from '@/components/ui/card';
import { FoodBasket } from '@/components/nutrition/food-basket';
import { ApplySavedForm } from '@/components/nutrition/diary-forms';

export const metadata = { title: 'Adicionar alimento' };

export default async function AddFoodPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (user.role !== 'student') redirect('/nutrition');
  const sp = await searchParams;
  const date = isValidYmd(sp.date) ? sp.date : todayInTz(user.timezone);
  const type = sp.type && MEAL_TYPES.includes(sp.type) ? sp.type : 'lunch';
  const data = await withUser(user.id, async (db) => ({
    results: await searchFoods(db, ''),
    recent: await recentFoods(db, user.id),
    saved: await listSavedMeals(db),
  }));
  return (
    <>
      <PageHeader title="Adicionar alimentos" back={{ href: `/nutrition?date=${date}`, label: 'Diário' }} subtitle={date} />
      {data.saved.length > 0 && (
        <details className="mb-4 rounded-2xl border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Refeições favoritas ({data.saved.length})</summary>
          <div className="mt-3 space-y-2">{data.saved.map((s) => (
            <Card key={s.id} className="p-3 sm:p-3">
              <p className="mb-2 flex items-center gap-1 font-semibold">{s.isFavorite && <Star className="h-4 w-4 fill-accent text-accent-text" />}{s.name}<span className="ml-auto text-xs font-normal text-muted">{s.itemsCount} itens · {fmtNum(s.kcal, 0)} kcal · P {fmtNum(s.proteinG, 0)}</span></p>
              <ApplySavedForm savedId={s.id} date={date} defaultType={type} />
            </Card>))}</div></details>
      )}
      <FoodBasket date={date} initialType={type} recent={data.recent} initial={data.results} />
    </>
  );
}

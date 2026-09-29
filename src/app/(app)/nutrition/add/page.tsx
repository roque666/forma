import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Search, Star } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listSavedMeals, recentFoods, searchFoods } from '@/lib/services/nutrition';
import { isValidYmd, todayInTz } from '@/lib/dates';
import { MEAL_TYPE_LABELS, MEAL_TYPES, fmtNum } from '@/lib/labels';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { inputCls } from '@/components/ui/styles';
import { FoodPick } from '@/components/nutrition/food-pick';
import { ApplySavedForm } from '@/components/nutrition/diary-forms';
import { cn } from '@/components/ui/cn';

export const metadata = { title: 'Adicionar alimento' };

export default async function AddFoodPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (user.role !== 'student') redirect('/nutrition');
  const sp = await searchParams;
  const date = isValidYmd(sp.date) ? sp.date : todayInTz(user.timezone);
  const type = sp.type && MEAL_TYPES.includes(sp.type) ? sp.type : 'lunch';
  const q = (sp.q ?? '').trim();
  const data = await withUser(user.id, async (db) => ({
    results: await searchFoods(db, q),
    recent: q ? [] : await recentFoods(db, user.id),
    saved: q ? [] : await listSavedMeals(db),
  }));
  const typeHref = (t: string) => `/nutrition/add?type=${t}&date=${date}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  return (
    <>
      <PageHeader title="Adicionar alimento" back={{ href: `/nutrition?date=${date}`, label: 'Diário' }} subtitle={`${MEAL_TYPE_LABELS[type]} · ${date}`} />
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {MEAL_TYPES.map((t) => <Link key={t} href={typeHref(t)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold', t === type ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted')}>{MEAL_TYPE_LABELS[t]}</Link>)}
      </div>
      <form role="search" className="mb-4 flex gap-2">
        <input type="hidden" name="type" value={type} /><input type="hidden" name="date" value={date} />
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
          <input name="q" defaultValue={q} placeholder="Pesquisar alimento… (ex.: frango, arroz)" className={cn(inputCls, 'h-12 pl-9')} aria-label="Pesquisar alimento" autoFocus /></div>
        <button className="rounded-xl bg-accent px-5 font-semibold text-accent-fg">Pesquisar</button>
      </form>
      {data.saved.length > 0 && (
        <section className="mb-4"><CardTitle>Refeições favoritas</CardTitle>
          <div className="space-y-2">{data.saved.map((s) => (
            <Card key={s.id} className="p-3 sm:p-3">
              <p className="mb-2 flex items-center gap-1 font-semibold">{s.isFavorite && <Star className="h-4 w-4 fill-accent text-accent-text" />}{s.name}<span className="ml-auto text-xs font-normal text-muted">{s.itemsCount} itens · {fmtNum(s.kcal, 0)} kcal · P {fmtNum(s.proteinG, 0)}</span></p>
              <ApplySavedForm savedId={s.id} date={date} defaultType={type} />
            </Card>))}</div></section>
      )}
      {data.recent.length > 0 && (
        <section className="mb-4"><CardTitle>Usados recentemente</CardTitle><Card className="p-2 sm:p-2"><ul className="divide-y divide-line">{data.recent.map((f) => <FoodPick key={f.id} food={f} date={date} mealType={type} />)}</ul></Card></section>
      )}
      <section>
        <CardTitle action={<LinkButton href="/nutrition/foods/new" size="sm" variant="ghost">+ Criar alimento</LinkButton>}>{q ? `Resultados para “${q}”` : 'Alimentos'}</CardTitle>
        {data.results.length === 0 ? <EmptyState title="Nenhum alimento encontrado" description="Experimenta outro termo ou cria o teu próprio alimento." action={<LinkButton href="/nutrition/foods/new" variant="outline">Criar alimento</LinkButton>} />
          : <Card className="p-2 sm:p-2"><ul className="divide-y divide-line">{data.results.map((f) => <FoodPick key={f.id} food={f} date={date} mealType={type} />)}</ul></Card>}
        <p className="mt-3 text-xs text-muted">Os valores da base inicial são aproximados (por 100 g/ml). Confirma no rótulo quando precisares de precisão.</p>
      </section>
    </>
  );
}

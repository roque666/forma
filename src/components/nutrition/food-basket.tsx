'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { addMealItemsAction, searchFoodsAction } from '@/lib/actions/nutrition';
import { scaleFood, sumNutrients } from '@/lib/nutrition/diary';
import type { FoodRow } from '@/lib/services/nutrition';
import { MEAL_TYPE_LABELS, MEAL_TYPES, fmtNum } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { inputCls } from '@/components/ui/styles';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';

interface Entry { food: FoodRow; qty: string; unit: string } // unit: 'g' | 'ml' | 's:<id>'

function defaults(food: FoodRow): { qty: string; unit: string } {
  const s = food.servings[0];
  if (s) return { qty: '1', unit: `s:${s.id}` };
  return { qty: '100', unit: food.densityGPerMl ? 'ml' : 'g' };
}
function nutrients(e: Entry) {
  const q = Number(e.qty.replace(',', '.'));
  if (!(q > 0)) return null;
  const serving = e.unit.startsWith('s:') ? e.food.servings.find((s) => s.id === e.unit.slice(2)) : undefined;
  try { return scaleFood(e.food, serving ? { quantity: q, unit: 'unit', gramsPerUnit: serving.grams } : { quantity: q, unit: e.unit as 'g' | 'ml' }); } catch { return null; }
}

/** Escolher vários alimentos (um toque cada), acertar quantidades e adicionar tudo à refeição de uma vez. */
export function FoodBasket({ date, initialType, recent, initial }: { date: string; initialType: string; recent: FoodRow[]; initial: FoodRow[] }) {
  const [type, setType] = useState(initialType);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<FoodRow[]>(initial);
  const [searching, setSearching] = useState(false);
  const [basket, setBasket] = useState<Entry[]>([]);
  const [open, setOpen] = useState<string | null>(null); // alimento com o editor de quantidade aberto
  const [pending, start] = useTransition();
  const reqId = useRef(0);
  const router = useRouter();
  const toast = useToast();

  // pesquisa ao escrever (com pequena espera); ignora respostas antigas
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults(initial); setSearching(false); return; }
    const id = ++reqId.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try { const r = await searchFoodsAction(term); if (id === reqId.current) setResults(r); }
      catch { if (id === reqId.current) toast.error('Não foi possível pesquisar agora.'); }
      finally { if (id === reqId.current) setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const inBasket = (id: string) => basket.find((e) => e.food.id === id);
  const toggle = (food: FoodRow) => {
    if (inBasket(food.id)) { setOpen(open === food.id ? null : food.id); return; }
    setBasket((b) => [...b, { food, ...defaults(food) }]);
    setOpen(food.id);
  };
  const patch = (id: string, p: Partial<Entry>) => setBasket((b) => b.map((e) => (e.food.id === id ? { ...e, ...p } : e)));
  const remove = (id: string) => { setBasket((b) => b.filter((e) => e.food.id !== id)); if (open === id) setOpen(null); };

  const calc = useMemo(() => basket.map(nutrients), [basket]);
  const valid = basket.length > 0 && calc.every(Boolean);
  const total = useMemo(() => sumNutrients(calc.filter((x): x is NonNullable<typeof x> => !!x)), [calc]);

  const submit = () => start(async () => {
    const r = await addMealItemsAction({
      logDate: date, mealType: type,
      items: basket.map((e) => {
        const serving = e.unit.startsWith('s:') ? e.food.servings.find((s) => s.id === e.unit.slice(2)) : undefined;
        return { foodId: e.food.id, quantity: e.qty, unit: serving ? 'unit' : e.unit, gramsPerUnit: serving?.grams };
      }),
    });
    if (r.ok) { toast.success(r.message ?? 'Adicionado.'); setBasket([]); router.push(`/nutrition?date=${date}`); router.refresh(); } else toast.error(r.error);
  });

  const row = (f: FoodRow) => {
    const e = inBasket(f.id);
    const idx = basket.findIndex((x) => x.food.id === f.id);
    const n = idx >= 0 ? calc[idx] : null;
    const isLiquid = f.densityGPerMl != null;
    return (
      <li key={f.id} className="py-1" data-testid="food-row">
        <button type="button" onClick={() => toggle(f)} aria-pressed={!!e} className={cn('flex w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left hover:bg-surface2', e && 'bg-accent/10')}>
          <span className="min-w-0"><span className="block truncate font-medium">{f.name}{f.brand && <span className="text-muted"> · {f.brand}</span>}</span>
            <span className="text-xs text-muted">{e && n ? <><strong className="text-fg">{e.qty} {e.unit.startsWith('s:') ? f.servings.find((s) => s.id === e.unit.slice(2))?.label ?? '' : e.unit}</strong> · {fmtNum(n.kcal, 0)} kcal · P {fmtNum(n.proteinG, 0)}</>
              : <>{fmtNum(f.kcal100g, 0)} kcal · P {fmtNum(f.protein100g, 0)} · H {fmtNum(f.carbs100g, 0)} · G {fmtNum(f.fat100g, 0)} <span className="opacity-70">/100{isLiquid ? ' ml' : ' g'}</span></>}</span></span>
          {e ? <Check className="h-5 w-5 shrink-0 text-accent-text" aria-label="No cesto" /> : <Plus className="h-5 w-5 shrink-0 text-accent-text" aria-label="Adicionar ao cesto" />}
        </button>
        {e && open === f.id && (
          <div className="mx-2 mb-2 grid grid-cols-[1fr_1.4fr_auto] items-end gap-2 rounded-xl bg-surface2 p-3">
            <label className="space-y-1"><span className="text-xs font-medium">Quantidade</span>
              <input inputMode="decimal" value={e.qty} onChange={(ev) => patch(f.id, { qty: ev.target.value })} className={inputCls} aria-label={`Quantidade de ${f.name}`} autoFocus onFocus={(ev) => ev.currentTarget.select()} /></label>
            <label className="space-y-1"><span className="text-xs font-medium">Unidade</span>
              <select value={e.unit} onChange={(ev) => patch(f.id, { unit: ev.target.value, ...(ev.target.value.startsWith('s:') ? { qty: '1' } : {}) })} className={inputCls} aria-label={`Unidade de ${f.name}`}>
                <option value="g">gramas (g)</option>{isLiquid && <option value="ml">mililitros (ml)</option>}
                {f.servings.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.label} ({fmtNum(s.grams, 0)} g)</option>)}
              </select></label>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${f.name}`} onClick={() => remove(f.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        )}
      </li>
    );
  };

  const showRecent = !q.trim() && recent.length > 0;
  return (
    <>
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Refeição">
        {MEAL_TYPES.map((t) => <button key={t} type="button" onClick={() => setType(t)} aria-pressed={t === type} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold', t === type ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted')}>{MEAL_TYPE_LABELS[t]}</button>)}
      </div>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar alimento… (ex.: frango, arroz)" className={cn(inputCls, 'h-12 pl-9 pr-9')} aria-label="Pesquisar alimento" autoComplete="off" autoFocus />
        {searching && <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-muted" aria-label="A pesquisar" />}
      </div>
      {showRecent && (
        <section className="mb-4"><CardTitle>Usados recentemente</CardTitle><Card className="p-2 sm:p-2"><ul className="divide-y divide-line">{recent.map(row)}</ul></Card></section>
      )}
      <section>
        <CardTitle action={<LinkButton href="/nutrition/foods/new" size="sm" variant="ghost">+ Criar alimento</LinkButton>}>{q.trim() ? `Resultados para “${q.trim()}”` : 'Alimentos'}</CardTitle>
        {results.length === 0 ? <EmptyState title="Nenhum alimento encontrado" description="Experimenta outro termo ou cria o teu próprio alimento." action={<LinkButton href="/nutrition/foods/new" variant="outline">Criar alimento</LinkButton>} />
          : <Card className="p-2 sm:p-2"><ul className="divide-y divide-line">{results.map(row)}</ul></Card>}
        <p className="mt-3 text-xs text-muted">Toca em vários alimentos para os juntar à refeição e acerta as quantidades. Os valores da base inicial são aproximados (por 100 g/ml); confirma no rótulo quando precisares de precisão.</p>
      </section>

      {basket.length > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-30 px-4 md:bottom-4" data-testid="basket-bar">
          <div className="mx-auto max-w-5xl rounded-2xl border border-line bg-surface p-3 shadow-card">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold">{basket.length} {basket.length === 1 ? 'alimento' : 'alimentos'} · {MEAL_TYPE_LABELS[type]}</span>
              <span className="tabular-nums text-muted"><strong className="text-fg">{fmtNum(total.kcal, 0)}</strong> kcal · P {fmtNum(total.proteinG, 0)} · H {fmtNum(total.carbsG, 0)} · G {fmtNum(total.fatG, 0)}</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => { setBasket([]); setOpen(null); }} disabled={pending}>Limpar</Button>
              <Button type="button" size="lg" className="flex-1" disabled={!valid || pending} onClick={submit}>{pending ? 'A adicionar…' : `Adicionar ${basket.length} ao diário`}</Button>
            </div>
            {!valid && <p className="mt-1 text-xs text-warn">Confirma as quantidades (têm de ser maiores que zero).</p>}
          </div>
        </div>
      )}
    </>
  );
}

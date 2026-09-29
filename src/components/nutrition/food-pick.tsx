'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { addMealItemAction } from '@/lib/actions/nutrition';
import { scaleFood } from '@/lib/nutrition/diary';
import type { FoodRow } from '@/lib/services/nutrition';
import { Button } from '@/components/ui/button';
import { inputCls } from '@/components/ui/styles';
import { useToast } from '@/components/ui/toast';
import { fmtNum } from '@/lib/labels';
import { cn } from '@/components/ui/cn';

/** Cartão de alimento: toca, escolhe a quantidade (g / ml / porção) e vê os macros a atualizar em tempo real. */
export function FoodPick({ food, date, mealType }: { food: FoodRow; date: string; mealType: string }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('100');
  const [unit, setUnit] = useState<string>(food.densityGPerMl ? 'ml' : 'g');
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const isLiquid = food.densityGPerMl != null;
  const serving = unit.startsWith('s:') ? food.servings.find((s) => s.id === unit.slice(2)) : undefined;
  const n = useMemo(() => {
    const q = Number(qty.replace(',', '.'));
    if (!(q > 0)) return null;
    try {
      return scaleFood(food, serving ? { quantity: q, unit: 'unit', gramsPerUnit: serving.grams } : { quantity: q, unit: unit as 'g' | 'ml' });
    } catch { return null; }
  }, [qty, unit, serving, food]);

  const add = () => start(async () => {
    const r = await addMealItemAction({ foodId: food.id, logDate: date, mealType, quantity: qty, unit: serving ? 'unit' : unit, gramsPerUnit: serving?.grams });
    if (r.ok) { toast.success(`${food.name} adicionado.`); router.push(`/nutrition?date=${date}`); router.refresh(); } else toast.error(r.error);
  });

  return (
    <li className="py-1">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left hover:bg-surface2">
        <span className="min-w-0"><span className="block truncate font-medium">{food.name}{food.brand && <span className="text-muted"> · {food.brand}</span>}</span>
          <span className="text-xs text-muted">{fmtNum(food.kcal100g, 0)} kcal · P {fmtNum(food.protein100g, 0)} · H {fmtNum(food.carbs100g, 0)} · G {fmtNum(food.fat100g, 0)} <span className="opacity-70">/100{isLiquid ? ' ml' : ' g'}</span></span></span>
        <Plus className={cn('h-5 w-5 shrink-0 text-accent-text transition', open && 'rotate-45')} />
      </button>
      {open && (
        <div className="mx-2 mb-2 space-y-3 rounded-xl bg-surface2 p-3">
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <label className="space-y-1"><span className="text-xs font-medium">Quantidade</span>
              <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} aria-label="Quantidade" autoFocus /></label>
            <label className="space-y-1"><span className="text-xs font-medium">Unidade</span>
              <select value={unit} onChange={(e) => { setUnit(e.target.value); if (e.target.value.startsWith('s:')) setQty('1'); }} className={inputCls} aria-label="Unidade">
                <option value="g">gramas (g)</option>{isLiquid && <option value="ml">mililitros (ml)</option>}
                {food.servings.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.label} ({fmtNum(s.grams, 0)} g)</option>)}
              </select></label>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-sm tabular-nums" aria-live="polite">
            <div><p className="text-lg font-bold">{n ? fmtNum(n.kcal, 0) : '—'}</p><p className="text-[11px] uppercase text-muted">kcal</p></div>
            <div><p className="font-semibold text-protein">{n ? fmtNum(n.proteinG, 1) : '—'}</p><p className="text-[11px] uppercase text-muted">Prot.</p></div>
            <div><p className="font-semibold text-carbs">{n ? fmtNum(n.carbsG, 1) : '—'}</p><p className="text-[11px] uppercase text-muted">Hidr.</p></div>
            <div><p className="font-semibold text-fat">{n ? fmtNum(n.fatG, 1) : '—'}</p><p className="text-[11px] uppercase text-muted">Gord.</p></div>
          </div>
          <Button size="lg" className="w-full" disabled={!n || pending} onClick={add}>{pending ? 'A adicionar…' : 'Adicionar ao diário'}</Button>
        </div>
      )}
    </li>
  );
}

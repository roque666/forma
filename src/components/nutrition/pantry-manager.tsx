'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { searchFoodsAction } from '@/lib/actions/nutrition';
import { browseFoodsAction, setPantryAction } from '@/lib/actions/mealplans';
import type { FoodRow } from '@/lib/services/nutrition';
import { inputCls } from '@/components/ui/styles';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';
import { fmtNum } from '@/lib/labels';

type Mini = Pick<FoodRow, 'id' | 'name' | 'category' | 'kcal100g' | 'protein100g' | 'carbs100g' | 'fat100g'>;

export function PantryManager({ initial, categories }: { initial: FoodRow[]; categories: { category: string; n: number }[] }) {
  const toast = useToast();
  const [pantry, setPantry] = useState<Map<string, Mini>>(new Map(initial.map((f) => [f.id, f])));
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [results, setResults] = useState<FoodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (!term && !cat) { setResults([]); return; }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = term ? await searchFoodsAction(term) : await browseFoodsAction(cat!);
        if (id === seq.current) setResults(r);
      } catch { if (id === seq.current) toast.error('Não foi possível pesquisar.'); }
      finally { if (id === seq.current) setLoading(false); }
    }, term ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, cat]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (f: Mini) => {
    const on = !pantry.has(f.id);
    setPantry((m) => { const c = new Map(m); if (on) c.set(f.id, f); else c.delete(f.id); return c; });
    start(async () => {
      const r = await setPantryAction({ foodIds: [f.id], on });
      if (!r.ok) {
        setPantry((m) => { const c = new Map(m); if (on) c.delete(f.id); else c.set(f.id, f); return c; });
        toast.error(r.error);
      }
    });
  };
  const addAll = () => {
    const ids = results.filter((f) => !pantry.has(f.id)).map((f) => f.id);
    if (!ids.length) return;
    const prev = pantry;
    setPantry((m) => { const c = new Map(m); results.forEach((f) => c.set(f.id, f)); return c; });
    start(async () => {
      const r = await setPantryAction({ foodIds: ids.slice(0, 300), on: true });
      if (!r.ok) { setPantry(prev); toast.error(r.error); }
    });
  };

  const grouped = useMemo(() => {
    const g = new Map<string, Mini[]>();
    for (const f of pantry.values()) { const k = f.category ?? 'Os meus alimentos'; g.set(k, [...(g.get(k) ?? []), f]); }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt')).map(([k, v]) => [k, v.sort((a, b) => a.name.localeCompare(b.name, 'pt'))] as const);
  }, [pantry]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line p-3">
        <label className="relative block">
          <span className="sr-only">Pesquisar alimentos</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar (ex.: frango, arroz, brócolos)" className={cn(inputCls, 'pl-9')} type="search" />
        </label>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Categorias">
          {categories.map((c) => (
            <button key={c.category} type="button" onClick={() => setCat(cat === c.category ? null : c.category)} aria-pressed={cat === c.category}
              className={cn('whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold', cat === c.category ? 'border-accent-text bg-accent/15' : 'border-line text-muted hover:bg-surface2')}>{c.category}</button>
          ))}
        </div>
        {(q.trim() || cat) && (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>{loading ? 'A pesquisar…' : `${results.length} resultados`}</span>
              {results.some((f) => !pantry.has(f.id)) && <button type="button" onClick={addAll} className="font-semibold text-accent-text hover:underline">Adicionar todos</button>}
            </div>
            {!loading && results.length === 0 ? <p className="py-3 text-center text-sm text-muted">Nenhum alimento encontrado.</p> : (
              <ul className="max-h-80 divide-y divide-line overflow-y-auto" aria-label="Resultados">
                {results.map((f) => {
                  const on = pantry.has(f.id);
                  return (
                    <li key={f.id}>
                      <button type="button" onClick={() => toggle(f)} aria-pressed={on} aria-label={`${on ? 'Remover da' : 'Adicionar à'} despensa: ${f.name}`} className="flex w-full items-center gap-3 py-2 text-left">
                        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border', on ? 'border-accent bg-accent text-accent-fg' : 'border-line')}>{on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{f.name}</span><span className="block text-xs text-muted">{fmtNum(f.kcal100g, 0)} kcal · P {fmtNum(f.protein100g, 0)} · H {fmtNum(f.carbs100g, 0)} · G {fmtNum(f.fat100g, 0)} /100 g</span></span>
                      </button>
                    </li>);
                })}
              </ul>)}
          </div>)}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold" data-testid="pantry-count">Na despensa ({pantry.size})</h2>
        {pantry.size === 0 ? <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-muted">Ainda sem alimentos. Pesquisa acima ou escolhe uma categoria para adicionar o que tens em casa.</p> : (
          <div className="space-y-3">
            {grouped.map(([k, foods]) => (
              <div key={k}>
                <p className="mb-1 text-xs font-semibold uppercase text-muted">{k}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {foods.map((f) => (
                    <li key={f.id}><span className="inline-flex items-center gap-1 rounded-full bg-surface2 py-1 pl-3 pr-1 text-sm">{f.name}
                      <button type="button" onClick={() => toggle(f)} aria-label={`Remover ${f.name}`} className="grid h-6 w-6 place-items-center rounded-full hover:bg-line"><X className="h-3.5 w-3.5" /></button></span></li>))}
                </ul>
              </div>))}
          </div>)}
      </section>
    </div>
  );
}

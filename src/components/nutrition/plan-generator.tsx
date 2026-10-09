'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Dices, Save, Sparkles } from 'lucide-react';
import { generateMealPlanAction, saveMealPlanAction } from '@/lib/actions/mealplans';
import { MEAL_KINDS, MEAL_KIND_LABEL, type GenResult, type MealKind } from '@/lib/nutrition/generator';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/feedback';
import { inputCls } from '@/components/ui/styles';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';
import { fmtNum } from '@/lib/labels';

const qty = (i: { quantity: number; unit: string; grams: number }) => (i.unit === 'unit' ? `${fmtNum(i.quantity, 1)} un. (${fmtNum(i.grams, 0)} g)` : `${fmtNum(i.quantity, 0)} ${i.unit}`);

export function Macros({ t, target }: { t: { kcal: number; proteinG: number; carbsG: number; fatG: number }; target?: { kcal: number; proteinG: number; carbsG: number; fatG: number } }) {
  const d = (a: number, b?: number) => (b == null ? '' : ` / ${fmtNum(b, 0)}`);
  return <span className="tabular-nums">{fmtNum(t.kcal, 0)}{d(t.kcal, target?.kcal)} kcal · P {fmtNum(t.proteinG, 0)}{d(t.proteinG, target?.proteinG)} · H {fmtNum(t.carbsG, 0)}{d(t.carbsG, target?.carbsG)} · G {fmtNum(t.fatG, 0)}{d(t.fatG, target?.fatG)}</span>;
}

export function PlanGenerator({ target }: { target: { kcal: number; proteinG: number; carbsG: number; fatG: number } }) {
  const router = useRouter();
  const toast = useToast();
  const [meals, setMeals] = useState<MealKind[]>(['breakfast', 'lunch', 'snack', 'dinner']);
  const [days, setDays] = useState<1 | 7>(1);
  const [res, setRes] = useState<GenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [name, setName] = useState('');
  const [pending, start] = useTransition();
  const [saving, startSave] = useTransition();

  const generate = () => start(async () => {
    setError(null);
    const r = await generateMealPlanAction({ meals, days });
    if (r.ok && r.data) { setRes(r.data); setTab(0); if (!name) setName(days === 1 ? 'Dia-tipo' : 'Semana variada'); }
    else if (!r.ok) setError(r.error);
  });
  const save = () => startSave(async () => {
    if (!res) return;
    const r = await saveMealPlanAction({ name, target: res.target, days: res.days });
    if (r.ok && r.data) { toast.success('Plano guardado.'); router.push(`/nutrition/plans/${r.data.id}`); }
    else if (!r.ok) toast.error(r.error);
  });
  const day = res?.days[tab];

  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-3 text-sm text-muted">Objetivo diário: <strong className="text-fg"><Macros t={target} /></strong></p>
        <fieldset className="mb-3">
          <legend className="mb-1.5 text-sm font-medium">Refeições</legend>
          <div className="flex flex-wrap gap-2">
            {MEAL_KINDS.map((k) => (
              <label key={k} className={cn('cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold', meals.includes(k) ? 'border-accent-text bg-accent/15' : 'border-line text-muted')}>
                <input type="checkbox" className="sr-only" checked={meals.includes(k)} onChange={() => setMeals((m) => (m.includes(k) ? m.filter((x) => x !== k) : MEAL_KINDS.filter((x) => x === k || m.includes(x))))} />{MEAL_KIND_LABEL[k]}
              </label>))}
          </div>
        </fieldset>
        <fieldset className="mb-4">
          <legend className="mb-1.5 text-sm font-medium">Tipo de modelo</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([[1, 'Dia-tipo', 'Um dia que se repete nos dias que escolheres.'], [7, 'Semana variada', 'Sete dias diferentes, com mais variedade.']] as const).map(([v, t, d]) => (
              <label key={v} className={cn('cursor-pointer rounded-xl border p-3', days === v ? 'border-accent-text bg-accent/15' : 'border-line')}>
                <input type="radio" name="mode" className="sr-only" checked={days === v} onChange={() => setDays(v)} /><span className="block text-sm font-semibold">{t}</span><span className="block text-xs text-muted">{d}</span>
              </label>))}
          </div>
        </fieldset>
        <Button onClick={() => generate()} disabled={pending || meals.length < 2} className="w-full sm:w-auto"><Sparkles className="h-4 w-4" />{pending ? 'A gerar…' : res ? 'Gerar outra variação' : 'Gerar pré-visualização'}</Button>
        {meals.length < 2 && <p className="mt-2 text-xs text-danger">Escolhe pelo menos 2 refeições.</p>}
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {res && day && (
        <section aria-label="Pré-visualização" className="space-y-3" data-testid="plan-preview">
          {res.warnings.length > 0 && <Alert tone="warn"><ul className="list-disc pl-4">{res.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}
          {res.days.length > 1 && (
            <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Dias">
              {res.days.map((d, i) => <button key={d.name} role="tab" aria-selected={i === tab} onClick={() => setTab(i)} className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold', i === tab ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted')}>{d.name.slice(0, 3)}</button>)}
            </div>)}
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{day.name}</h2><Badge tone="ok"><Macros t={day.totals} target={res.target} /></Badge></div>
            <div className="space-y-4">
              {day.meals.map((m) => (
                <div key={m.type}>
                  <p className="mb-1 flex flex-wrap justify-between gap-x-3 text-sm font-semibold">{MEAL_KIND_LABEL[m.type]}<span className="text-xs font-normal text-muted"><Macros t={m.totals} /></span></p>
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {m.items.map((i) => <li key={i.foodId} className="flex justify-between gap-3 px-3 py-2 text-sm"><span className="min-w-0 truncate">{i.name}</span><span className="shrink-0 tabular-nums text-muted">{qty(i)} · {fmtNum(i.kcal, 0)} kcal</span></li>)}
                  </ul>
                </div>))}
            </div>
          </Card>
          <Card>
            <label className="mb-1 block text-sm font-medium" htmlFor="plan-name">Nome do plano</label>
            <input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={cn(inputCls, 'mb-3')} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={saving || !name.trim()}><Save className="h-4 w-4" />{saving ? 'A guardar…' : 'Guardar plano'}</Button>
              <Button variant="outline" onClick={() => generate()} disabled={pending}><Dices className="h-4 w-4" />Outra variação</Button>
            </div>
          </Card>
        </section>)}
    </div>
  );
}

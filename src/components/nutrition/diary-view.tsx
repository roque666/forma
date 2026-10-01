import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Trash2, Utensils } from 'lucide-react';
import { withUser } from '@/lib/db/pool';
import { getCurrentGoal, getDiaryDay, type MealItemRow } from '@/lib/services/nutrition';
import { dailyProgress } from '@/lib/nutrition/diary';
import { deleteItemAction, deleteMealAction } from '@/lib/actions/nutrition';
import { Card } from '@/components/ui/card';
import { Alert, Badge, EmptyState, ProgressBar } from '@/components/ui/feedback';
import { Ring } from '@/components/ui/ring';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { LinkButton } from '@/components/ui/button';
import { ItemQuantity, MealActions } from './diary-forms';
import { addDays, formatDatePt, relativeDayLabel, todayInTz } from '@/lib/dates';
import { fmtNum, GOAL_LABELS, MEAL_TYPE_LABELS } from '@/lib/labels';

const ORDER = ['breakfast', 'lunch', 'snack', 'dinner', 'pre_workout', 'post_workout', 'other'];
const MAIN = ['breakfast', 'lunch', 'snack', 'dinner'];

export async function DiaryView({ viewerId, studentId, date, tz, readOnly, hrefForDate, goalsHref, itemExtra }: {
  viewerId: string; studentId: string; date: string; tz: string; readOnly?: boolean; hrefForDate: (d: string) => string; goalsHref: string; itemExtra?: (it: MealItemRow) => React.ReactNode;
}) {
  const today = todayInTz(tz);
  const { day, goal } = await withUser(viewerId, async (db) => ({ day: await getDiaryDay(db, studentId, date), goal: await getCurrentGoal(db, studentId, date) }));
  const target = goal ? { kcal: goal.caloriesTarget, proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG } : null;
  const prog = target ? dailyProgress(day.totals, target) : null;
  const byType = new Map<string, typeof day.meals>();
  for (const m of day.meals) byType.set(m.mealType, [...(byType.get(m.mealType) ?? []), m]);
  const sections = ORDER.filter((t) => byType.has(t) || (!readOnly && MAIN.includes(t)) || false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={hrefForDate(addDays(date, -1))} aria-label="Dia anterior" className="grid h-11 w-11 place-items-center rounded-xl bg-surface2"><ChevronLeft className="h-5 w-5" /></Link>
        <div className="text-center"><p className="text-lg font-bold">{relativeDayLabel(date, today)}</p><p className="text-xs text-muted">{formatDatePt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
        <Link href={hrefForDate(addDays(date, 1))} aria-label="Dia seguinte" className="grid h-11 w-11 place-items-center rounded-xl bg-surface2"><ChevronRight className="h-5 w-5" /></Link>
      </div>
      {date !== today && <div className="text-center"><Link href={hrefForDate(today)} className="text-sm font-medium text-accent-text">Ir para hoje</Link></div>}

      {!goal && (
        <Alert tone="info">{readOnly ? 'Ainda não há objetivo nutricional definido para este atleta.' : <>Ainda não tens objetivo definido. <Link href={goalsHref} className="font-semibold underline">Calcula as tuas calorias e macros</Link>.</>}
          {readOnly && <> <Link href={goalsHref} className="font-semibold underline">Definir objetivo</Link></>}</Alert>
      )}

      <Card>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
          <Ring value={day.totals.kcal} max={target?.kcal ?? Math.max(day.totals.kcal, 1)} tone={prog?.kcal.over ? 'danger' : 'accent'}>
            <div className="text-center"><p className="text-3xl font-bold tabular-nums">{fmtNum(day.totals.kcal, 0)}</p><p className="text-xs text-muted">{target ? `de ${fmtNum(target.kcal, 0)} kcal` : 'kcal'}</p></div>
          </Ring>
          <div className="w-full flex-1 space-y-3">
            {prog && <p className="text-sm"><strong className={prog.kcal.over ? 'text-danger' : ''}>{prog.kcal.over ? `${fmtNum(-prog.kcal.remaining, 0)} kcal acima` : `${fmtNum(prog.kcal.remaining, 0)} kcal restantes`}</strong>{goal && <Badge className="ml-2">{GOAL_LABELS[goal.goalType]}</Badge>}</p>}
            {([['Proteína', day.totals.proteinG, target?.proteinG, 'protein'], ['Hidratos', day.totals.carbsG, target?.carbsG, 'carbs'], ['Gordura', day.totals.fatG, target?.fatG, 'fat']] as const).map(([label, v, t, tone]) => (
              <div key={label}><div className="mb-1 flex justify-between text-sm"><span className="font-medium">{label}</span><span className="tabular-nums text-muted">{fmtNum(v, 0)}{t ? ` / ${fmtNum(t, 0)}` : ''} g</span></div>
                <ProgressBar value={v} max={t ?? Math.max(v, 1)} tone={t && v > t * 1.1 ? 'danger' : tone} label={label} /></div>
            ))}
          </div>
        </div>
      </Card>

      {sections.length === 0 && readOnly && <EmptyState icon={<Utensils className="h-8 w-8" />} title="Sem refeições registadas neste dia" />}
      {sections.map((type) => {
        const meals = byType.get(type) ?? [];
        const kcal = meals.reduce((s, m) => s + m.totals.kcal, 0);
        return (
          <Card key={type}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-bold">{MEAL_TYPE_LABELS[type]}</h2>
              <div className="flex items-center gap-2"><span className="text-sm tabular-nums text-muted">{fmtNum(kcal, 0)} kcal</span>
                {!readOnly && <LinkButton href={`/nutrition/add?type=${type}&date=${date}`} size="sm" variant="primary" aria-label={`Adicionar alimento a ${MEAL_TYPE_LABELS[type]}`}><Plus className="h-4 w-4" /> Adicionar</LinkButton>}</div>
            </div>
            {meals.length === 0 ? <p className="py-2 text-sm text-muted">Sem alimentos registados.</p> : meals.map((m) => (
              <div key={m.id}>
                {m.name && <p className="mt-1 text-xs font-semibold uppercase text-muted">{m.name}</p>}
                <ul className="divide-y divide-line">
                  {m.items.map((it) => (
                    <li key={it.id} className="py-2.5"><div className="flex items-center justify-between gap-2">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{it.name}</p>
                        <p className="text-xs text-muted">{readOnly ? <span>{it.quantity} {it.unit === 'unit' ? 'un.' : it.unit}</span> : <ItemQuantity itemId={it.id} quantity={it.quantity} unit={it.unit} />} · P {fmtNum(it.proteinG, 0)} · H {fmtNum(it.carbsG, 0)} · G {fmtNum(it.fatG, 0)}</p></div>
                      <div className="flex shrink-0 items-center gap-1"><span className="text-sm font-semibold tabular-nums">{fmtNum(it.kcal, 0)}</span>
                        {!readOnly && <form action={deleteItemAction}><input type="hidden" name="id" value={it.id} /><button aria-label={`Remover ${it.name}`} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button></form>}</div></div>
                      {itemExtra?.(it)}
                    </li>
                  ))}
                </ul>
                {!readOnly && <MealActions mealId={m.id} date={date} defaultName={m.name ?? MEAL_TYPE_LABELS[type]} mealType={type} />}
                {!readOnly && <form action={deleteMealAction} className="mt-1"><input type="hidden" name="id" value={m.id} /><ConfirmSubmit size="sm" variant="ghost" confirmLabel="Apagar refeição?">Apagar refeição</ConfirmSubmit></form>}
              </div>
            ))}
          </Card>
        );
      })}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/nutrition/add?date=${date}`} variant="outline"><Plus className="h-4 w-4" /> Outra refeição</LinkButton>
          <LinkButton href="/nutrition/foods" variant="ghost">Os meus alimentos</LinkButton>
          <LinkButton href="/nutrition/stats" variant="ghost">Estatísticas</LinkButton>
        </div>
      )}
    </div>
  );
}

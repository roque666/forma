'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { fail, formToObject, ok, parse, run, type ActionResult } from '../actions';
import { requireUser, type SessionUser } from '../auth/session';
import { withUser } from '../db/pool';
import { todayInTz } from '../dates';
import { generatePlan, type GenFood, type GenResult } from '../nutrition/generator';
import * as n from '../services/nutrition';
import * as mp from '../services/mealplans';
import { scheduleSchema, weekdaysSchema } from '../validation/training';
import { applySchema, generateSchema, itemQtySchema, pantrySchema, renameSchema, savePlanSchema } from '../validation/mealplans';
import { uuid } from '../validation/common';

type FormState = ActionResult<any> | null;
const idOf = (v: unknown) => uuid.parse(v);

/** Despensa e planos são do atleta (o treinador em modo pessoal conta como atleta). */
async function requireStudent(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'student') throw Object.assign(new Error('Só disponível para atletas.'), { code: '42501' });
  return user;
}
const refresh = () => { revalidatePath('/nutrition', 'layout'); revalidatePath('/dashboard'); };

// ------------------------------------------------------------------ despensa
export async function setPantryAction(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const user = await requireStudent();
    const p = parse(pantrySchema, input);
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => n.setPantry(db, user.id, p.data.foodIds, p.data.on));
    revalidatePath('/nutrition/pantry');
    return ok();
  });
}
export async function browseFoodsAction(category: string): Promise<n.FoodRow[]> {
  const user = await requireUser();
  return withUser(user.id, (db) => n.browseFoods(db, String(category).slice(0, 60)));
}

// ------------------------------------------------------------------ gerar (pré-visualização, não grava)
export async function generateMealPlanAction(input: unknown): Promise<ActionResult<GenResult>> {
  return run(async () => {
    const user = await requireStudent();
    const p = parse(generateSchema, input);
    if ('error' in p) return p.error;
    const today = todayInTz(user.timezone);
    const { goal, foods } = await withUser(user.id, async (db) => ({ goal: await n.getCurrentGoal(db, user.id, today), foods: await n.listPantryFoods(db, user.id) }));
    if (!goal) return fail('Define primeiro o teu objetivo de calorias e macros.');
    if (foods.length < 3) return fail('Adiciona pelo menos 3 alimentos à despensa.');
    const gen: GenFood[] = foods.map((f) => ({ id: f.id, name: f.name, category: f.category, kcal100g: f.kcal100g, protein100g: f.protein100g, carbs100g: f.carbs100g, fat100g: f.fat100g, fiber100g: f.fiber100g, densityGPerMl: f.densityGPerMl, servings: f.servings }));
    const result = generatePlan({
      target: { kcal: goal.caloriesTarget, proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG },
      foods: gen, meals: p.data.meals, days: p.data.days, seed: p.data.seed ?? Math.floor(Math.random() * 1_000_000),
    });
    return ok(result);
  });
}

export async function saveMealPlanAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await requireStudent();
    const p = parse(savePlanSchema, input);
    if ('error' in p) return p.error;
    const id = await withUser(user.id, (db) => mp.savePlan(db, {
      name: p.data.name, target: p.data.target,
      days: p.data.days.map((d) => ({ name: d.name, weekdays: [...new Set(d.weekdays)].sort(), meals: d.meals.map((m) => ({ mealType: m.type, items: m.items })) })),
    }));
    revalidatePath('/nutrition/plans');
    return ok({ id }, 'Plano guardado.');
  });
}

// ------------------------------------------------------------------ gestão do plano
export async function renamePlanAction(planId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireStudent();
    const p = parse(renameSchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => mp.renamePlan(db, idOf(planId), p.data.name));
    revalidatePath('/nutrition/plans', 'layout');
    return ok(undefined, 'Nome guardado.');
  });
}
export async function setPlanScheduleAction(planId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireStudent();
    const p = parse(scheduleSchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => mp.setSchedule(db, idOf(planId), p.data));
    revalidatePath('/nutrition', 'layout');
    return ok(undefined, 'Calendário do plano guardado.');
  });
}
export async function setPlanActiveAction(fd: FormData): Promise<void> {
  const user = await requireStudent();
  const active = fd.get('active') === '1';
  await withUser(user.id, (db) => mp.setActive(db, idOf(fd.get('id')), active, todayInTz(user.timezone)));
  refresh();
}
export async function archivePlanAction(fd: FormData): Promise<void> {
  const user = await requireStudent();
  await withUser(user.id, (db) => mp.archivePlan(db, idOf(fd.get('id')), fd.get('archived') === '1'));
  refresh();
  redirect('/nutrition/plans');
}
export async function deletePlanAction(fd: FormData): Promise<void> {
  const user = await requireStudent();
  await withUser(user.id, (db) => mp.deletePlan(db, idOf(fd.get('id'))));
  refresh();
  redirect('/nutrition/plans');
}
export async function setDayWeekdaysAction(dayId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireStudent();
    const p = parse(weekdaysSchema, formToObject(fd).weekdays);
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => mp.setDayWeekdays(db, idOf(dayId), p.data as number[]));
    revalidatePath('/nutrition', 'layout');
    return ok(undefined, 'Dias guardados.');
  });
}
export async function updatePlanItemAction(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const user = await requireStudent();
    const p = parse(itemQtySchema, input);
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => mp.updateItemQuantity(db, p.data.itemId, p.data.quantity));
    revalidatePath('/nutrition/plans', 'layout');
    return ok();
  });
}
export async function removePlanItemAction(itemId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireStudent();
    await withUser(user.id, (db) => mp.removeItem(db, idOf(itemId)));
    revalidatePath('/nutrition/plans', 'layout');
    return ok();
  });
}

// ------------------------------------------------------------------ calendário → diário
export async function applyPlanDayAction(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const user = await requireStudent();
    const p = parse(applySchema, input);
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => mp.applyDay(db, user.id, p.data.dayId, p.data.date));
    refresh();
    return ok(undefined, 'Refeições adicionadas ao diário.');
  });
}
export async function unapplyPlanDayAction(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const user = await requireStudent();
    const p = parse(applySchema, input);
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => mp.unapplyDay(db, user.id, p.data.dayId, p.data.date));
    refresh();
    return ok(undefined, 'Refeições removidas do diário.');
  });
}

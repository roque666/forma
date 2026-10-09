'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { fail, formToObject, ok, parse, run, type ActionResult } from '../actions';
import { requireUser } from '../auth/session';
import { withUser } from '../db/pool';
import { todayInTz } from '../dates';
import * as n from '../services/nutrition';
import { addItemSchema, addItemsSchema, applySavedSchema, duplicateMealSchema, foodSchema, goalSchema, saveMealSchema, updateItemSchema, weightGoalSchema, weightSchema } from '../validation/nutrition';
import { uuid } from '../validation/common';

type FormState = ActionResult<any> | null;
const idOf = (v: unknown) => uuid.parse(v);

// ------------------------------------------------------------------ objetivo
export async function saveGoalAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(goalSchema, formToObject(fd));
    if ('error' in p) return p.error;
    const today = todayInTz(user.timezone);
    const { studentId, result } = await withUser(user.id, (db) => n.createGoal(db, user, p.data, today));
    revalidatePath('/nutrition', 'layout');
    revalidatePath('/dashboard');
    revalidatePath(`/students/${studentId}`, 'layout');
    return ok({ calories: result.caloriesTarget }, `Objetivo guardado: ${result.caloriesTarget} kcal por dia.`);
  });
}

// ------------------------------------------------------------------ alimentos
export async function createFoodAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(foodSchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => n.createFood(db, user, p.data));
    revalidatePath('/nutrition/foods');
    redirect('/nutrition/foods?created=1');
  });
}
export async function updateFoodAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(foodSchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => n.updateFood(db, idOf(id), p.data));
    revalidatePath('/nutrition/foods');
    return ok(undefined, 'Alimento atualizado.');
  });
}
export async function deleteFoodAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => n.deleteFood(db, idOf(fd.get('id'))));
  revalidatePath('/nutrition', 'layout');
  redirect('/nutrition/foods?deleted=1');
}

// ------------------------------------------------------------------ diário
export async function addMealItemAction(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(addItemSchema, input);
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => n.addMealItem(db, user, p.data));
    revalidatePath('/nutrition');
    revalidatePath('/dashboard');
    return ok(undefined, 'Alimento adicionado.');
  });
}
/** Adiciona vários alimentos à mesma refeição numa só transação (tudo ou nada). */
export async function addMealItemsAction(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(addItemsSchema, input);
    if ('error' in p) return p.error;
    await withUser(user.id, async (db) => {
      for (const it of p.data.items) await n.addMealItem(db, user, { ...it, logDate: p.data.logDate, mealType: p.data.mealType });
    });
    revalidatePath('/nutrition');
    revalidatePath('/dashboard');
    const c = p.data.items.length;
    return ok(undefined, c === 1 ? 'Alimento adicionado.' : `${c} alimentos adicionados.`);
  });
}

/** Pesquisa ao escrever (a página mantém o cesto, por isso a pesquisa não recarrega). */
export async function searchFoodsAction(q: string): Promise<n.FoodRow[]> {
  const user = await requireUser();
  const term = typeof q === 'string' ? q.slice(0, 80) : '';
  return withUser(user.id, (db) => n.searchFoods(db, term));
}

export async function updateItemQuantityAction(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(updateItemSchema, input);
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => n.updateItemQuantity(db, p.data.itemId, p.data.quantity));
    revalidatePath('/nutrition');
    revalidatePath('/dashboard');
    return ok();
  });
}
export async function deleteItemAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => n.deleteMealItem(db, idOf(fd.get('id'))));
  revalidatePath('/nutrition');
  revalidatePath('/dashboard');
}
export async function deleteMealAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => n.deleteMeal(db, idOf(fd.get('id'))));
  revalidatePath('/nutrition');
  revalidatePath('/dashboard');
}
export async function duplicateMealAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const raw = formToObject(fd);
    const p = parse(duplicateMealSchema, { ...raw, mealType: raw.mealType || undefined });
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => n.duplicateMeal(db, p.data.mealId, p.data.targetDate, p.data.mealType));
    revalidatePath('/nutrition');
    return ok(undefined, 'Refeição duplicada.');
  });
}
export async function saveMealTemplateAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(saveMealSchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => n.saveMealAsTemplate(db, p.data.mealId, p.data.name));
    revalidatePath('/nutrition');
    return ok(undefined, 'Refeição guardada nos favoritos.');
  });
}
export async function applySavedMealAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const raw = formToObject(fd);
    const p = parse(applySavedSchema, { ...raw, mealType: raw.mealType || undefined });
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => n.applySavedMeal(db, p.data.savedId, p.data.targetDate, p.data.mealType));
    revalidatePath('/nutrition');
    revalidatePath('/dashboard');
    return ok(undefined, 'Refeição adicionada ao dia.');
  });
}
export async function toggleSavedFavoriteAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => n.toggleSavedFavorite(db, idOf(fd.get('id'))));
  revalidatePath('/nutrition', 'layout');
}
export async function deleteSavedMealAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => n.deleteSavedMeal(db, idOf(fd.get('id'))));
  revalidatePath('/nutrition', 'layout');
}

// ------------------------------------------------------------------ peso
export async function logWeightAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(weightSchema, formToObject(fd));
    if ('error' in p) return p.error;
    if (p.data.measuredOn > todayInTz(user.timezone)) return fail('A data não pode estar no futuro.', { measuredOn: 'Data no futuro' });
    await withUser(user.id, (db) => n.logWeight(db, user, p.data));
    revalidatePath('/weight');
    revalidatePath('/dashboard');
    return ok(undefined, 'Peso registado.');
  });
}
export async function deleteWeightAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => n.deleteWeight(db, idOf(fd.get('id'))));
  revalidatePath('/weight');
  revalidatePath('/dashboard');
}
export async function setWeightGoalAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const raw = formToObject(fd);
    const p = parse(weightGoalSchema.extend({ studentId: uuid.optional() }), { ...raw, studentId: raw.studentId || undefined });
    if ('error' in p) return p.error;
    const studentId = user.role === 'coach' ? p.data.studentId : user.id;
    if (!studentId) return fail('Escolhe o atleta.');
    await withUser(user.id, (db) => n.setWeightGoal(db, user, studentId, p.data));
    revalidatePath('/weight');
    revalidatePath(`/students/${studentId}`, 'layout');
    return ok(undefined, 'Objetivo de peso guardado.');
  });
}

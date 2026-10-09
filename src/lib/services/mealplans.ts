import type { Db } from '../db/pool';
import { scaleFood } from '../nutrition/diary';
import type { CalPlan, Recurrence } from '../training/calendar';
import { getFood } from './nutrition';

const NOT_FOUND = Object.assign(new Error('Registo não encontrado.'), { code: 'P0002' });
const bad = (m: string) => Object.assign(new Error(m), { code: '22023' });

export interface PlanItem { id: string; foodId: string | null; name: string; quantity: number; unit: 'g' | 'ml' | 'unit'; gramsPerUnit: number | null; kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null }
export interface PlanMeal { id: string; mealType: string; items: PlanItem[]; kcal: number; proteinG: number; carbsG: number; fatG: number }
export interface PlanDay { id: string; name: string; position: number; weekdays: number[]; meals: PlanMeal[]; kcal: number; proteinG: number; carbsG: number; fatG: number }
export interface MealPlan {
  id: string; name: string; isActive: boolean; archived: boolean; recurrence: Recurrence; targetKcal: number | null; targetProteinG: number | null; targetCarbsG: number | null; targetFatG: number | null; days: PlanDay[];
}

interface PlanRow { id: string; name: string; isActive: boolean; archived: boolean; recurrence: Recurrence; targetKcal: number | null; targetProteinG: number | null; targetCarbsG: number | null; targetFatG: number | null }
const PLAN_COLS = `p.id, p.name, p.is_active as "isActive", p.archived_at is not null as archived,
  json_build_object('kind', p.recur_kind, 'every', p.recur_every, 'weekOfMonth', p.recur_week_of_month,
                    'anchor', to_char(p.recur_anchor, 'YYYY-MM-DD'), 'endsOn', to_char(p.ends_on, 'YYYY-MM-DD')) as recurrence,
  p.target_kcal::float as "targetKcal", p.target_protein_g::float as "targetProteinG", p.target_carbs_g::float as "targetCarbsG", p.target_fat_g::float as "targetFatG"`;

async function hydrate(db: Db, rows: PlanRow[]): Promise<MealPlan[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const days = await db.query<{ id: string; planId: string; name: string; position: number; weekdays: number[] }>(
    `select id, plan_id as "planId", name, position, weekdays::int[] as weekdays from public.meal_plan_days where plan_id = any($1::uuid[]) order by position, name`, [ids]);
  const meals = await db.query<{ id: string; dayId: string; mealType: string }>(
    `select m.id, m.day_id as "dayId", m.meal_type::text as "mealType" from public.meal_plan_meals m where m.day_id = any($1::uuid[]) order by m.position`, [days.map((d) => d.id)]);
  const items = await db.query<PlanItem & { mealId: string }>(
    `select i.id, i.meal_id as "mealId", i.food_id as "foodId", i.name, i.quantity::float as quantity, i.unit, i.grams_per_unit::float as "gramsPerUnit",
            i.kcal::float as kcal, i.protein_g::float as "proteinG", i.carbs_g::float as "carbsG", i.fat_g::float as "fatG", i.fiber_g::float as "fiberG"
       from public.meal_plan_items i where i.meal_id = any($1::uuid[]) order by i.position`, [meals.map((m) => m.id)]);
  const sum = (xs: { kcal: number; proteinG: number; carbsG: number; fatG: number }[]) => ({
    kcal: Math.round(xs.reduce((a, b) => a + b.kcal, 0) * 10) / 10, proteinG: Math.round(xs.reduce((a, b) => a + b.proteinG, 0) * 10) / 10,
    carbsG: Math.round(xs.reduce((a, b) => a + b.carbsG, 0) * 10) / 10, fatG: Math.round(xs.reduce((a, b) => a + b.fatG, 0) * 10) / 10,
  });
  return rows.map((r) => ({
    ...r,
    days: days.filter((d) => d.planId === r.id).map((d) => {
      const ms: PlanMeal[] = meals.filter((m) => m.dayId === d.id).map((m) => { const it = items.filter((i) => i.mealId === m.id).map(({ mealId: _m, ...x }) => x); return { id: m.id, mealType: m.mealType, items: it, ...sum(it) }; });
      return { id: d.id, name: d.name, position: d.position, weekdays: d.weekdays, meals: ms, ...sum(ms) };
    }),
  }));
}

export async function listPlans(db: Db, studentId: string, opts: { includeArchived?: boolean } = {}): Promise<MealPlan[]> {
  const rows = await db.query<PlanRow>(`select ${PLAN_COLS} from public.meal_plans p where p.student_id = $1 ${opts.includeArchived ? '' : 'and p.archived_at is null'} order by p.archived_at nulls first, p.is_active desc, p.created_at desc`, [studentId]);
  return hydrate(db, rows);
}
export async function getPlan(db: Db, id: string): Promise<MealPlan | null> {
  const rows = await db.query<PlanRow>(`select ${PLAN_COLS} from public.meal_plans p where p.id = $1`, [id]);
  return (await hydrate(db, rows))[0] ?? null;
}

/** Planos no calendário (ativos), no formato do calendário de treinos. */
export const toCalPlans = (plans: MealPlan[]): CalPlan[] =>
  plans.filter((p) => p.isActive && !p.archived).map((p) => ({ id: p.id, name: p.name, recurrence: p.recurrence, days: p.days.map((d) => ({ id: d.id, name: d.name, position: d.position, weekdays: d.weekdays })) }));

export interface SavePlanInput {
  name: string; target: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  days: { name: string; weekdays: number[]; meals: { mealType: string; items: { foodId: string; quantity: number; unit: 'g' | 'ml' | 'unit'; gramsPerUnit?: number | null }[] }[] }[];
}

/** Grava o plano. Os valores nutricionais são recalculados aqui a partir dos alimentos (não se confia no cliente). */
export async function savePlan(db: Db, i: SavePlanInput): Promise<string> {
  if (i.days.length === 0) throw bad('O plano não tem dias.');
  const plan = await db.one<{ id: string }>(
    `insert into public.meal_plans (name, target_kcal, target_protein_g, target_carbs_g, target_fat_g) values ($1,$2,$3,$4,$5) returning id`,
    [i.name, i.target.kcal, i.target.proteinG, i.target.carbsG, i.target.fatG]);
  const foodCache = new Map<string, Awaited<ReturnType<typeof getFood>>>();
  for (const [di, d] of i.days.entries()) {
    const day = await db.one<{ id: string }>('insert into public.meal_plan_days (plan_id, name, position, weekdays) values ($1,$2,$3,$4::smallint[]) returning id', [plan!.id, d.name, di, d.weekdays]);
    for (const [mi, m] of d.meals.entries()) {
      const meal = await db.one<{ id: string }>('insert into public.meal_plan_meals (day_id, meal_type, position) values ($1,$2::public.meal_type,$3) returning id', [day!.id, m.mealType, mi]);
      for (const [ii, it] of m.items.entries()) {
        if (!foodCache.has(it.foodId)) foodCache.set(it.foodId, await getFood(db, it.foodId));
        const food = foodCache.get(it.foodId);
        if (!food) throw bad('Um dos alimentos já não existe.');
        const n = scaleFood(food, { quantity: it.quantity, unit: it.unit, gramsPerUnit: it.gramsPerUnit ?? null });
        await db.exec(
          `insert into public.meal_plan_items (meal_id, food_id, name, quantity, unit, grams_per_unit, kcal, protein_g, carbs_g, fat_g, fiber_g, position) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [meal!.id, food.id, food.name, it.quantity, it.unit, it.gramsPerUnit ?? null, n.kcal, n.proteinG, n.carbsG, n.fatG, n.fiberG, ii]);
      }
    }
  }
  return plan!.id;
}

export async function renamePlan(db: Db, id: string, name: string) {
  if (!(await db.exec('update public.meal_plans set name = $2 where id = $1', [id, name]))) throw NOT_FOUND;
}
export async function setSchedule(db: Db, id: string, i: { pattern: string; anchor: string; endsOn?: string }) {
  const monthly = i.pattern.startsWith('m');
  const n = Number(i.pattern.slice(1));
  if (!(await db.exec(
    `update public.meal_plans set recur_kind = $2, recur_every = $3, recur_week_of_month = $4, recur_anchor = $5, ends_on = $6, is_active = true, archived_at = null where id = $1`,
    [id, monthly ? 'monthly' : 'weekly', monthly ? 1 : n, monthly ? n : null, i.anchor, i.endsOn ?? null]))) throw NOT_FOUND;
}
export async function setActive(db: Db, id: string, active: boolean, anchor: string) {
  if (!(await db.exec(`update public.meal_plans set is_active = $2, archived_at = null, recur_anchor = coalesce(recur_anchor, $3::date) where id = $1`, [id, active, anchor]))) throw NOT_FOUND;
}
export async function archivePlan(db: Db, id: string, archived: boolean) {
  if (!(await db.exec(`update public.meal_plans set archived_at = case when $2 then now() else null end, is_active = case when $2 then false else is_active end where id = $1`, [id, archived]))) throw NOT_FOUND;
}
export async function deletePlan(db: Db, id: string) {
  if (!(await db.exec('delete from public.meal_plans where id = $1', [id]))) throw NOT_FOUND;
}
export async function setDayWeekdays(db: Db, dayId: string, weekdays: number[]) {
  if (!(await db.exec('update public.meal_plan_days set weekdays = $2::smallint[] where id = $1', [dayId, weekdays]))) throw NOT_FOUND;
}

/** Altera a quantidade de um alimento do plano e recalcula os macros (a partir do alimento; proporcional se já não existir). */
export async function updateItemQuantity(db: Db, itemId: string, quantity: number) {
  const it = await db.one<PlanItem>(
    `select id, food_id as "foodId", name, quantity::float as quantity, unit, grams_per_unit::float as "gramsPerUnit", kcal::float as kcal, protein_g::float as "proteinG", carbs_g::float as "carbsG", fat_g::float as "fatG", fiber_g::float as "fiberG" from public.meal_plan_items where id = $1`, [itemId]);
  if (!it) throw NOT_FOUND;
  const food = it.foodId ? await getFood(db, it.foodId) : null;
  let n = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: null as number | null };
  if (food) n = scaleFood(food, { quantity, unit: it.unit, gramsPerUnit: it.gramsPerUnit });
  else { const f = quantity / it.quantity; const r = (x: number) => Math.round(x * f * 10) / 10; n = { kcal: r(it.kcal), proteinG: r(it.proteinG), carbsG: r(it.carbsG), fatG: r(it.fatG), fiberG: it.fiberG == null ? null : r(it.fiberG) }; }
  await db.exec('update public.meal_plan_items set quantity = $2, kcal = $3, protein_g = $4, carbs_g = $5, fat_g = $6, fiber_g = $7 where id = $1', [itemId, quantity, n.kcal, n.proteinG, n.carbsG, n.fatG, n.fiberG]);
}
export async function removeItem(db: Db, itemId: string) {
  if (!(await db.exec('delete from public.meal_plan_items where id = $1', [itemId]))) throw NOT_FOUND;
}

// ------------------------------------------------------------------ aplicar ao diário
/** Datas/dias do plano já adicionados ao diário no intervalo. */
export async function appliedDays(db: Db, studentId: string, from: string, to: string): Promise<Set<string>> {
  const r = await db.query<{ dayId: string; date: string }>(
    `select distinct source_plan_day_id as "dayId", to_char(log_date, 'YYYY-MM-DD') as date from public.meals where student_id = $1 and source_plan_day_id is not null and log_date between $2::date and $3::date`, [studentId, from, to]);
  return new Set(r.map((x) => `${x.dayId}|${x.date}`));
}

/** Copia as refeições de um dia do plano para o diário numa data. Não duplica se já foi adicionado. */
export async function applyDay(db: Db, studentId: string, dayId: string, date: string): Promise<number> {
  const exists = await db.one<{ n: number }>('select count(*)::int as n from public.meals where student_id = $1 and log_date = $2 and source_plan_day_id = $3', [studentId, date, dayId]);
  if (exists && exists.n > 0) throw bad('Este dia do plano já foi adicionado ao diário.');
  const meals = await db.query<{ id: string; mealType: string }>('select id, meal_type::text as "mealType" from public.meal_plan_meals where day_id = $1 order by position', [dayId]);
  if (meals.length === 0) throw NOT_FOUND;
  let count = 0;
  for (const m of meals) {
    const meal = await db.one<{ id: string }>('insert into public.meals (student_id, log_date, meal_type, source_plan_day_id) values ($1,$2,$3::public.meal_type,$4) returning id', [studentId, date, m.mealType, dayId]);
    count += await db.exec(
      `insert into public.meal_items (meal_id, food_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, fiber_g, position)
       select $1, food_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, fiber_g, position from public.meal_plan_items where meal_id = $2`, [meal!.id, m.id]);
  }
  return count;
}
export async function unapplyDay(db: Db, studentId: string, dayId: string, date: string) {
  await db.exec('delete from public.meals where student_id = $1 and log_date = $2 and source_plan_day_id = $3', [studentId, date, dayId]);
}

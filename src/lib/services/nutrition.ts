import type { Db } from '../db/pool';
import { ageFromBirthDate, calculateNutrition, type NutritionResult } from '../nutrition/calculator';
import { scaleFood, sumNutrients, type Nutrients } from '../nutrition/diary';
import type { AddItemInput, FoodInput, GoalInput } from '../validation/nutrition';
import type { Actor } from './training';

const NOT_FOUND = Object.assign(new Error('Registo não encontrado.'), { code: 'P0002' });
const bad = (m: string) => Object.assign(new Error(m), { code: '22023' });

// ------------------------------------------------------------------ perfil + objetivos
export interface NutritionProfile { sex: 'male' | 'female'; birthDate: string; heightCm: number; activityLevel: string; bmrFormula: string; kcalTolerancePct: number }

export const getNutritionProfile = (db: Db, studentId: string) =>
  db.one<NutritionProfile>(`select sex, birth_date as "birthDate", height_cm as "heightCm", activity_level::text as "activityLevel", bmr_formula as "bmrFormula", kcal_tolerance_pct as "kcalTolerancePct"
    from public.nutrition_profiles where student_id = $1`, [studentId]);

export interface GoalRow {
  id: string; goalType: 'cut' | 'maintenance' | 'bulk'; sex: string; ageYears: number; heightCm: number; weightKg: number; bodyFatPct: number | null; activityLevel: string;
  bmrFormula: string; bmr: number; activityFactor: number; tdee: number; adjustmentPct: number; caloriesCalculated: number; caloriesTarget: number; isManualOverride: boolean;
  proteinG: number; carbsG: number; fatG: number; proteinGPerKg: number | null; fatGPerKg: number | null; setBy: string; setByName: string | null; note: string | null; validFrom: string; createdAt: string;
}
const GOAL_COLS = `g.id, g.goal_type as "goalType", g.sex, g.age_years as "ageYears", g.height_cm as "heightCm", g.weight_kg as "weightKg", g.body_fat_pct as "bodyFatPct",
  g.activity_level::text as "activityLevel", g.bmr_formula as "bmrFormula", g.bmr, g.activity_factor as "activityFactor", g.tdee, g.adjustment_pct as "adjustmentPct",
  g.calories_calculated as "caloriesCalculated", g.calories_target as "caloriesTarget", g.is_manual_override as "isManualOverride", g.protein_g as "proteinG", g.carbs_g as "carbsG",
  g.fat_g as "fatG", g.protein_g_per_kg as "proteinGPerKg", g.fat_g_per_kg as "fatGPerKg", g.set_by as "setBy", p.full_name as "setByName", g.note, g.valid_from as "validFrom", g.created_at as "createdAt"`;

export const getCurrentGoal = (db: Db, studentId: string, today: string) =>
  db.one<GoalRow>(`select ${GOAL_COLS} from public.nutrition_goals g left join public.profiles p on p.id = g.set_by
    where g.student_id = $1 and g.valid_from <= $2 order by g.valid_from desc, g.created_at desc limit 1`, [studentId, today]);

export const listGoals = (db: Db, studentId: string, limit = 20) =>
  db.query<GoalRow>(`select ${GOAL_COLS} from public.nutrition_goals g left join public.profiles p on p.id = g.set_by
    where g.student_id = $1 order by g.valid_from desc, g.created_at desc limit $2`, [studentId, limit]);

/** Calcula (sem gravar) — usado no pré-visualizar e ao gravar. */
export function computeGoal(i: GoalInput, today: string): NutritionResult {
  const age = ageFromBirthDate(i.birthDate, new Date(today + 'T12:00:00Z'));
  if (age < 14 || age > 100) throw bad('Idade fora do intervalo suportado (14–100 anos).');
  if (i.bmrFormula === 'katch_mcardle' && i.bodyFatPct == null) throw bad('A fórmula Katch-McArdle requer a % de gordura corporal.');
  return calculateNutrition({
    sex: i.sex, ageYears: age, heightCm: i.heightCm, weightKg: i.weightKg, activityLevel: i.activityLevel as any, goal: i.goal, bodyFatPct: i.bodyFatPct ?? null,
    bmrFormula: i.bmrFormula, adjustmentPct: i.adjustmentPct, manualCalories: i.manualCalories ?? null, proteinGPerKg: i.proteinGPerKg, fatGPerKg: i.fatGPerKg,
  });
}

/** Cria uma nova meta (o histórico é imutável). O atleta guarda também o perfil; o coach só cria a meta. */
export async function createGoal(db: Db, actor: Actor, i: GoalInput, today: string): Promise<{ studentId: string; result: NutritionResult }> {
  const studentId = actor.role === 'coach' ? i.studentId : actor.id;
  if (!studentId) throw bad('Escolhe o atleta.');
  const r = computeGoal(i, today);
  const age = ageFromBirthDate(i.birthDate, new Date(today + 'T12:00:00Z'));
  if (actor.role === 'student') {
    await db.exec(
      `insert into public.nutrition_profiles (student_id, sex, birth_date, height_cm, activity_level, bmr_formula) values ($1, $2, $3, $4, $5, $6)
       on conflict (student_id) do update set sex = excluded.sex, birth_date = excluded.birth_date, height_cm = excluded.height_cm,
         activity_level = excluded.activity_level, bmr_formula = excluded.bmr_formula, updated_at = now()`,
      [studentId, i.sex, i.birthDate, i.heightCm, i.activityLevel, i.bmrFormula]);
  }
  await db.exec(
    `insert into public.nutrition_goals (student_id, goal_type, sex, age_years, height_cm, weight_kg, body_fat_pct, activity_level, bmr_formula, bmr, activity_factor, tdee,
       adjustment_pct, calories_calculated, calories_target, is_manual_override, protein_g, carbs_g, fat_g, protein_g_per_kg, fat_g_per_kg, set_by, note, valid_from)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
    [studentId, i.goal, i.sex, age, i.heightCm, i.weightKg, i.bodyFatPct ?? null, i.activityLevel, r.bmrFormula, r.bmr, r.activityFactor, r.tdee, r.adjustmentPct,
      r.caloriesCalculated, r.caloriesTarget, r.isManualOverride, r.proteinG, r.carbsG, r.fatG, r.proteinGPerKg, r.fatGPerKg, actor.id, i.note ?? null, today]);
  return { studentId, result: r };
}

// ------------------------------------------------------------------ alimentos
export interface FoodRow {
  id: string; name: string; brand: string | null; category: string | null; kcal100g: number; protein100g: number; carbs100g: number; fat100g: number;
  fiber100g: number | null; densityGPerMl: number | null; source: string; ownerId: string | null; servings: { id: string; label: string; grams: number }[];
}
const FOOD_COLS = `f.id, f.name, f.brand, f.category, f.kcal_100g as "kcal100g", f.protein_100g as "protein100g", f.carbs_100g as "carbs100g", f.fat_100g as "fat100g",
  f.fiber_100g as "fiber100g", f.density_g_per_ml as "densityGPerMl", f.source, f.owner_id as "ownerId",
  coalesce((select json_agg(json_build_object('id', s.id, 'label', s.label, 'grams', s.grams) order by s.grams) from public.food_servings s where s.food_id = f.id), '[]'::json) as servings`;

export async function searchFoods(db: Db, q: string, opts: { scope?: 'all' | 'mine'; userId?: string } = {}): Promise<FoodRow[]> {
  const term = q.trim();
  if (opts.scope === 'mine') {
    return db.query(`select ${FOOD_COLS} from public.foods f where f.owner_id = $1 and public.f_unaccent(lower(f.name)) like public.f_unaccent($2) order by f.name limit 50`,
      [opts.userId, `%${term.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`]);
  }
  if (!term) return db.query(`select ${FOOD_COLS} from public.foods f order by (f.owner_id is not null) desc, f.name limit 40`);
  return db.query(`select ${FOOD_COLS} from public.search_foods($1, 40) f`, [term]);
}

export const getFood = (db: Db, id: string) => db.one<FoodRow>(`select ${FOOD_COLS} from public.foods f where f.id = $1`, [id]);

/** Alimentos usados recentemente (adição rápida). */
export const recentFoods = (db: Db, studentId: string, limit = 8): Promise<FoodRow[]> =>
  db.query(`select ${FOOD_COLS} from public.foods f join (
      select mi.food_id, max(m.created_at) as last_used from public.meal_items mi join public.meals m on m.id = mi.meal_id
       where m.student_id = $1 and mi.food_id is not null group by mi.food_id order by max(m.created_at) desc limit $2) r on r.food_id = f.id order by r.last_used desc`, [studentId, limit]);

export async function createFood(db: Db, actor: Actor, i: FoodInput): Promise<string> {
  const r = await db.one<{ id: string }>(
    `insert into public.foods (name, brand, category, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, density_g_per_ml, source, owner_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [i.name, i.brand ?? null, i.category ?? null, i.kcal100g, i.protein100g, i.carbs100g, i.fat100g, i.fiber100g ?? null, i.densityGPerMl ?? null, (actor.realRole ?? actor.role) === 'coach' ? 'coach' : 'user', actor.id]);
  if (i.servingLabel && i.servingGrams) await db.exec('insert into public.food_servings (food_id, label, grams) values ($1,$2,$3)', [r!.id, i.servingLabel, i.servingGrams]);
  return r!.id;
}

export async function updateFood(db: Db, id: string, i: FoodInput) {
  const n = await db.exec(
    `update public.foods set name=$2, brand=$3, category=$4, kcal_100g=$5, protein_100g=$6, carbs_100g=$7, fat_100g=$8, fiber_100g=$9, density_g_per_ml=$10 where id=$1`,
    [id, i.name, i.brand ?? null, i.category ?? null, i.kcal100g, i.protein100g, i.carbs100g, i.fat100g, i.fiber100g ?? null, i.densityGPerMl ?? null]);
  if (!n) throw NOT_FOUND;
  if (i.servingLabel && i.servingGrams) {
    await db.exec('delete from public.food_servings where food_id = $1', [id]);
    await db.exec('insert into public.food_servings (food_id, label, grams) values ($1,$2,$3)', [id, i.servingLabel, i.servingGrams]);
  }
}

export async function deleteFood(db: Db, id: string) {
  if (!(await db.exec('delete from public.foods where id = $1', [id]))) throw NOT_FOUND; // itens já registados mantêm os valores (food_id → null)
}

// ------------------------------------------------------------------ diário
export interface MealItemRow { id: string; foodId: string | null; name: string; quantity: number; unit: 'g' | 'ml' | 'unit'; kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null }
export interface MealRow { id: string; mealType: string; name: string | null; items: MealItemRow[]; totals: Nutrients }

export async function getDiaryDay(db: Db, studentId: string, date: string): Promise<{ meals: MealRow[]; totals: Nutrients }> {
  const meals = await db.query<Omit<MealRow, 'items' | 'totals'>>(
    `select id, meal_type::text as "mealType", name from public.meals where student_id = $1 and log_date = $2 order by created_at`, [studentId, date]);
  const items = meals.length ? await db.query<MealItemRow & { mealId: string }>(
    `select mi.id, mi.meal_id as "mealId", mi.food_id as "foodId", mi.name, mi.quantity, mi.unit, mi.kcal, mi.protein_g as "proteinG", mi.carbs_g as "carbsG", mi.fat_g as "fatG", mi.fiber_g as "fiberG"
       from public.meal_items mi where mi.meal_id = any ($1::uuid[]) order by mi.position, mi.created_at`, [meals.map((m) => m.id)]) : [];
  const out: MealRow[] = meals.map((m) => {
    const its = items.filter((i) => i.mealId === m.id).map(({ mealId, ...r }) => r);
    return { ...m, items: its, totals: sumNutrients(its.map((i) => ({ kcal: i.kcal, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG, fiberG: i.fiberG }))) };
  });
  return { meals: out, totals: sumNutrients(out.map((m) => m.totals)) };
}

/** Acrescenta um alimento à refeição do dia/tipo (cria a refeição se ainda não existir). */
export async function addMealItem(db: Db, actor: Actor, i: AddItemInput): Promise<string> {
  const food = await getFood(db, i.foodId);
  if (!food) throw NOT_FOUND;
  let gramsPerUnit = i.gramsPerUnit ?? null;
  if (i.unit === 'unit' && !gramsPerUnit) throw bad('Indica os gramas de cada unidade.');
  const n = scaleFood({ kcal100g: food.kcal100g, protein100g: food.protein100g, carbs100g: food.carbs100g, fat100g: food.fat100g, fiber100g: food.fiber100g, densityGPerMl: food.densityGPerMl },
    { quantity: i.quantity, unit: i.unit, gramsPerUnit });
  let meal = await db.one<{ id: string }>(`select id from public.meals where student_id = $1 and log_date = $2 and meal_type = $3::public.meal_type and name is null order by created_at limit 1`, [actor.id, i.logDate, i.mealType]);
  if (!meal) meal = await db.one<{ id: string }>(`insert into public.meals (student_id, log_date, meal_type) values ($1,$2,$3::public.meal_type) returning id`, [actor.id, i.logDate, i.mealType]);
  const pos = await db.one<{ p: number }>('select coalesce(max(position) + 1, 0) as p from public.meal_items where meal_id = $1', [meal!.id]);
  const r = await db.one<{ id: string }>(
    `insert into public.meal_items (meal_id, food_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, fiber_g, position) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [meal!.id, food.id, food.name, i.quantity, i.unit, n.kcal, n.proteinG, n.carbsG, n.fatG, n.fiberG, pos!.p]);
  return r!.id;
}

/** Altera a quantidade recalculando os macros a partir do alimento (ou proporcionalmente se o alimento já não existir). */
export async function updateItemQuantity(db: Db, itemId: string, quantity: number) {
  const it = await db.one<MealItemRow>(`select id, food_id as "foodId", name, quantity, unit, kcal, protein_g as "proteinG", carbs_g as "carbsG", fat_g as "fatG", fiber_g as "fiberG" from public.meal_items where id = $1`, [itemId]);
  if (!it) throw NOT_FOUND;
  const f = 1 * quantity / it.quantity; // proporcional (mantém a unidade/equivalência originais)
  const r = (n: number) => Math.round(n * f * 10) / 10;
  const n = await db.exec(`update public.meal_items set quantity = $2, kcal = $3, protein_g = $4, carbs_g = $5, fat_g = $6, fiber_g = $7 where id = $1`,
    [itemId, quantity, r(it.kcal), r(it.proteinG), r(it.carbsG), r(it.fatG), it.fiberG == null ? null : r(it.fiberG)]);
  if (!n) throw NOT_FOUND;
}

export async function deleteMealItem(db: Db, itemId: string) {
  const it = await db.one<{ mealId: string }>('select meal_id as "mealId" from public.meal_items where id = $1', [itemId]);
  if (!it) throw NOT_FOUND;
  await db.exec('delete from public.meal_items where id = $1', [itemId]);
  await db.exec('delete from public.meals m where m.id = $1 and not exists (select 1 from public.meal_items i where i.meal_id = m.id)', [it.mealId]);
}

export async function deleteMeal(db: Db, mealId: string) {
  if (!(await db.exec('delete from public.meals where id = $1', [mealId]))) throw NOT_FOUND;
}

export async function duplicateMeal(db: Db, mealId: string, targetDate: string, mealType?: string) {
  const r = await db.one<{ id: string }>('select public.duplicate_meal($1, $2, $3::public.meal_type) as id', [mealId, targetDate, mealType ?? null]);
  return r!.id;
}
export async function saveMealAsTemplate(db: Db, mealId: string, name: string) {
  const r = await db.one<{ id: string }>('select public.save_meal_as_template($1, $2, true) as id', [mealId, name]);
  return r!.id;
}
export async function applySavedMeal(db: Db, savedId: string, targetDate: string, mealType?: string) {
  const r = await db.one<{ id: string }>('select public.apply_saved_meal($1, $2, $3::public.meal_type) as id', [savedId, targetDate, mealType ?? null]);
  return r!.id;
}

export interface SavedMealRow { id: string; name: string; isFavorite: boolean; defaultMealType: string | null; itemsCount: number; kcal: number; proteinG: number }
export const listSavedMeals = (db: Db): Promise<SavedMealRow[]> =>
  db.query(`select s.id, s.name, s.is_favorite as "isFavorite", s.default_meal_type::text as "defaultMealType", count(i.id) as "itemsCount",
      coalesce(sum(i.kcal), 0) as kcal, coalesce(sum(i.protein_g), 0) as "proteinG"
    from public.saved_meals s left join public.saved_meal_items i on i.saved_meal_id = s.id where s.owner_id = auth.uid() group by s.id order by s.is_favorite desc, s.name`);
export async function toggleSavedFavorite(db: Db, id: string) {
  if (!(await db.exec('update public.saved_meals set is_favorite = not is_favorite where id = $1', [id]))) throw NOT_FOUND;
}
export async function deleteSavedMeal(db: Db, id: string) {
  if (!(await db.exec('delete from public.saved_meals where id = $1', [id]))) throw NOT_FOUND;
}

// ------------------------------------------------------------------ estatísticas
export interface DayTotals { date: string; kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null; mealsCount: number; targetKcal: number | null; targetProteinG: number | null; targetCarbsG: number | null; targetFatG: number | null }
export const getDailyTotals = (db: Db, studentId: string, from: string, to: string): Promise<DayTotals[]> =>
  db.query(`select log_date as date, kcal, protein_g as "proteinG", carbs_g as "carbsG", fat_g as "fatG", fiber_g as "fiberG", meals_count as "mealsCount",
      calories_target as "targetKcal", protein_target_g as "targetProteinG", carbs_target_g as "targetCarbsG", fat_target_g as "targetFatG"
    from public.daily_nutrition_vs_goal where student_id = $1 and log_date between $2 and $3 order by log_date`, [studentId, from, to]);

// ------------------------------------------------------------------ peso
export interface WeightRow { id: string; date: string; weightKg: number; bodyFatPct: number | null; notes: string | null }
export const listWeights = (db: Db, studentId: string, from?: string): Promise<WeightRow[]> =>
  db.query(`select id, measured_on as date, weight_kg as "weightKg", body_fat_pct as "bodyFatPct", notes from public.body_metrics
    where student_id = $1 ${from ? 'and measured_on >= $2' : ''} order by measured_on`, from ? [studentId, from] : [studentId]);
export async function logWeight(db: Db, actor: Actor, i: { measuredOn: string; weightKg: number; bodyFatPct?: number; notes?: string }) {
  await db.exec(
    `insert into public.body_metrics (student_id, measured_on, weight_kg, body_fat_pct, notes) values ($1,$2,$3,$4,$5)
     on conflict (student_id, measured_on) do update set weight_kg = excluded.weight_kg, body_fat_pct = excluded.body_fat_pct, notes = excluded.notes, updated_at = now()`,
    [actor.id, i.measuredOn, i.weightKg, i.bodyFatPct ?? null, i.notes ?? null]);
}
export async function deleteWeight(db: Db, id: string) {
  if (!(await db.exec('delete from public.body_metrics where id = $1', [id]))) throw NOT_FOUND;
}
export interface WeightGoalRow { id: string; startWeightKg: number; targetWeightKg: number; targetDate: string | null; createdAt: string }
export const getWeightGoal = (db: Db, studentId: string) =>
  db.one<WeightGoalRow>(`select id, start_weight_kg as "startWeightKg", target_weight_kg as "targetWeightKg", target_date as "targetDate", created_at as "createdAt"
    from public.weight_goals where student_id = $1 order by created_at desc limit 1`, [studentId]);
export async function setWeightGoal(db: Db, actor: Actor, studentId: string, i: { targetWeightKg: number; targetDate?: string }) {
  const cur = await db.one<{ w: number }>('select weight_kg as w from public.body_metrics where student_id = $1 order by measured_on desc limit 1', [studentId]);
  if (!cur) throw bad('Regista primeiro o teu peso atual.');
  await db.exec('insert into public.weight_goals (student_id, start_weight_kg, target_weight_kg, target_date, set_by) values ($1,$2,$3,$4,$5)', [studentId, cur.w, i.targetWeightKg, i.targetDate ?? null, actor.id]);
}

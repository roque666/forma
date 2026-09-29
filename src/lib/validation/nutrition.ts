import { z } from 'zod';
import { MEAL_TYPES } from '../labels';
import { optionalNumber, optionalText, requiredNumber, trimmed, uuid, ymd } from './common';

const activity = z.enum(['sedentary', 'light', 'moderate', 'very_active', 'extra_active'], { errorMap: () => ({ message: 'Escolhe o nível de atividade' }) });
const mealType = z.enum(MEAL_TYPES as [string, ...string[]], { errorMap: () => ({ message: 'Escolhe a refeição' }) });

export const goalSchema = z.object({
  studentId: uuid.optional(),
  goal: z.enum(['cut', 'maintenance', 'bulk'], { errorMap: () => ({ message: 'Escolhe o objetivo' }) }),
  sex: z.enum(['male', 'female'], { errorMap: () => ({ message: 'Indica o sexo' }) }),
  birthDate: ymd.refine((v) => v < new Date().toISOString().slice(0, 10), 'Data de nascimento inválida'),
  heightCm: requiredNumber(100, 250, 'Indica a altura (cm)'),
  weightKg: requiredNumber(25, 400, 'Indica o peso (kg)'),
  activityLevel: activity,
  bodyFatPct: optionalNumber(2, 70),
  bmrFormula: z.enum(['mifflin_st_jeor', 'katch_mcardle']).default('mifflin_st_jeor'),
  adjustmentPct: optionalNumber(0, 50),
  manualCalories: optionalNumber(800, 10000),
  proteinGPerKg: optionalNumber(0.5, 4),
  fatGPerKg: optionalNumber(0.3, 3),
  note: optionalText(300),
});
export type GoalInput = z.infer<typeof goalSchema>;

export const foodSchema = z.object({
  name: trimmed(2, 120, 'Indica o nome do alimento'),
  brand: optionalText(80),
  category: optionalText(60),
  kcal100g: requiredNumber(0, 950, 'Indica as kcal por 100 g'),
  protein100g: requiredNumber(0, 100, 'Indica a proteína'),
  carbs100g: requiredNumber(0, 100, 'Indica os hidratos'),
  fat100g: requiredNumber(0, 100, 'Indica a gordura'),
  fiber100g: optionalNumber(0, 100),
  densityGPerMl: optionalNumber(0.1, 5),
  servingLabel: optionalText(40),
  servingGrams: optionalNumber(1, 5000),
}).refine((v) => v.protein100g + v.carbs100g + v.fat100g <= 100.5, { path: ['fat100g'], message: 'Proteína + hidratos + gordura não pode passar 100 g por 100 g' })
  .refine((v) => !v.servingLabel || v.servingGrams != null, { path: ['servingGrams'], message: 'Indica os gramas da porção' });
export type FoodInput = z.infer<typeof foodSchema>;

export const addItemSchema = z.object({
  foodId: uuid,
  logDate: ymd,
  mealType,
  quantity: requiredNumber(0.1, 10000, 'Indica a quantidade'),
  unit: z.enum(['g', 'ml', 'unit']),
  gramsPerUnit: optionalNumber(1, 5000),
});
export type AddItemInput = z.infer<typeof addItemSchema>;

export const updateItemSchema = z.object({ itemId: uuid, quantity: requiredNumber(0.1, 10000, 'Indica a quantidade') });

export const weightSchema = z.object({
  measuredOn: ymd,
  weightKg: requiredNumber(25, 400, 'Indica o peso (kg)'),
  bodyFatPct: optionalNumber(2, 70),
  notes: optionalText(300),
});
export const weightGoalSchema = z.object({ targetWeightKg: requiredNumber(25, 400, 'Indica o peso objetivo'), targetDate: z.preprocess((v) => (v === '' ? undefined : v), ymd.optional()) });

export const duplicateMealSchema = z.object({ mealId: uuid, targetDate: ymd, mealType: mealType.optional() });
export const applySavedSchema = z.object({ savedId: uuid, targetDate: ymd, mealType: mealType.optional() });
export const saveMealSchema = z.object({ mealId: uuid, name: trimmed(2, 80, 'Dá um nome à refeição') });

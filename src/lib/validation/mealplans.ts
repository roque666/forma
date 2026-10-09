import { z } from 'zod';
import { isValidYmd } from '../dates';
import { uuid } from './common';

export const generateSchema = z.object({
  meals: z.array(z.enum(['breakfast', 'lunch', 'snack', 'dinner'])).min(2, 'Escolhe pelo menos 2 refeições').max(4),
  days: z.union([z.literal(1), z.literal(7)]),
  seed: z.number().int().min(0).max(2_000_000_000).optional(),
});

const itemSchema = z.object({
  foodId: uuid,
  quantity: z.number().positive('Quantidade inválida').max(5000),
  unit: z.enum(['g', 'ml', 'unit']),
  gramsPerUnit: z.number().positive().max(5000).nullable().optional(),
});
export const savePlanSchema = z.object({
  name: z.string().trim().min(1, 'Indica o nome do plano').max(80),
  target: z.object({ kcal: z.number().min(0).max(20000), proteinG: z.number().min(0).max(1000), carbsG: z.number().min(0).max(2000), fatG: z.number().min(0).max(1000) }),
  days: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7),
    meals: z.array(z.object({
      type: z.enum(['breakfast', 'lunch', 'snack', 'dinner']),
      items: z.array(itemSchema).min(1).max(20),
    })).min(1).max(6),
  })).min(1, 'O plano não tem dias').max(7),
});

export const renameSchema = z.object({ name: z.string().trim().min(1, 'Indica o nome').max(80) });
export const applySchema = z.object({ dayId: uuid, date: z.string().refine(isValidYmd, 'Data inválida') });
export const itemQtySchema = z.object({ itemId: uuid, quantity: z.coerce.number().positive('Quantidade inválida').max(5000) });
export const pantrySchema = z.object({ foodIds: z.array(uuid).min(1).max(300), on: z.boolean() });

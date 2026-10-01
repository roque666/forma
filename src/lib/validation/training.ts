import { z } from 'zod';
import { MUSCLES } from '../labels';
import { checkbox, optionalInt, optionalNumber, optionalText, requiredInt, trimmed, uuid } from './common';

const muscle = z.enum(MUSCLES as [string, ...string[]], { errorMap: () => ({ message: 'Escolhe um grupo muscular' }) });

export const exerciseSchema = z.object({
  name: trimmed(2, 100, 'Indica o nome do exercício'),
  primaryMuscle: muscle,
  secondaryMuscles: z.preprocess((v) => (v === undefined || v === '' ? [] : Array.isArray(v) ? v : [v]), z.array(muscle).max(6, 'Máximo 6 músculos secundários')),
  equipment: optionalText(80),
  instructions: optionalText(2000),
  trackingType: z.enum(['weight_reps', 'bodyweight_reps', 'duration']).default('weight_reps'),
  mediaUrl: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(300, 'Link demasiado longo').url('Link inválido').refine((u) => u.startsWith('https://'), 'O link tem de começar por https://').optional()),
}).refine((v) => !v.secondaryMuscles.includes(v.primaryMuscle), { path: ['secondaryMuscles'], message: 'O músculo principal não pode ser secundário' });

export const planSchema = z.object({
  name: trimmed(2, 80, 'Indica o nome do plano'),
  description: optionalText(500),
  studentId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  isTemplate: checkbox.optional(),
});

export const weekdaysSchema = z.preprocess(
  (v) => (v === undefined || v === '' ? [] : (Array.isArray(v) ? v : [v]).map(Number)),
  z.array(z.number().int().min(1).max(7)).max(7),
);
export const daySchema = z.object({ name: trimmed(1, 60, 'Indica o nome do dia'), weekdays: weekdaysSchema });

export const planExerciseMetaSchema = z.object({
  restSeconds: requiredInt(0, 1800, 'Indica o descanso (segundos)'),
  notes: optionalText(500),
});

export const planSetSchema = z.object({
  setType: z.enum(['normal', 'warmup']).default('normal'),
  repsMin: optionalInt(1, 500),
  repsMax: optionalInt(1, 500),
  weightKg: optionalNumber(0, 1000),
  rir: optionalNumber(0, 10),
}).refine((s) => s.repsMin == null || s.repsMax == null || s.repsMax >= s.repsMin, { path: ['repsMax'], message: 'Máx. tem de ser ≥ mín.' });
export const planSetsSchema = z.array(planSetSchema).min(1, 'Define pelo menos 1 série').max(20, 'Máximo 20 séries');

export const setLogSchema = z.object({
  setId: uuid,
  weightKg: z.number().min(0, 'Peso inválido').max(1000, 'Peso demasiado alto').nullable(),
  reps: z.number().int('Repetições inválidas').min(0).max(1000, 'Repetições demasiado altas').nullable(),
  rir: z.number().min(0).max(10).nullable(),
  notes: z.string().trim().max(500).nullable().optional(),
  completed: z.boolean(),
});
export type SetLogInput = z.infer<typeof setLogSchema>;

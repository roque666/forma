import { z } from 'zod';
import { optionalNumber } from './common';
import { isValidYmd } from '../dates';

export const photoSchema = z.object({
  takenOn: z.string().refine(isValidYmd, 'Data inválida'),
  angle: z.enum(['front', 'side', 'back'], { errorMap: () => ({ message: 'Escolhe o ângulo' }) }),
  weightKg: optionalNumber(20, 400, 'Peso inválido'),
  note: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
  shared: z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
});

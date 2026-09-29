import { z } from 'zod';

/** '' / null / undefined → undefined; caso contrário número. */
export const optionalNumber = (min?: number, max?: number, msg = 'Valor inválido') => {
  let n = z.coerce.number({ invalid_type_error: msg }).finite(msg);
  if (min !== undefined) n = n.min(min, `Mínimo ${min}`);
  if (max !== undefined) n = n.max(max, `Máximo ${max}`);
  return z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? v.replace(',', '.') : v), n.optional());
};

export const requiredNumber = (min?: number, max?: number, msg = 'Valor obrigatório') => {
  let n = z.coerce.number({ invalid_type_error: msg, required_error: msg }).finite(msg);
  if (min !== undefined) n = n.min(min, `Mínimo ${min}`);
  if (max !== undefined) n = n.max(max, `Máximo ${max}`);
  return z.preprocess((v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.replace(',', '.')) : v), n);
};

export const requiredInt = (min?: number, max?: number, msg = 'Valor obrigatório') =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v) : v),
    z.coerce.number({ invalid_type_error: msg, required_error: msg }).int('Tem de ser um número inteiro').min(min ?? -Infinity, `Mínimo ${min}`).max(max ?? Infinity, `Máximo ${max}`),
  );

export const optionalInt = (min?: number, max?: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int('Tem de ser um número inteiro').min(min ?? -Infinity, `Mínimo ${min}`).max(max ?? Infinity, `Máximo ${max}`).optional(),
  );

export const uuid = z.string().uuid('Identificador inválido');

export const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((v) => !Number.isNaN(Date.parse(v + 'T00:00:00Z')), 'Data inválida');

export const trimmed = (min = 1, max = 200, msg = 'Campo obrigatório') =>
  z.string({ required_error: msg }).trim().min(min, msg).max(max, `Máximo ${max} caracteres`);

export const optionalText = (max = 1000) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(max, `Máximo ${max} caracteres`).optional());

export const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());

import { z } from 'zod';
import { trimmed } from './common';

export const passwordSchema = z
  .string({ required_error: 'Palavra-passe obrigatória' })
  .min(10, 'Mínimo 10 caracteres')
  .max(128, 'Máximo 128 caracteres')
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Usa letras e pelo menos um número');

export const emailSchema = z
  .string({ required_error: 'Email obrigatório' })
  .trim()
  .toLowerCase()
  .max(254)
  .email('Email inválido');

export const registerSchema = z
  .object({
    fullName: trimmed(2, 80, 'Indica o teu nome'),
    email: emailSchema,
    password: passwordSchema,
    coachCode: z.string().trim().max(100).optional(),
  })
  .refine((v) => v.password.toLowerCase() !== v.email, { path: ['password'], message: 'A palavra-passe não pode ser o email' });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Palavra-passe obrigatória').max(128),
  next: z.string().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Indica a palavra-passe atual'),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'As palavras-passe não coincidem' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'A nova palavra-passe tem de ser diferente' });

export const resetRequestSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z
  .object({ token: z.string().min(20).max(200), newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'As palavras-passe não coincidem' });

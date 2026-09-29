import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import type { ZodError, ZodTypeAny, z } from 'zod';
import { dbErrorMessage } from './db/pool';

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const ok = <T = undefined>(data?: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
export const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult<never> => ({ ok: false, error, fieldErrors });

export function zodFail(err: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fail(Object.values(fieldErrors)[0] ?? 'Dados inválidos.', fieldErrors);
}

/** Valida com zod; devolve os dados ou um ActionResult de erro. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): { data: z.infer<S> } | { error: ActionResult<never> } {
  const r = schema.safeParse(input);
  return r.success ? { data: r.data } : { error: zodFail(r.error) };
}

/** Executa uma ação garantindo que erros inesperados viram mensagens seguras (e que redirect() passa). */
export async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if ((e as { code?: string })?.code) return fail(dbErrorMessage(e));
    console.error('[action]', e);
    return fail('Ocorreu um erro inesperado. Tenta novamente.');
  }
}

export function formToObject(fd: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const key of new Set(fd.keys())) {
    const all = fd.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

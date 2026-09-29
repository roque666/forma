'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formToObject, ok, parse, run, type ActionResult } from '../actions';
import { requireUser } from '../auth/session';
import { withUser } from '../db/pool';
import { trimmed } from '../validation/common';

const tzOk = (tz: string) => { try { new Intl.DateTimeFormat('pt-PT', { timeZone: tz }); return true; } catch { return false; } };

export async function updateProfileAction(_p: ActionResult<any> | null, fd: FormData): Promise<ActionResult<any>> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(z.object({ fullName: trimmed(2, 80, 'Indica o teu nome'), timezone: z.string().refine(tzOk, 'Fuso horário inválido') }), formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => db.exec('update public.profiles set full_name = $2, timezone = $3 where id = $1', [user.id, p.data.fullName, p.data.timezone]));
    revalidatePath('/', 'layout');
    return ok(undefined, 'Perfil atualizado.');
  });
}

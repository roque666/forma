'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formToObject, ok, parse, run, type ActionResult } from '../actions';
import { requireUser } from '../auth/session';
import { withUser } from '../db/pool';
import * as a from '../activities/activities';
import { activitySchema } from '../validation/training';
import { uuid } from '../validation/common';
import { isValidYmd, todayInTz } from '../dates';

type FormState = ActionResult<any> | null;
const refresh = () => { revalidatePath('/activities'); revalidatePath('/calendar'); revalidatePath('/dashboard'); revalidatePath('/workouts'); };

export async function createActivityAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(activitySchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => a.createActivity(db, user.id, p.data));
    refresh();
    redirect('/activities?created=1');
  });
}

export async function updateActivityAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(activitySchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => a.updateActivity(db, uuid.parse(id), p.data));
    refresh();
    return ok(undefined, 'Atividade atualizada.');
  });
}

export async function deleteActivityAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => a.deleteActivity(db, uuid.parse(fd.get('id'))));
  refresh();
  redirect('/activities?deleted=1');
}

/** Marca/desmarca como feita (só em dias que não sejam futuros). */
export async function toggleActivityDoneAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const date = String(fd.get('date') ?? '');
  if (!isValidYmd(date) || date > todayInTz(user.timezone)) return;
  await withUser(user.id, (db) => a.toggleActivityDone(db, user.id, uuid.parse(fd.get('id')), date));
  refresh();
}

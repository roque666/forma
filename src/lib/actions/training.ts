'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { fail, formToObject, ok, parse, run, type ActionResult } from '../actions';
import { requireUser } from '../auth/session';
import { withUser } from '../db/pool';
import * as t from '../services/training';
import { daySchema, exerciseSchema, planExerciseMetaSchema, planSchema, planSetsSchema, setLogSchema, type SetLogInput } from '../validation/training';
import { uuid } from '../validation/common';
import type { PrEventRow } from '../data/sessions';

type FormState = ActionResult<any> | null;
const idOf = (v: unknown) => uuid.parse(v);

// ------------------------------------------------------------------ exercícios
export async function createExerciseAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(exerciseSchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => t.createExercise(db, user, p.data));
    revalidatePath('/exercises');
    redirect('/exercises?created=1');
  });
}

export async function updateExerciseAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(exerciseSchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => t.updateExercise(db, idOf(id), p.data));
    revalidatePath('/exercises');
    return ok(undefined, 'Exercício atualizado.');
  });
}

export async function removeExerciseAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = idOf(fd.get('id'));
  const r = await withUser(user.id, (db) => t.removeExercise(db, id));
  revalidatePath('/exercises');
  redirect(`/exercises?${r === 'archived' ? 'archived=1' : 'deleted=1'}`);
}

export async function restoreExerciseAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => t.restoreExercise(db, idOf(fd.get('id'))));
  revalidatePath('/exercises');
}

// ------------------------------------------------------------------ planos
export async function createPlanAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(planSchema, formToObject(fd));
    if ('error' in p) return p.error;
    const data = user.role === 'coach' && !p.data.studentId ? { ...p.data, isTemplate: true } : p.data;
    const id = await withUser(user.id, (db) => t.createPlan(db, user, data));
    revalidatePath('/workouts');
    redirect(`/workouts/${id}`);
  });
}

export async function updatePlanAction(planId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(planSchema.pick({ name: true, description: true }), formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => t.updatePlan(db, idOf(planId), p.data));
    revalidatePath(`/workouts/${planId}`);
    return ok(undefined, 'Plano atualizado.');
  });
}

async function planOp(fd: FormData, fn: (db: Parameters<Parameters<typeof withUser>[1]>[0], id: string, userId: string) => Promise<unknown>, after?: string) {
  const user = await requireUser();
  const id = idOf(fd.get('id'));
  await withUser(user.id, (db) => fn(db, id, user.id));
  revalidatePath('/workouts');
  revalidatePath(`/workouts/${id}`);
  if (after) redirect(after);
}

export async function activatePlanAction(fd: FormData) { await planOp(fd, (db, id) => t.activatePlan(db, id)); }
export async function archivePlanAction(fd: FormData) { await planOp(fd, (db, id) => t.archivePlan(db, id, fd.get('archived') === '1'), '/workouts'); }
export async function deletePlanAction(fd: FormData) { await planOp(fd, (db, id) => t.deletePlan(db, id), '/workouts'); }
export async function duplicatePlanAction(fd: FormData) {
  const user = await requireUser();
  const id = idOf(fd.get('id'));
  const newId = await withUser(user.id, (db) => t.duplicatePlan(db, id));
  revalidatePath('/workouts');
  redirect(`/workouts/${newId}`);
}

export async function assignTemplateAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(z.object({ templateId: uuid, studentId: uuid }), formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => t.assignTemplate(db, p.data.templateId, p.data.studentId));
    revalidatePath('/workouts');
    revalidatePath(`/students/${p.data.studentId}`, 'layout');
    return ok(undefined, 'Plano atribuído ao atleta.');
  });
}

/** Coach (mesmo em "O meu treino"): transforma um plano seu em modelo, ou dá uma cópia a um atleta ativo. */
export async function sharePlanAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    if (user.realRole !== 'coach') return fail('Só coaches podem partilhar planos.');
    const p = parse(z.object({ planId: uuid, studentId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()) }), formToObject(fd));
    if ('error' in p) return p.error;
    const { planId, studentId } = p.data;
    await withUser(user.id, (db) => t.duplicatePlan(db, planId, studentId ? { targetStudentId: studentId } : { asTemplate: true }));
    revalidatePath('/workouts');
    if (studentId) revalidatePath(`/students/${studentId}`, 'layout');
    return ok(undefined, studentId ? 'Cópia enviada ao atleta (aparece nos planos dele).' : 'Guardado como modelo. Encontras em Treinos, no modo Coach.');
  });
}

// dias
export async function addDayAction(planId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(daySchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => t.addDay(db, idOf(planId), p.data.name, p.data.weekdays));
    revalidatePath(`/workouts/${planId}`);
    return ok(undefined, 'Dia adicionado.');
  });
}
export async function updateDayAction(planId: string, dayId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(daySchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => t.updateDay(db, idOf(dayId), p.data.name, p.data.weekdays));
    revalidatePath(`/workouts/${planId}`);
    return ok(undefined, 'Dia atualizado.');
  });
}
export async function deleteDayAction(planId: string, fd: FormData) {
  const user = await requireUser();
  await withUser(user.id, (db) => t.deleteDay(db, idOf(fd.get('id'))));
  revalidatePath(`/workouts/${planId}`);
}
export async function moveDayAction(planId: string, fd: FormData) {
  const user = await requireUser();
  await withUser(user.id, (db) => t.moveDay(db, idOf(fd.get('id')), fd.get('dir') === 'up' ? 'up' : 'down'));
  revalidatePath(`/workouts/${planId}`);
}

// exercícios do plano
export async function addPlanExerciseAction(planId: string, dayId: string, exerciseId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    await withUser(user.id, (db) => t.addPlanExercise(db, idOf(dayId), idOf(exerciseId)));
    revalidatePath(`/workouts/${planId}`);
    return ok(undefined, 'Exercício adicionado.');
  });
}
export async function removePlanExerciseAction(planId: string, fd: FormData) {
  const user = await requireUser();
  await withUser(user.id, (db) => t.removePlanExercise(db, idOf(fd.get('id'))));
  revalidatePath(`/workouts/${planId}`);
}
export async function movePlanExerciseAction(planId: string, fd: FormData) {
  const user = await requireUser();
  await withUser(user.id, (db) => t.movePlanExercise(db, idOf(fd.get('id')), fd.get('dir') === 'up' ? 'up' : 'down'));
  revalidatePath(`/workouts/${planId}`);
}
export async function updatePlanExerciseAction(planId: string, peId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(planExerciseMetaSchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => t.updatePlanExercise(db, idOf(peId), p.data));
    revalidatePath(`/workouts/${planId}`);
    return ok(undefined, 'Guardado.');
  });
}
export async function savePlanSetsAction(planId: string, peId: string, sets: unknown): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(planSetsSchema, sets);
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => t.savePlanSets(db, idOf(peId), p.data));
    revalidatePath(`/workouts/${planId}`);
    return ok(undefined, 'Séries guardadas.');
  });
}

// ------------------------------------------------------------------ sessões
export async function startSessionAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const raw = fd.get('dayId');
  const dayId = typeof raw === 'string' && raw ? idOf(raw) : null;
  const { id } = await withUser(user.id, (db) => t.startSession(db, user.id, dayId));
  redirect(`/session/${id}`);
}

export interface SaveSetResult { prs: Pick<PrEventRow, 'id' | 'exerciseName' | 'prType' | 'value' | 'previousValue' | 'weightKg' | 'reps'>[] }

export async function saveSetAction(input: SetLogInput): Promise<ActionResult<SaveSetResult>> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(setLogSchema, input);
    if ('error' in p) return p.error;
    const r = await withUser(user.id, (db) => t.saveSet(db, p.data));
    return ok({ prs: r.prs });
  });
}

export async function addSetAction(sessionExerciseId: string): Promise<ActionResult<t.SetRowLite>> {
  return run(async () => {
    const user = await requireUser();
    return ok(await withUser(user.id, (db) => t.addSet(db, idOf(sessionExerciseId))));
  });
}
export async function removeSetAction(setId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    await withUser(user.id, (db) => t.removeSet(db, idOf(setId)));
    return ok();
  });
}
export async function addSessionExerciseAction(sessionId: string, exerciseId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    await withUser(user.id, (db) => t.addSessionExercise(db, idOf(sessionId), idOf(exerciseId)));
    revalidatePath(`/session/${sessionId}`);
    return ok(undefined, 'Exercício adicionado.');
  });
}
export async function removeSessionExerciseAction(sessionId: string, seId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    await withUser(user.id, (db) => t.removeSessionExercise(db, idOf(seId)));
    revalidatePath(`/session/${sessionId}`);
    return ok();
  });
}

export async function finishSessionAction(sessionId: string, notes: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    await withUser(user.id, (db) => t.finishSession(db, idOf(sessionId), notes.trim().slice(0, 1000) || undefined));
    revalidatePath('/dashboard');
    revalidatePath('/history');
    redirect(`/session/${sessionId}`);
  });
}
export async function discardSessionAction(sessionId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    await withUser(user.id, (db) => t.discardSession(db, idOf(sessionId)));
    revalidatePath('/workouts');
    redirect('/workouts');
  });
}
export async function deleteSessionAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => t.deleteSession(db, user.id, idOf(fd.get('id'))));
  revalidatePath('/history');
  redirect('/history');
}

export async function commentSessionAction(sessionId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(z.object({ body: z.string().trim().min(1, 'Escreve um comentário').max(1000) }), formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => t.coachComment(db, idOf(sessionId), p.data.body));
    revalidatePath(`/session/${sessionId}`);
    return ok(undefined, 'Comentário enviado.');
  });
}

export async function coachCorrectSetAction(sessionId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    if (user.role !== 'coach') return fail('Só o coach pode fazer correções.');
    const num = (k: string) => { const v = String(fd.get(k) ?? '').replace(',', '.').trim(); return v === '' ? null : Number(v); };
    const p = parse(z.object({
      setId: uuid,
      reason: z.string().trim().min(5, 'Indica o motivo (mín. 5 caracteres)').max(300),
      weightKg: z.number().min(0).max(1000).nullable(),
      reps: z.number().int().min(0).max(1000).nullable(),
      rir: z.number().min(0).max(10).nullable(),
    }), { setId: fd.get('setId'), reason: fd.get('reason'), weightKg: num('weightKg'), reps: num('reps'), rir: num('rir') });
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => db.query('select public.coach_correct_session_set($1, $2, $3, $4, $5)', [p.data.setId, p.data.reason, p.data.weightKg, p.data.reps, p.data.rir]));
    revalidatePath(`/session/${sessionId}`);
    return ok(undefined, 'Correção registada.');
  });
}

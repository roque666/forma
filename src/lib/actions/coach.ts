'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, formToObject, ok, parse, run, type ActionResult } from '../actions';
import { requireUser } from '../auth/session';
import { withAdmin, withUser } from '../db/pool';
import { mailLayout, sendMail } from '../mailer';
import * as c from '../services/coach';
import { checkbox, optionalNumber, requiredInt, trimmed, uuid } from '../validation/common';

type FormState = ActionResult<any> | null;

const requireCoach = async () => {
  const u = await requireUser();
  if (u.role !== 'coach') throw Object.assign(new Error('Só coaches podem fazer isto.'), { code: '42501' });
  return u;
};

export async function inviteStudentAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const coach = await requireCoach();
    const p = parse(z.object({ email: z.string().trim().toLowerCase().email('Email inválido').max(200) }), formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(coach.id, (db) => c.inviteStudent(db, p.data.email));
    const url = `${process.env.APP_URL ?? 'http://localhost:3000'}/login`;
    const m = mailLayout({ title: `${coach.fullName} convidou-te para a Forma`, paragraphs: [`${coach.fullName} quer acompanhar o teu treino e nutrição.`, 'Inicia sessão (ou cria conta com este email) e aceita o convite no teu perfil. Só partilhas dados depois de aceitares.'], button: { label: 'Abrir a Forma', url } });
    await sendMail({ to: p.data.email, subject: `${coach.fullName} convidou-te para a Forma`, text: m.text, html: m.html });
    revalidatePath('/students');
    return ok(undefined, 'Convite enviado. O atleta tem de o aceitar para partilhar os dados.');
  });
}

export async function createStudentAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const coach = await requireCoach();
    const p = parse(z.object({ fullName: trimmed(2, 100, 'Indica o nome'), email: z.string().trim().toLowerCase().email('Email inválido').max(200), consent: checkbox }), formToObject(fd));
    if ('error' in p) return p.error;
    if (!p.data.consent) return fail('Confirma que o atleta autorizou a partilha de dados.', { consent: 'Obrigatório' });
    const r = await withAdmin((db) => c.createStudentAccount(db, coach, p.data));
    revalidatePath('/students');
    return ok({ email: p.data.email, tempPassword: r.tempPassword, studentId: r.studentId }, 'Conta criada.');
  });
}

export async function acceptInviteAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  await withUser(u.id, (db) => c.acceptInvite(db, uuid.parse(fd.get('id'))));
  revalidatePath('/', 'layout');
}
export async function endLinkAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  await withUser(u.id, (db) => c.endLink(db, uuid.parse(fd.get('id'))));
  revalidatePath('/', 'layout');
}

export async function saveThresholdsAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const coach = await requireCoach();
    const p = parse(z.object({
      workoutAlertDays: requiredInt(1, 90), mealAlertDays: requiredInt(1, 90), weighInAlertDays: requiredInt(1, 90), inactiveDays: requiredInt(1, 180),
    }), formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(coach.id, (db) => c.saveThresholds(db, coach.id, p.data));
    revalidatePath('/students');
    revalidatePath('/dashboard');
    return ok(undefined, 'Limites de alerta guardados.');
  });
}

export async function addNoteAction(studentId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const coach = await requireCoach();
    const p = parse(z.object({ body: trimmed(1, 2000, 'Escreve a nota') }), formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(coach.id, (db) => c.addNote(db, uuid.parse(studentId), p.data.body));
    revalidatePath(`/students/${studentId}`);
    return ok(undefined, 'Nota guardada.');
  });
}
export async function deleteNoteAction(studentId: string, fd: FormData): Promise<void> {
  const coach = await requireCoach();
  await withUser(coach.id, (db) => c.deleteNote(db, uuid.parse(fd.get('id'))));
  revalidatePath(`/students/${studentId}`);
}

// correções auditadas (refeições e peso; treinos estão em actions/training.ts)
export async function coachCorrectMealItemAction(studentId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const coach = await requireCoach();
    const p = parse(z.object({ itemId: uuid, reason: trimmed(5, 300, 'Indica o motivo (mín. 5 caracteres)'), quantity: optionalNumber(0.1, 10000), kcal: optionalNumber(0, 5000), proteinG: optionalNumber(0, 500), carbsG: optionalNumber(0, 1000), fatG: optionalNumber(0, 500) }), formToObject(fd));
    if ('error' in p) return p.error;
    const d = p.data;
    await withUser(coach.id, (db) => db.query('select public.coach_correct_meal_item($1,$2,$3,$4,$5,$6,$7)', [d.itemId, d.reason, d.quantity ?? null, d.kcal ?? null, d.proteinG ?? null, d.carbsG ?? null, d.fatG ?? null]));
    revalidatePath(`/students/${studentId}`);
    return ok(undefined, 'Correção registada.');
  });
}
export async function coachCorrectWeightAction(studentId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const coach = await requireCoach();
    const p = parse(z.object({ id: uuid, reason: trimmed(5, 300, 'Indica o motivo (mín. 5 caracteres)'), weightKg: optionalNumber(25, 400), bodyFatPct: optionalNumber(2, 70) }), formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(coach.id, (db) => db.query('select public.coach_correct_body_metric($1,$2,$3,$4)', [p.data.id, p.data.reason, p.data.weightKg ?? null, p.data.bodyFatPct ?? null]));
    revalidatePath(`/students/${studentId}`);
    return ok(undefined, 'Correção registada.');
  });
}

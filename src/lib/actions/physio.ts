'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { fail, formToObject, ok, parse, run, type ActionResult } from '../actions';
import { requireUser } from '../auth/session';
import { withUser } from '../db/pool';
import { mailLayout, sendMail } from '../mailer';
import * as ph from '../physio/physio';
import { rehabItemSchema, rehabLogSchema, rehabProgramSchema } from '../validation/training';
import { uuid } from '../validation/common';
import { todayInTz } from '../dates';

type FormState = ActionResult<any> | null;
const idOf = (v: unknown) => uuid.parse(v);

async function requirePhysio() {
  const u = await requireUser();
  if (u.realRole !== 'physio') throw Object.assign(new Error('Só fisioterapeutas podem fazer isto.'), { code: '42501' });
  return u;
}
const refresh = (patientId?: string) => {
  revalidatePath('/patients'); revalidatePath('/rehab'); revalidatePath('/dashboard');
  if (patientId) revalidatePath(`/patients/${patientId}`, 'layout');
};

// ------------------------------------------------------------------ vínculo
export async function invitePatientAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const physio = await requirePhysio();
    const p = parse(z.object({ email: z.string().trim().toLowerCase().email('Email inválido').max(200) }), formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(physio.id, (db) => ph.invitePatient(db, p.data.email));
    const m = mailLayout({
      title: `${physio.fullName} convidou-te para a Forma`,
      paragraphs: [`${physio.fullName} (fisioterapeuta) quer atribuir-te exercícios para fazeres ao teu ritmo e acompanhar a tua evolução.`, 'Inicia sessão (ou cria conta com este email) e aceita o convite em Reabilitação. Só partilhas os exercícios que fizeres, nada mais.'],
      button: { label: 'Abrir a Forma', url: `${process.env.APP_URL ?? 'http://localhost:3000'}/rehab` },
    });
    await sendMail({ to: p.data.email, subject: `${physio.fullName} convidou-te para a Forma`, text: m.text, html: m.html });
    refresh();
    return ok(undefined, 'Convite enviado. O paciente tem de o aceitar.');
  });
}

export async function acceptPhysioInviteAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  await withUser(u.id, (db) => ph.acceptPhysioLink(db, idOf(fd.get('id'))));
  revalidatePath('/', 'layout');
}
export async function endPhysioLinkAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  await withUser(u.id, (db) => ph.endPhysioLink(db, idOf(fd.get('id'))));
  revalidatePath('/', 'layout');
  if (u.realRole === 'physio') redirect('/patients');
}

// ------------------------------------------------------------------ programas
export async function createProgramAction(patientId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const physio = await requirePhysio();
    const p = parse(rehabProgramSchema, formToObject(fd));
    if ('error' in p) return p.error;
    const id = await withUser(physio.id, (db) => ph.createProgram(db, physio.id, idOf(patientId), p.data));
    refresh(patientId);
    redirect(`/patients/${patientId}/programs/${id}`);
  });
}

export async function updateProgramAction(patientId: string, programId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const physio = await requirePhysio();
    const p = parse(rehabProgramSchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(physio.id, (db) => ph.updateProgram(db, idOf(programId), p.data));
    refresh(patientId);
    return ok(undefined, 'Programa atualizado.');
  });
}

export async function archiveProgramAction(patientId: string, fd: FormData): Promise<void> {
  const physio = await requirePhysio();
  await withUser(physio.id, (db) => ph.archiveProgram(db, idOf(fd.get('id')), fd.get('archived') === '1'));
  refresh(patientId);
  redirect(`/patients/${patientId}`);
}

export async function deleteProgramAction(patientId: string, fd: FormData): Promise<void> {
  const physio = await requirePhysio();
  await withUser(physio.id, (db) => ph.deleteProgram(db, idOf(fd.get('id'))));
  refresh(patientId);
  redirect(`/patients/${patientId}`);
}

export async function addProgramItemAction(patientId: string, programId: string, exerciseId: string): Promise<ActionResult> {
  return run(async () => {
    const physio = await requirePhysio();
    await withUser(physio.id, (db) => ph.addItem(db, idOf(programId), idOf(exerciseId)));
    refresh(patientId);
    return ok(undefined, 'Exercício adicionado.');
  });
}

export async function updateProgramItemAction(patientId: string, itemId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const physio = await requirePhysio();
    const p = parse(rehabItemSchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(physio.id, (db) => ph.updateItem(db, idOf(itemId), p.data));
    refresh(patientId);
    return ok(undefined, 'Exercício atualizado.');
  });
}

export async function removeProgramItemAction(patientId: string, fd: FormData): Promise<void> {
  const physio = await requirePhysio();
  await withUser(physio.id, (db) => ph.removeItem(db, idOf(fd.get('id'))));
  refresh(patientId);
}

export async function moveProgramItemAction(patientId: string, fd: FormData): Promise<void> {
  const physio = await requirePhysio();
  await withUser(physio.id, (db) => ph.moveItem(db, idOf(fd.get('id')), fd.get('dir') === 'up' ? 'up' : 'down'));
  refresh(patientId);
}

// ------------------------------------------------------------------ registos (paciente)
export async function logRehabAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(rehabLogSchema, formToObject(fd));
    if ('error' in p) return p.error;
    await withUser(user.id, (db) => ph.logExercise(db, user.id, p.data.itemId, { doneOn: todayInTz(user.timezone), pain: p.data.pain, note: p.data.note }));
    refresh();
    return ok(undefined, 'Exercício registado. Bom trabalho!');
  });
}

export async function undoRehabLogAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => ph.undoLog(db, idOf(fd.get('id'))));
  refresh();
}

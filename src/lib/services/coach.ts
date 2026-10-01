import type { Db } from '../db/pool';
import { DEFAULT_THRESHOLDS, computeFollowUp, sortByAttention, type FollowUpThresholds } from '../coach/followup';
import type { StudentOverviewRow } from '../data/coach';
import { hashPassword, generateTempPassword } from '../auth/password';
import type { Actor } from './training';

const bad = (m: string, code = '22023') => Object.assign(new Error(m), { code });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function inviteStudent(db: Db, email: string): Promise<string> {
  const r = await db.one<{ id: string }>('select public.coach_invite_student($1, $2) as id', [email, 'primary']);
  return r!.id;
}
export const acceptInvite = (db: Db, linkId: string) => db.query('select public.accept_coach_link($1)', [linkId]);
export const endLink = (db: Db, linkId: string) => db.query('select public.end_coach_link($1)', [linkId]);

export const myPendingInvites = (db: Db) =>
  db.query<{ linkId: string; coachId: string; coachName: string; linkType: string; createdAt: string }>(
    'select link_id as "linkId", coach_id as "coachId", coach_name as "coachName", link_type as "linkType", created_at as "createdAt" from public.my_pending_invites()');

export const myCoach = (db: Db, studentId: string) =>
  db.one<{ linkId: string; coachId: string; coachName: string; since: string }>(
    `select cs.id as "linkId", cs.coach_id as "coachId", p.full_name as "coachName", cs.consent_at as since from public.coach_students cs
      join public.profiles p on p.id = cs.coach_id where cs.student_id = $1 and cs.status = 'active' limit 1`, [studentId]);

/**
 * Cria a conta de um atleta com palavra-passe temporária (o atleta é obrigado a mudá-la no primeiro login).
 * Corre com privilégios de servidor porque cria um utilizador; só é chamado depois de confirmar que o autor é coach.
 * O consentimento é atestado pelo coach (fica registado em consent_at).
 */
export async function createStudentAccount(admin: Db, coach: Actor, i: { fullName: string; email: string }): Promise<{ studentId: string; tempPassword: string }> {
  if (coach.role !== 'coach') throw bad('Apenas coaches podem criar contas de atletas.', '42501');
  const email = i.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('Email inválido.');
  if (await admin.one('select 1 from auth.users where lower(email) = $1', [email])) throw bad('Já existe uma conta com este email. Convida o atleta por email em vez de criar a conta.', '23505');
  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);
  const u = await admin.one<{ id: string }>(
    `insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, jsonb_build_object('full_name', $3::text)) returning id`, [email, hash, i.fullName]);
  await admin.exec('update public.profiles set must_change_password = true where id = $1', [u!.id]);
  await admin.exec(`insert into public.coach_students (coach_id, student_id, status, origin, invite_email, consent_at) values ($1, $2, 'active', 'coach_created', $3, now())`, [coach.id, u!.id, email]);
  return { studentId: u!.id, tempPassword };
}

// ------------------------------------------------------------------ acompanhamento
export async function getThresholds(db: Db, coachId: string): Promise<FollowUpThresholds> {
  const r = await db.one<FollowUpThresholds>(
    `select workout_alert_days as "workoutAlertDays", meal_alert_days as "mealAlertDays", weigh_in_alert_days as "weighInAlertDays", inactive_days as "inactiveDays" from public.coach_settings where coach_id = $1`, [coachId]);
  return r ?? DEFAULT_THRESHOLDS;
}
export async function saveThresholds(db: Db, coachId: string, t: FollowUpThresholds) {
  await db.exec(`insert into public.coach_settings (coach_id, workout_alert_days, meal_alert_days, weigh_in_alert_days, inactive_days) values ($1,$2,$3,$4,$5)
    on conflict (coach_id) do update set workout_alert_days = excluded.workout_alert_days, meal_alert_days = excluded.meal_alert_days,
      weigh_in_alert_days = excluded.weigh_in_alert_days, inactive_days = excluded.inactive_days, updated_at = now()`, [coachId, t.workoutAlertDays, t.mealAlertDays, t.weighInAlertDays, t.inactiveDays]);
}

export function withFollowUp(rows: StudentOverviewRow[], today: string, t: FollowUpThresholds, tz: string) {
  return sortByAttention(rows.map((r) => ({
    ...r,
    followUp: computeFollowUp({ linkStatus: r.linkStatus, lastWorkoutAt: r.lastWorkoutAt, lastMealDate: r.lastMealDate, lastWeighIn: r.lastWeighIn, hasActivePlan: !!r.currentPlanId, linkedAt: r.linkedAt }, today, t, tz),
  })));
}

// ------------------------------------------------------------------ notas privadas do coach
export const listNotes = (db: Db, studentId: string) =>
  db.query<{ id: string; body: string; createdAt: string }>(`select id, body, created_at as "createdAt" from public.coach_notes where student_id = $1 and coach_id = auth.uid() order by created_at desc`, [studentId]);
export async function addNote(db: Db, studentId: string, body: string) { await db.exec('insert into public.coach_notes (student_id, body) values ($1, $2)', [studentId, body]); }
export async function deleteNote(db: Db, id: string) { await db.exec('delete from public.coach_notes where id = $1', [id]); }

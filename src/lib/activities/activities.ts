import type { Db } from '../db/pool';
import { itemsOnActivities, type Recurrence } from '../training/calendar';

export interface ActivityRow {
  id: string; name: string; weekdays: number[]; startTime: string | null; durationMin: number | null; notes: string | null;
  recurrence: Recurrence; archived: boolean;
}

const COLS = `id, name, weekdays, to_char(start_time, 'HH24:MI') as "startTime", duration_min as "durationMin", notes, archived_at is not null as archived,
  json_build_object('kind', recur_kind, 'every', recur_every, 'weekOfMonth', recur_week_of_month,
                    'anchor', to_char(recur_anchor, 'YYYY-MM-DD'), 'endsOn', to_char(ends_on, 'YYYY-MM-DD')) as recurrence`;

export const listActivities = (db: Db, studentId: string, includeArchived = false): Promise<ActivityRow[]> =>
  db.query(`select ${COLS} from public.activities where student_id = $1 ${includeArchived ? '' : 'and archived_at is null'} order by created_at`, [studentId]);

export const getActivity = (db: Db, id: string): Promise<ActivityRow | null> => db.one(`select ${COLS} from public.activities where id = $1`, [id]);

export const listActivityLogs = (db: Db, studentId: string, from: string, to: string) =>
  db.query<{ activityId: string; doneOn: string }>(
    `select activity_id as "activityId", to_char(done_on, 'YYYY-MM-DD') as "doneOn" from public.activity_logs where student_id = $1 and done_on between $2::date and $3::date`, [studentId, from, to]);

export interface ActivityInput { name: string; weekdays: number[]; startTime?: string; durationMin?: number; notes?: string; pattern: string; anchor: string; endsOn?: string }
const recurArgs = (i: ActivityInput) => {
  const monthly = i.pattern.startsWith('m'); const n = Number(i.pattern.slice(1));
  return [monthly ? 'monthly' : 'weekly', monthly ? 1 : n, monthly ? n : null, i.anchor, i.endsOn ?? null];
};

export async function createActivity(db: Db, studentId: string, i: ActivityInput): Promise<string> {
  const r = await db.one<{ id: string }>(
    `insert into public.activities (student_id, name, weekdays, start_time, duration_min, notes, recur_kind, recur_every, recur_week_of_month, recur_anchor, ends_on)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [studentId, i.name, i.weekdays, i.startTime || null, i.durationMin ?? null, i.notes || null, ...recurArgs(i)]);
  return r!.id;
}
export const updateActivity = (db: Db, id: string, i: ActivityInput) =>
  db.exec(`update public.activities set name = $2, weekdays = $3, start_time = $4, duration_min = $5, notes = $6,
           recur_kind = $7, recur_every = $8, recur_week_of_month = $9, recur_anchor = $10, ends_on = $11 where id = $1`,
    [id, i.name, i.weekdays, i.startTime || null, i.durationMin ?? null, i.notes || null, ...recurArgs(i)]);
export const archiveActivity = (db: Db, id: string, archived: boolean) =>
  db.exec('update public.activities set archived_at = $2 where id = $1', [id, archived ? new Date().toISOString() : null]);
export const deleteActivity = (db: Db, id: string) => db.exec('delete from public.activities where id = $1', [id]);

/** Marca/desmarca a atividade como feita num dia. */
export async function toggleActivityDone(db: Db, studentId: string, id: string, date: string): Promise<boolean> {
  const removed = await db.exec('delete from public.activity_logs where activity_id = $1 and done_on = $2 and student_id = $3', [id, date, studentId]);
  if (removed) return false;
  await db.exec('insert into public.activity_logs (activity_id, student_id, done_on) values ($1, $2, $3)', [id, studentId, date]);
  return true;
}
export { itemsOnActivities };

/** Atividades previstas para hoje, com o estado "feita". */
export async function listTodayActivities(db: Db, studentId: string, today: string) {
  const [acts, logs] = await Promise.all([listActivities(db, studentId), listActivityLogs(db, studentId, today, today)]);
  const done = new Set(logs.map((l) => l.activityId));
  return itemsOnActivities(acts, today).map((a) => ({ id: a.id, name: a.name, startTime: a.startTime, durationMin: a.durationMin, done: done.has(a.id) }));
}

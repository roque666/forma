import type { Db } from '../db/pool';

export interface SessionSetRow {
  id: string; setNumber: number; setType: 'normal' | 'warmup'; plannedWeightKg: number | null; plannedRepsMin: number | null;
  plannedRepsMax: number | null; weightKg: number | null; reps: number | null; rir: number | null; notes: string | null;
  completed: boolean; correctedAt: string | null;
}
export interface SessionExerciseRow {
  id: string; exerciseId: string | null; exerciseName: string; position: number; restSeconds: number; notes: string | null;
  trackingType: string; primaryMuscle: string | null; images: string[]; mediaUrl: string | null; sets: SessionSetRow[];
}
export interface SessionDetail {
  id: string; studentId: string; planId: string | null; planDayId: string | null; planName: string | null; dayName: string | null;
  status: 'in_progress' | 'completed' | 'discarded'; startedAt: string; endedAt: string | null; notes: string | null;
  exercises: SessionExerciseRow[];
}
export interface SessionListItem {
  sessionId: string; planName: string | null; dayName: string | null; startedAt: string; endedAt: string | null;
  durationSeconds: number | null; exercisesCount: number; setsCompleted: number; volumeKg: number;
}

export async function getSessionDetail(db: Db, sessionId: string): Promise<SessionDetail | null> {
  const s = await db.one<Omit<SessionDetail, 'exercises'>>(
    `select id, student_id as "studentId", plan_id as "planId", plan_day_id as "planDayId", plan_name as "planName", day_name as "dayName",
            status, started_at as "startedAt", ended_at as "endedAt", notes from public.workout_sessions where id = $1`, [sessionId]);
  if (!s) return null;
  const exs = await db.query<Omit<SessionExerciseRow, 'sets'>>(
    `select se.id, se.exercise_id as "exerciseId", se.exercise_name as "exerciseName", se.position, se.rest_seconds as "restSeconds", se.notes,
            coalesce(e.tracking_type::text, 'weight_reps') as "trackingType", e.primary_muscle::text as "primaryMuscle",
            coalesce(public.exercise_image_urls(e.id, e.image_urls), '{}') as images, e.media_url as "mediaUrl"
       from public.session_exercises se left join public.exercises e on e.id = se.exercise_id
      where se.session_id = $1 order by se.position, se.exercise_name`, [sessionId]);
  const sets = await db.query<SessionSetRow & { sessionExerciseId: string }>(
    `select ss.id, ss.session_exercise_id as "sessionExerciseId", ss.set_number as "setNumber", ss.set_type as "setType",
            ss.planned_weight_kg as "plannedWeightKg", ss.planned_reps_min as "plannedRepsMin", ss.planned_reps_max as "plannedRepsMax",
            ss.weight_kg as "weightKg", ss.reps, ss.rir, ss.notes, ss.completed, ss.corrected_at as "correctedAt"
       from public.session_sets ss join public.session_exercises se on se.id = ss.session_exercise_id
      where se.session_id = $1 order by ss.set_number`, [sessionId]);
  const bySe = new Map<string, SessionSetRow[]>();
  for (const x of sets) { const { sessionExerciseId, ...rest } = x; (bySe.get(sessionExerciseId) ?? bySe.set(sessionExerciseId, []).get(sessionExerciseId)!).push(rest); }
  return { ...s, exercises: exs.map((e) => ({ ...e, sets: bySe.get(e.id) ?? [] })) };
}

export function getInProgressSession(db: Db, studentId: string): Promise<{ id: string; dayName: string | null; planName: string | null; startedAt: string } | null> {
  return db.one(`select id, day_name as "dayName", plan_name as "planName", started_at as "startedAt" from public.workout_sessions
    where student_id = $1 and status = 'in_progress' limit 1`, [studentId]);
}

export function listSessions(db: Db, studentId: string, opts: { limit?: number; offset?: number } = {}): Promise<SessionListItem[]> {
  return db.query(
    `select session_id as "sessionId", plan_name as "planName", day_name as "dayName", started_at as "startedAt", ended_at as "endedAt",
            duration_seconds as "durationSeconds", exercises_count as "exercisesCount", sets_completed as "setsCompleted", volume_kg as "volumeKg"
       from public.workout_session_summaries where student_id = $1 and status = 'completed'
      order by started_at desc limit $2 offset $3`, [studentId, opts.limit ?? 30, opts.offset ?? 0]);
}

/** Últimos valores por exercício e nº de série ("Anterior" no treino ativo). */
export async function getPreviousPerformance(db: Db, studentId: string, sessionId: string, exerciseIds: string[]) {
  if (exerciseIds.length === 0) return {} as Record<string, Record<number, { weightKg: number | null; reps: number | null; rir: number | null }>>;
  const rows = await db.query<{ exerciseId: string; setNumber: number; weightKg: number | null; reps: number | null; rir: number | null }>(
    `select distinct on (se.exercise_id, ss.set_number) se.exercise_id as "exerciseId", ss.set_number as "setNumber",
            ss.weight_kg as "weightKg", ss.reps, ss.rir
       from public.session_sets ss
       join public.session_exercises se on se.id = ss.session_exercise_id
       join public.workout_sessions w on w.id = se.session_id
      where w.student_id = $1 and w.status = 'completed' and w.id <> $2 and se.exercise_id = any ($3::uuid[])
        and ss.completed and ss.set_type = 'normal'
      order by se.exercise_id, ss.set_number, w.started_at desc`, [studentId, sessionId, exerciseIds]);
  const out: Record<string, Record<number, { weightKg: number | null; reps: number | null; rir: number | null }>> = {};
  for (const r of rows) (out[r.exerciseId] ??= {})[r.setNumber] = { weightKg: r.weightKg, reps: r.reps, rir: r.rir };
  return out;
}

export interface PrEventRow {
  id: string; exerciseId: string | null; exerciseName: string; prType: string; value: number; previousValue: number;
  weightKg: number | null; reps: number | null; setId: string | null; sessionId: string | null; createdAt: string;
}
const PR_EVENT_COLS = `id, exercise_id as "exerciseId", exercise_name as "exerciseName", pr_type as "prType", value, previous_value as "previousValue",
  weight_kg as "weightKg", reps, set_id as "setId", session_id as "sessionId", created_at as "createdAt"`;

export const getRecentPrEvents = (db: Db, studentId: string, limit = 10): Promise<PrEventRow[]> =>
  db.query(`select ${PR_EVENT_COLS} from public.pr_events where student_id = $1 order by created_at desc limit $2`, [studentId, limit]);

export const getSessionPrEvents = (db: Db, sessionId: string): Promise<PrEventRow[]> =>
  db.query(`select ${PR_EVENT_COLS} from public.pr_events where session_id = $1 order by created_at`, [sessionId]);

export const getSessionComments = (db: Db, sessionId: string) =>
  db.query<{ id: string; authorId: string; authorName: string; body: string; createdAt: string }>(
    `select c.id, c.author_id as "authorId", coalesce(p.full_name, 'Utilizador removido') as "authorName", c.body, c.created_at as "createdAt"
       from public.session_comments c left join public.profiles p on p.id = c.author_id where c.session_id = $1 order by c.created_at`, [sessionId]);

export const getSessionCorrections = (db: Db, sessionId: string) =>
  db.query<{ id: string; recordId: string; correctedByName: string | null; oldValues: Record<string, unknown>; newValues: Record<string, unknown>; reason: string; createdAt: string }>(
    `select rc.id, rc.record_id as "recordId", p.full_name as "correctedByName", rc.old_values as "oldValues", rc.new_values as "newValues", rc.reason, rc.created_at as "createdAt"
       from public.record_corrections rc left join public.profiles p on p.id = rc.corrected_by
      where rc.table_name = 'session_sets' and rc.record_id in (
        select ss.id from public.session_sets ss join public.session_exercises se on se.id = ss.session_exercise_id where se.session_id = $1)
      order by rc.created_at desc`, [sessionId]);

// ---------------------------------------------------------------- progressão
export interface ExerciseSummary { exerciseId: string; exerciseName: string; sessions: number; lastAt: string; bestE1rm: number | null; topWeightKg: number | null }

export const listExercisesWithHistory = (db: Db, studentId: string): Promise<ExerciseSummary[]> =>
  db.query(
    `select exercise_id as "exerciseId", max(exercise_name) as "exerciseName", count(distinct session_id) as sessions, max(started_at) as "lastAt",
            max(est_1rm_kg) as "bestE1rm", max(weight_kg) as "topWeightKg"
       from public.exercise_set_history where student_id = $1 and exercise_id is not null
      group by exercise_id order by max(started_at) desc`, [studentId]);

export interface ProgressPoint { sessionId: string; startedAt: string; topWeightKg: number | null; bestE1rm: number | null; volumeKg: number; reps: number; sets: number }

export const getExerciseProgress = (db: Db, studentId: string, exerciseId: string): Promise<ProgressPoint[]> =>
  db.query(
    `select session_id as "sessionId", min(started_at) as "startedAt", max(weight_kg) as "topWeightKg", max(est_1rm_kg) as "bestE1rm",
            coalesce(sum(volume_kg), 0) as "volumeKg", sum(reps) as reps, count(*) as sets
       from public.exercise_set_history where student_id = $1 and exercise_id = $2
      group by session_id order by min(started_at)`, [studentId, exerciseId]);

export interface PersonalRecordRow { id: string; exerciseId: string; exerciseName: string; prType: string; value: number; weightKg: number | null; reps: number | null; achievedAt: string; weightKey: number }

export const getPersonalRecords = (db: Db, studentId: string, exerciseId?: string): Promise<PersonalRecordRow[]> =>
  db.query(
    `select pr.id, pr.exercise_id as "exerciseId", e.name as "exerciseName", pr.pr_type as "prType", pr.value, pr.weight_kg as "weightKg",
            pr.reps, pr.achieved_at as "achievedAt", pr.weight_key as "weightKey"
       from public.personal_records pr join public.exercises e on e.id = pr.exercise_id
      where pr.student_id = $1 ${exerciseId ? 'and pr.exercise_id = $2' : ''}
      order by pr.achieved_at desc`, exerciseId ? [studentId, exerciseId] : [studentId]);

export const getExerciseHistorySets = (db: Db, studentId: string, exerciseId: string, limitSessions = 8) =>
  db.query<{ sessionId: string; startedAt: string; setNumber: number; weightKg: number | null; reps: number | null; rir: number | null; e1rm: number | null }>(
    `select h.session_id as "sessionId", h.started_at as "startedAt", h.set_number as "setNumber", h.weight_kg as "weightKg", h.reps, h.rir, h.est_1rm_kg as e1rm
       from public.exercise_set_history h
      where h.student_id = $1 and h.exercise_id = $2 and h.session_id in (
        select session_id from public.exercise_set_history where student_id = $1 and exercise_id = $2
         group by session_id order by min(started_at) desc limit $3)
      order by h.started_at desc, h.set_number`, [studentId, exerciseId, limitSessions]);

/** Dados para resolver "treino de hoje / próximo": último dia concluído e dias concluídos hoje. */
export async function getScheduleContext(db: Db, studentId: string, today: string, tz: string) {
  const last = await db.one<{ dayId: string | null }>(
    `select plan_day_id as "dayId" from public.workout_sessions where student_id = $1 and status = 'completed' and plan_day_id is not null
      order by started_at desc limit 1`, [studentId]);
  const done = await db.query<{ dayId: string }>(
    `select distinct plan_day_id as "dayId" from public.workout_sessions
      where student_id = $1 and status = 'completed' and plan_day_id is not null and (started_at at time zone $3)::date = $2::date`, [studentId, today, tz]);
  return { lastCompletedDayId: last?.dayId ?? null, completedTodayDayIds: done.map((d) => d.dayId) };
}

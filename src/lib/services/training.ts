import type { Db } from '../db/pool';
import type { PrEventRow } from '../data/sessions';

export interface Actor { id: string; role: 'student' | 'coach'; /** papel real da conta (um coach em "O meu treino" tem role 'student') */ realRole?: 'student' | 'coach' }

const NOT_FOUND = Object.assign(new Error('Registo não encontrado.'), { code: 'P0002' });

// ------------------------------------------------------------------ exercícios
export interface ExerciseInput {
  name: string; primaryMuscle: string; secondaryMuscles: string[]; equipment?: string; instructions?: string; trackingType: string; mediaUrl?: string;
}

export async function createExercise(db: Db, actor: Actor, i: ExerciseInput): Promise<string> {
  const r = await db.one<{ id: string }>(
    `insert into public.exercises (name, primary_muscle, secondary_muscles, equipment, instructions, tracking_type, source, owner_id, media_url)
     values ($1, $2::public.muscle_group, $3::public.muscle_group[], $4, $5, $6::public.exercise_tracking, $7, $8, $9) returning id`,
    [i.name, i.primaryMuscle, i.secondaryMuscles, i.equipment ?? null, i.instructions ?? null, i.trackingType, (actor.realRole ?? actor.role) === 'coach' ? 'coach' : 'user', actor.id, i.mediaUrl ?? null]);
  return r!.id;
}

export async function updateExercise(db: Db, id: string, i: ExerciseInput): Promise<void> {
  const n = await db.exec(
    `update public.exercises set name = $2, primary_muscle = $3::public.muscle_group, secondary_muscles = $4::public.muscle_group[],
            equipment = $5, instructions = $6, tracking_type = $7::public.exercise_tracking, media_url = $8 where id = $1`,
    [id, i.name, i.primaryMuscle, i.secondaryMuscles, i.equipment ?? null, i.instructions ?? null, i.trackingType, i.mediaUrl ?? null]);
  if (!n) throw NOT_FOUND;
}

/** Guarda (ou substitui) a imagem de um exercício. A RLS limita a quem pode editar o exercício. */
export async function saveExerciseImage(db: Db, exerciseId: string, img: { mime: string; data: Buffer }): Promise<void> {
  await db.exec(
    `insert into public.exercise_images (exercise_id, mime, data) values ($1, $2, $3)
     on conflict (exercise_id) do update set mime = excluded.mime, data = excluded.data, updated_at = now()`,
    [exerciseId, img.mime, img.data]);
}

export async function removeExerciseImage(db: Db, exerciseId: string): Promise<void> {
  await db.exec('delete from public.exercise_images where exercise_id = $1', [exerciseId]);
}

/** Exercícios com histórico são arquivados (nunca perdem o histórico); os outros são apagados. */
export async function removeExercise(db: Db, id: string): Promise<'deleted' | 'archived'> {
  const used = await db.one<{ used: boolean }>(
    `select (exists (select 1 from public.plan_exercises where exercise_id = $1)
          or exists (select 1 from public.session_exercises where exercise_id = $1)) as used`, [id]);
  if (used?.used) {
    if (!(await db.exec('update public.exercises set archived_at = now() where id = $1', [id]))) throw NOT_FOUND;
    return 'archived';
  }
  if (!(await db.exec('delete from public.exercises where id = $1', [id]))) throw NOT_FOUND;
  return 'deleted';
}

export const restoreExercise = async (db: Db, id: string) => {
  if (!(await db.exec('update public.exercises set archived_at = null where id = $1', [id]))) throw NOT_FOUND;
};

// ------------------------------------------------------------------ planos
export async function createPlan(db: Db, actor: Actor, i: { name: string; description?: string; studentId?: string; isTemplate?: boolean }): Promise<string> {
  const isTemplate = !!i.isTemplate;
  if (isTemplate && actor.role !== 'coach') throw Object.assign(new Error('Só coaches criam modelos.'), { code: '42501' });
  const studentId = isTemplate ? null : actor.role === 'coach' ? i.studentId : actor.id;
  if (!isTemplate && !studentId) throw Object.assign(new Error('Escolhe o atleta.'), { code: '22023' });
  const hasActive = studentId
    ? (await db.one('select 1 from public.workout_plans where student_id = $1 and is_active and archived_at is null', [studentId])) != null
    : true;
  const r = await db.one<{ id: string }>(
    `insert into public.workout_plans (student_id, created_by, name, description, is_template, is_active)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [studentId ?? null, actor.id, i.name, i.description ?? null, isTemplate, !hasActive && !isTemplate]);
  return r!.id;
}

export async function updatePlan(db: Db, id: string, i: { name: string; description?: string }) {
  if (!(await db.exec('update public.workout_plans set name = $2, description = $3 where id = $1', [id, i.name, i.description ?? null]))) throw NOT_FOUND;
}
export async function archivePlan(db: Db, id: string, archived: boolean) {
  if (!(await db.exec('update public.workout_plans set archived_at = $2, is_active = case when $3 then false else is_active end where id = $1',
    [id, archived ? new Date().toISOString() : null, archived]))) throw NOT_FOUND;
}
export async function deletePlan(db: Db, id: string) {
  if (!(await db.exec('delete from public.workout_plans where id = $1', [id]))) throw NOT_FOUND;
}
export async function activatePlan(db: Db, id: string) { await db.query('select public.activate_plan($1)', [id]); }

export async function duplicatePlan(db: Db, id: string, o: { targetStudentId?: string; asTemplate?: boolean; name?: string } = {}): Promise<string> {
  const r = await db.one<{ id: string }>('select public.duplicate_plan($1, $2, $3, $4) as id', [id, o.targetStudentId ?? null, !!o.asTemplate, o.name ?? null]);
  return r!.id;
}

/** Atribui um modelo do coach a um atleta (cópia independente). Fica ativo se o atleta ainda não tiver plano atual. */
export async function assignTemplate(db: Db, templateId: string, studentId: string): Promise<string> {
  const id = await duplicatePlan(db, templateId, { targetStudentId: studentId, asTemplate: false });
  const hasActive = await db.one('select 1 from public.workout_plans where student_id = $1 and is_active and archived_at is null and id <> $2', [studentId, id]);
  if (!hasActive) await activatePlan(db, id);
  return id;
}

// ------------------------------------------------------------------ dias / exercícios / séries do plano
async function reorder(db: Db, table: 'workout_days' | 'plan_exercises', scopeCol: 'plan_id' | 'day_id', id: string, dir: 'up' | 'down') {
  const row = await db.one<{ scope: string }>(`select ${scopeCol} as scope from public.${table} where id = $1`, [id]);
  if (!row) throw NOT_FOUND;
  const ids = (await db.query<{ id: string }>(`select id from public.${table} where ${scopeCol} = $1 order by position, id`, [row.scope])).map((r) => r.id);
  const i = ids.indexOf(id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await db.exec(`update public.${table} t set position = x.ord - 1 from unnest($1::uuid[]) with ordinality as x(id, ord) where t.id = x.id`, [ids]);
}

export async function addDay(db: Db, planId: string, name: string, weekdays: number[]): Promise<string> {
  const r = await db.one<{ id: string }>(
    `insert into public.workout_days (plan_id, name, weekdays, position)
     select $1, $2, $3::smallint[], coalesce(max(position) + 1, 0) from public.workout_days where plan_id = $1 returning id`, [planId, name, weekdays]);
  return r!.id;
}
export async function updateDay(db: Db, id: string, name: string, weekdays: number[]) {
  if (!(await db.exec('update public.workout_days set name = $2, weekdays = $3::smallint[] where id = $1', [id, name, weekdays]))) throw NOT_FOUND;
}
export async function deleteDay(db: Db, id: string) { if (!(await db.exec('delete from public.workout_days where id = $1', [id]))) throw NOT_FOUND; }
export const moveDay = (db: Db, id: string, dir: 'up' | 'down') => reorder(db, 'workout_days', 'plan_id', id, dir);

export async function addPlanExercise(db: Db, dayId: string, exerciseId: string): Promise<string> {
  const day = await db.one<{ planId: string }>('select plan_id as "planId" from public.workout_days where id = $1', [dayId]);
  if (!day) throw NOT_FOUND;
  const ex = await db.one<{ trackingType: string }>('select tracking_type as "trackingType" from public.exercises where id = $1 and archived_at is null', [exerciseId]);
  if (!ex) throw NOT_FOUND;
  const pe = await db.one<{ id: string }>(
    `insert into public.plan_exercises (plan_id, day_id, exercise_id, position, rest_seconds)
     select $1, $2, $3, coalesce(max(position) + 1, 0), $4 from public.plan_exercises where day_id = $2 returning id`,
    [day.planId, dayId, exerciseId, ex.trackingType === 'duration' ? 60 : 90]);
  for (let n = 1; n <= 3; n++) {
    await db.exec(
      `insert into public.plan_sets (plan_id, plan_exercise_id, set_number, target_reps_min, target_reps_max) values ($1, $2, $3, $4, $5)`,
      [day.planId, pe!.id, n, ex.trackingType === 'duration' ? null : 8, ex.trackingType === 'duration' ? null : 12]);
  }
  return pe!.id;
}
export async function updatePlanExercise(db: Db, id: string, i: { restSeconds: number; notes?: string }) {
  if (!(await db.exec('update public.plan_exercises set rest_seconds = $2, notes = $3 where id = $1', [id, i.restSeconds, i.notes ?? null]))) throw NOT_FOUND;
}
export async function removePlanExercise(db: Db, id: string) { if (!(await db.exec('delete from public.plan_exercises where id = $1', [id]))) throw NOT_FOUND; }
export const movePlanExercise = (db: Db, id: string, dir: 'up' | 'down') => reorder(db, 'plan_exercises', 'day_id', id, dir);

export interface PlanSetInput { setType: 'normal' | 'warmup'; repsMin?: number; repsMax?: number; weightKg?: number; rir?: number }
export async function savePlanSets(db: Db, planExerciseId: string, sets: PlanSetInput[]) {
  const pe = await db.one<{ planId: string }>('select plan_id as "planId" from public.plan_exercises where id = $1', [planExerciseId]);
  if (!pe) throw NOT_FOUND;
  await db.exec('delete from public.plan_sets where plan_exercise_id = $1', [planExerciseId]);
  let n = 0;
  for (const s of sets) {
    await db.exec(
      `insert into public.plan_sets (plan_id, plan_exercise_id, set_number, set_type, target_reps_min, target_reps_max, target_weight_kg, target_rir)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [pe.planId, planExerciseId, ++n, s.setType, s.repsMin ?? null, s.repsMax ?? s.repsMin ?? null, s.weightKg ?? null, s.rir ?? null]);
  }
}

// ------------------------------------------------------------------ sessões
export async function startSession(db: Db, studentId: string, planDayId: string | null): Promise<{ id: string; resumed: boolean }> {
  const existing = await db.one<{ id: string }>("select id from public.workout_sessions where student_id = $1 and status = 'in_progress'", [studentId]);
  if (existing) return { id: existing.id, resumed: true };
  const r = await db.one<{ id: string }>('select public.start_workout_session($1) as id', [planDayId]);
  return { id: r!.id, resumed: false };
}

export interface SetLog { setId: string; weightKg: number | null; reps: number | null; rir: number | null; notes?: string | null; completed: boolean }

/** Guarda uma série. Um trigger recalcula os recordes; devolve os PRs ultrapassados por esta série. */
export async function saveSet(db: Db, i: SetLog): Promise<{ prs: PrEventRow[] }> {
  const n = await db.exec(
    `update public.session_sets
        set weight_kg = $2, reps = $3, rir = $4, notes = $5, completed = $6,
            completed_at = case when $6 then coalesce(completed_at, now()) else null end
      where id = $1`,
    [i.setId, i.weightKg, i.reps, i.rir, i.notes ?? null, i.completed]);
  if (!n) throw NOT_FOUND;
  const prs = i.completed
    ? await db.query<PrEventRow>(
        `select id, exercise_id as "exerciseId", exercise_name as "exerciseName", pr_type as "prType", value, previous_value as "previousValue",
                weight_kg as "weightKg", reps, set_id as "setId", session_id as "sessionId", created_at as "createdAt"
           from public.pr_events where set_id = $1 and created_at = now() order by created_at`, [i.setId])
    : [];
  return { prs };
}

export async function addSet(db: Db, sessionExerciseId: string): Promise<SetRowLite> {
  const se = await db.one<{ studentId: string }>('select student_id as "studentId" from public.session_exercises where id = $1', [sessionExerciseId]);
  if (!se) throw NOT_FOUND;
  const last = await db.one<{ setNumber: number; weightKg: number | null; reps: number | null; plannedWeightKg: number | null; plannedRepsMin: number | null; plannedRepsMax: number | null }>(
    `select set_number as "setNumber", weight_kg as "weightKg", reps, planned_weight_kg as "plannedWeightKg", planned_reps_min as "plannedRepsMin", planned_reps_max as "plannedRepsMax"
       from public.session_sets where session_exercise_id = $1 order by set_number desc limit 1`, [sessionExerciseId]);
  const r = await db.one<SetRowLite>(
    `insert into public.session_sets (session_exercise_id, student_id, set_number, planned_weight_kg, planned_reps_min, planned_reps_max)
     values ($1, $2, $3, $4, $5, $6)
     returning id, set_number as "setNumber", set_type as "setType", planned_weight_kg as "plannedWeightKg", planned_reps_min as "plannedRepsMin",
               planned_reps_max as "plannedRepsMax", weight_kg as "weightKg", reps, rir, notes, completed`,
    [sessionExerciseId, se.studentId, (last?.setNumber ?? 0) + 1, last?.weightKg ?? last?.plannedWeightKg ?? null, last?.plannedRepsMin ?? null, last?.plannedRepsMax ?? null]);
  return r!;
}
export interface SetRowLite {
  id: string; setNumber: number; setType: 'normal' | 'warmup'; plannedWeightKg: number | null; plannedRepsMin: number | null;
  plannedRepsMax: number | null; weightKg: number | null; reps: number | null; rir: number | null; notes: string | null; completed: boolean;
}

export async function removeSet(db: Db, setId: string) {
  const s = await db.one<{ seId: string }>('select session_exercise_id as "seId" from public.session_sets where id = $1', [setId]);
  if (!s) throw NOT_FOUND;
  await db.exec('delete from public.session_sets where id = $1', [setId]);
  await db.exec(
    `update public.session_sets t set set_number = x.n from (
       select id, row_number() over (order by set_number) as n from public.session_sets where session_exercise_id = $1) x
      where t.id = x.id and t.set_number <> x.n`, [s.seId]);
}

export async function addSessionExercise(db: Db, sessionId: string, exerciseId: string): Promise<string> {
  const s = await db.one<{ studentId: string }>('select student_id as "studentId" from public.workout_sessions where id = $1', [sessionId]);
  const ex = await db.one<{ name: string; trackingType: string }>('select name, tracking_type as "trackingType" from public.exercises where id = $1', [exerciseId]);
  if (!s || !ex) throw NOT_FOUND;
  const se = await db.one<{ id: string }>(
    `insert into public.session_exercises (session_id, student_id, exercise_id, exercise_name, position, rest_seconds)
     select $1, $2, $3, $4, coalesce(max(position) + 1, 0), $5 from public.session_exercises where session_id = $1 returning id`,
    [sessionId, s.studentId, exerciseId, ex.name, ex.trackingType === 'duration' ? 60 : 90]);
  await db.exec('insert into public.session_sets (session_exercise_id, student_id, set_number) values ($1, $2, 1)', [se!.id, s.studentId]);
  return se!.id;
}
export async function removeSessionExercise(db: Db, id: string) {
  if (!(await db.exec('delete from public.session_exercises where id = $1', [id]))) throw NOT_FOUND;
}

export async function finishSession(db: Db, sessionId: string, notes?: string): Promise<void> {
  const c = await db.one<{ n: number }>(
    `select count(*) as n from public.session_sets ss join public.session_exercises se on se.id = ss.session_exercise_id
      where se.session_id = $1 and ss.completed`, [sessionId]);
  if (!c || c.n === 0) throw Object.assign(new Error('Conclui pelo menos uma série antes de terminar (ou descarta o treino).'), { code: '22023' });
  const n = await db.exec(
    `update public.workout_sessions set status = 'completed', ended_at = now(), notes = coalesce($2, notes)
      where id = $1 and status = 'in_progress'`, [sessionId, notes ?? null]);
  if (!n) throw Object.assign(new Error('Este treino já foi terminado.'), { code: '22023' });
}

export async function discardSession(db: Db, sessionId: string) {
  if (!(await db.exec("update public.workout_sessions set status = 'discarded', ended_at = now() where id = $1 and status = 'in_progress'", [sessionId]))) throw NOT_FOUND;
}

export async function deleteSession(db: Db, studentId: string, sessionId: string) {
  if (!(await db.exec('delete from public.workout_sessions where id = $1', [sessionId]))) throw NOT_FOUND;
  await db.query('select public.refresh_all_prs($1)', [studentId]);
}

export async function coachComment(db: Db, sessionId: string, body: string) {
  await db.exec('insert into public.session_comments (session_id, body) values ($1, $2)', [sessionId, body]);
}

import type { Db } from '../db/pool';

export interface PlanSummary {
  id: string; name: string; description: string | null; isActive: boolean; isTemplate: boolean; archived: boolean;
  studentId: string | null; createdBy: string | null; createdByName: string | null; createdByCoach: boolean;
  updatedAt: string; daysCount: number; exercisesCount: number; version: number;
}
export interface PlanSet {
  id: string; setNumber: number; setType: 'normal' | 'warmup'; targetRepsMin: number | null; targetRepsMax: number | null;
  targetWeightKg: number | null; targetRir: number | null;
}
export interface PlanExercise {
  id: string; exerciseId: string; exerciseName: string; primaryMuscle: string; trackingType: string; position: number;
  restSeconds: number; notes: string | null; sets: PlanSet[];
}
export interface PlanDay { id: string; name: string; position: number; weekdays: number[]; exercises: PlanExercise[] }
export interface PlanDetail extends PlanSummary { days: PlanDay[] }

const SUMMARY = `
  p.id, p.name, p.description, p.is_active as "isActive", p.is_template as "isTemplate", p.archived_at is not null as archived,
  p.student_id as "studentId", p.created_by as "createdBy", cb.full_name as "createdByName", coalesce(cb.role = 'coach', false) as "createdByCoach",
  p.updated_at as "updatedAt", p.version,
  (select count(*) from public.workout_days d where d.plan_id = p.id) as "daysCount",
  (select count(*) from public.plan_exercises pe where pe.plan_id = p.id) as "exercisesCount"
  from public.workout_plans p left join public.profiles cb on cb.id = p.created_by`;

export function listPlans(db: Db, studentId: string, includeArchived = false): Promise<PlanSummary[]> {
  return db.query(`select ${SUMMARY} where p.student_id = $1 and not p.is_template ${includeArchived ? '' : 'and p.archived_at is null'}
    order by p.is_active desc, p.updated_at desc`, [studentId]);
}

export function listTemplates(db: Db, coachId: string): Promise<PlanSummary[]> {
  return db.query(`select ${SUMMARY} where p.is_template and p.created_by = $1 order by p.updated_at desc`, [coachId]);
}

export async function getPlan(db: Db, planId: string): Promise<PlanDetail | null> {
  const plan = await db.one<PlanSummary>(`select ${SUMMARY} where p.id = $1`, [planId]);
  if (!plan) return null;
  const days = await db.query<{ id: string; name: string; position: number; weekdays: number[] }>(
    'select id, name, position, weekdays from public.workout_days where plan_id = $1 order by position, name', [planId]);
  const exs = await db.query<PlanExercise & { dayId: string }>(
    `select pe.id, pe.day_id as "dayId", pe.exercise_id as "exerciseId", e.name as "exerciseName", e.primary_muscle as "primaryMuscle",
            e.tracking_type as "trackingType", pe.position, pe.rest_seconds as "restSeconds", pe.notes
       from public.plan_exercises pe join public.exercises e on e.id = pe.exercise_id
      where pe.plan_id = $1 order by pe.position`, [planId]);
  const sets = await db.query<PlanSet & { planExerciseId: string }>(
    `select id, plan_exercise_id as "planExerciseId", set_number as "setNumber", set_type as "setType", target_reps_min as "targetRepsMin",
            target_reps_max as "targetRepsMax", target_weight_kg as "targetWeightKg", target_rir as "targetRir"
       from public.plan_sets where plan_id = $1 order by set_number`, [planId]);
  const setsByEx = new Map<string, PlanSet[]>();
  for (const s of sets) { const { planExerciseId, ...rest } = s; (setsByEx.get(planExerciseId) ?? setsByEx.set(planExerciseId, []).get(planExerciseId)!).push(rest); }
  const exsByDay = new Map<string, PlanExercise[]>();
  for (const e of exs) { const { dayId, ...rest } = e; (exsByDay.get(dayId) ?? exsByDay.set(dayId, []).get(dayId)!).push({ ...rest, sets: setsByEx.get(e.id) ?? [] }); }
  return { ...plan, days: days.map((d) => ({ ...d, exercises: exsByDay.get(d.id) ?? [] })) };
}

/** Plano atual do atleta com os dias (para "treino de hoje / próximo"). */
export async function getActivePlan(db: Db, studentId: string): Promise<PlanDetail | null> {
  const row = await db.one<{ id: string }>(
    'select id from public.workout_plans where student_id = $1 and is_active and archived_at is null and not is_template limit 1', [studentId]);
  return row ? getPlan(db, row.id) : null;
}

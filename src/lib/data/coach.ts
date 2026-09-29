import type { Db } from '../db/pool';

export interface StudentOverviewRow {
  linkId: string; coachId: string; studentId: string | null; linkStatus: 'pending' | 'active'; linkType: 'primary' | 'secondary'; origin: string | null;
  inviteEmail: string | null; linkedAt: string; fullName: string | null; avatarUrl: string | null; currentWeightKg: number | null; lastWeighIn: string | null;
  goalType: string | null; caloriesTarget: number | null; currentPlanId: string | null; currentPlanName: string | null; lastWorkoutAt: string | null; lastMealDate: string | null;
}

export const listStudentOverview = (db: Db): Promise<StudentOverviewRow[]> =>
  db.query(`select link_id as "linkId", coach_id as "coachId", student_id as "studentId", link_status as "linkStatus", link_type as "linkType", origin,
      invite_email as "inviteEmail", linked_at as "linkedAt", full_name as "fullName", avatar_url as "avatarUrl", current_weight_kg as "currentWeightKg",
      last_weigh_in as "lastWeighIn", goal_type as "goalType", calories_target as "caloriesTarget", current_plan_id as "currentPlanId",
      current_plan_name as "currentPlanName", last_workout_at as "lastWorkoutAt", last_meal_date as "lastMealDate"
    from public.coach_students_overview order by full_name nulls last`);

export const listActiveStudents = (db: Db): Promise<{ id: string; fullName: string }[]> =>
  db.query(`select cs.student_id as id, p.full_name as "fullName" from public.coach_students cs join public.profiles p on p.id = cs.student_id
    where cs.coach_id = auth.uid() and cs.status = 'active' order by p.full_name`);

export const getStudentProfile = (db: Db, studentId: string) =>
  db.one<{ id: string; fullName: string; timezone: string; avatarUrl: string | null }>(
    `select id, full_name as "fullName", timezone, avatar_url as "avatarUrl" from public.profiles where id = $1`, [studentId]);

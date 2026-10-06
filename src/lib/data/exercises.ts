import type { Db } from '../db/pool';

export interface ExerciseRow {
  id: string; name: string; primaryMuscle: string; secondaryMuscles: string[]; equipment: string | null;
  instructions: string | null; images: string[]; trackingType: 'weight_reps' | 'bodyweight_reps' | 'duration'; mediaUrl: string | null;
  source: 'system' | 'user' | 'coach' | 'physio'; ownerId: string | null; archived: boolean;
}

const COLS = `id, name, public.exercise_image_urls(id, image_urls) as images, primary_muscle as "primaryMuscle", secondary_muscles::text[] as "secondaryMuscles", equipment, instructions,
  tracking_type as "trackingType", media_url as "mediaUrl", source, owner_id as "ownerId", archived_at is not null as archived`;

export async function listExercises(db: Db, opts: { q?: string; muscle?: string; scope?: 'all' | 'mine'; userId?: string; includeArchived?: boolean } = {}): Promise<ExerciseRow[]> {
  const q = (opts.q ?? '').trim();
  const params: unknown[] = [`%${q.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`];
  const where = ['public.f_unaccent(lower(e.name)) like public.f_unaccent($1)'];
  if (!opts.includeArchived) where.push('e.archived_at is null');
  if (opts.muscle) { params.push(opts.muscle); where.push(`(e.primary_muscle = $${params.length}::public.muscle_group or $${params.length}::public.muscle_group = any (e.secondary_muscles))`); }
  if (opts.scope === 'mine' && opts.userId) { params.push(opts.userId); where.push(`e.owner_id = $${params.length}`); }
  return db.query<ExerciseRow>(
    `select ${COLS} from public.exercises e where ${where.join(' and ')} order by (e.source <> 'system') desc, e.name limit 300`,
    params,
  );
}

export async function getExercise(db: Db, id: string): Promise<ExerciseRow | null> {
  return db.one<ExerciseRow>(`select ${COLS} from public.exercises where id = $1`, [id]);
}

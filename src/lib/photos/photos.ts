import type { Db } from '../db/pool';

export const ANGLES = ['front', 'side', 'back'] as const;
export type Angle = (typeof ANGLES)[number];
export const ANGLE_LABELS: Record<Angle, string> = { front: 'Frente', side: 'Lado', back: 'Costas' };

export interface PhotoRow { id: string; studentId: string; takenOn: string; angle: Angle; weightKg: number | null; note: string | null; sharedWithCoach: boolean }

const COLS = `id, student_id as "studentId", to_char(taken_on, 'YYYY-MM-DD') as "takenOn", angle, weight_kg as "weightKg", note, shared_with_coach as "sharedWithCoach"`;

/** Lista sem os bytes das imagens. A RLS decide o que cada utilizador vê. */
export const listPhotos = (db: Db, studentId: string): Promise<PhotoRow[]> =>
  db.query<PhotoRow>(`select ${COLS} from public.progress_photos where student_id = $1 order by taken_on desc, created_at desc`, [studentId]);

export const getPhoto = (db: Db, id: string): Promise<PhotoRow | null> =>
  db.one<PhotoRow>(`select ${COLS} from public.progress_photos where id = $1`, [id]);

export async function addPhoto(db: Db, studentId: string, p: { takenOn: string; angle: Angle; weightKg?: number; note?: string; shared: boolean; img: { mime: string; data: Buffer }; thumb: Buffer }): Promise<string> {
  const r = await db.one<{ id: string }>(
    `insert into public.progress_photos (student_id, taken_on, angle, weight_kg, note, shared_with_coach, mime, data, thumb)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [studentId, p.takenOn, p.angle, p.weightKg ?? null, p.note || null, p.shared, p.img.mime, p.img.data, p.thumb]);
  return r!.id;
}

export const updatePhoto = (db: Db, id: string, p: { takenOn: string; angle: Angle; weightKg?: number; note?: string; shared: boolean }) =>
  db.exec(`update public.progress_photos set taken_on = $2, angle = $3, weight_kg = $4, note = $5, shared_with_coach = $6 where id = $1`,
    [id, p.takenOn, p.angle, p.weightKg ?? null, p.note || null, p.shared]);

export const setAllShared = (db: Db, studentId: string, shared: boolean) =>
  db.exec('update public.progress_photos set shared_with_coach = $2 where student_id = $1', [studentId, shared]);

export const deletePhoto = (db: Db, id: string) => db.exec('delete from public.progress_photos where id = $1', [id]);

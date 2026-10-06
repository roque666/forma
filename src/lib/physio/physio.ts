import type { Db } from '../db/pool';

const bad = (m: string, code = '22023') => Object.assign(new Error(m), { code });
const NOT_FOUND = Object.assign(new Error('Registo não encontrado.'), { code: 'P0002' });

// ------------------------------------------------------------------ vínculo
export async function invitePatient(db: Db, email: string): Promise<string> {
  const r = await db.one<{ id: string }>('select public.physio_invite_patient($1) as id', [email]);
  return r!.id;
}
export const acceptPhysioLink = (db: Db, linkId: string) => db.query('select public.accept_physio_link($1)', [linkId]);
export const endPhysioLink = (db: Db, linkId: string) => db.query('select public.end_physio_link($1)', [linkId]);

export const myPendingPhysioInvites = (db: Db) =>
  db.query<{ linkId: string; physioId: string; physioName: string; createdAt: string }>(
    'select link_id as "linkId", physio_id as "physioId", physio_name as "physioName", created_at as "createdAt" from public.my_pending_physio_invites()');

export const myPhysios = (db: Db, patientId: string) =>
  db.query<{ linkId: string; physioId: string; physioName: string; since: string }>(
    `select pp.id as "linkId", pp.physio_id as "physioId", p.full_name as "physioName", pp.consent_at as since
       from public.physio_patients pp join public.profiles p on p.id = pp.physio_id
      where pp.patient_id = $1 and pp.status = 'active' order by pp.consent_at`, [patientId]);

// ------------------------------------------------------------------ pacientes (vista do fisioterapeuta)
export interface PatientRow {
  linkId: string; patientId: string | null; status: 'pending' | 'active'; inviteEmail: string | null; fullName: string | null; avatarUrl: string | null;
  programs: number; weekDone: number; weekTarget: number; lastLogAt: string | null; lastPain: number | null; since: string;
}

/** Pacientes do fisioterapeuta com a atividade da semana (weekStart..weekEnd, inclusive). */
export const listPatients = (db: Db, weekStart: string, weekEnd: string): Promise<PatientRow[]> =>
  db.query(
    `select pp.id as "linkId", pp.patient_id as "patientId", pp.status::text as status, pp.invite_email as "inviteEmail",
            p.full_name as "fullName", p.avatar_url as "avatarUrl", pp.created_at as since,
            coalesce(pr.programs, 0)::int as programs, coalesce(pr.target, 0)::int as "weekTarget",
            coalesce(lg.done, 0)::int as "weekDone", lg.last_at as "lastLogAt", lg.last_pain as "lastPain"
       from public.physio_patients pp
       left join public.profiles p on p.id = pp.patient_id
       left join lateral (
         select count(distinct rp.id) as programs, coalesce(sum(ri.weekly_target), 0) as target
           from public.rehab_programs rp left join public.rehab_items ri on ri.program_id = rp.id
          where rp.patient_id = pp.patient_id and rp.physio_id = pp.physio_id and rp.archived_at is null) pr on pp.status = 'active'
       left join lateral (
         select count(*) filter (where l.done_on between $1::date and $2::date) as done, max(l.done_at) as last_at,
                (array_agg(l.pain order by l.done_at desc) filter (where l.pain is not null))[1] as last_pain
           from public.rehab_logs l join public.rehab_programs rp on rp.id = l.program_id
          where l.patient_id = pp.patient_id and rp.physio_id = pp.physio_id) lg on pp.status = 'active'
      where pp.physio_id = auth.uid () and pp.status in ('pending', 'active')
      order by (pp.status = 'pending'), p.full_name nulls last`, [weekStart, weekEnd]);

export const getPatient = (db: Db, patientId: string) =>
  db.one<{ id: string; fullName: string; avatarUrl: string | null; timezone: string }>(
    `select p.id, p.full_name as "fullName", p.avatar_url as "avatarUrl", p.timezone from public.profiles p
      where p.id = $1 and exists (select 1 from public.physio_patients pp where pp.physio_id = auth.uid () and pp.patient_id = p.id and pp.status = 'active')`, [patientId]);

// ------------------------------------------------------------------ programas
export interface RehabItem {
  id: string; exerciseId: string; exerciseName: string; instructions: string | null; images: string[]; mediaUrl: string | null; trackingType: string;
  position: number; sets: number | null; reps: number | null; holdSeconds: number | null; weeklyTarget: number; notes: string | null;
  weekDone: number; lastDoneOn: string | null; todayDone: boolean;
}
export interface RehabProgram {
  id: string; patientId: string; physioId: string; physioName: string | null; name: string; notes: string | null; archived: boolean; createdAt: string; items: RehabItem[];
}

/** Programas (com exercícios e contagens da semana) de um paciente. A RLS limita ao que o utilizador pode ver. */
export async function listPrograms(db: Db, patientId: string, w: { weekStart: string; weekEnd: string; today: string }, opts: { includeArchived?: boolean } = {}): Promise<RehabProgram[]> {
  const programs = await db.query<Omit<RehabProgram, 'items'>>(
    `select rp.id, rp.patient_id as "patientId", rp.physio_id as "physioId", ph.full_name as "physioName", rp.name, rp.notes,
            rp.archived_at is not null as archived, rp.created_at as "createdAt"
       from public.rehab_programs rp left join public.profiles ph on ph.id = rp.physio_id
      where rp.patient_id = $1 ${opts.includeArchived ? '' : 'and rp.archived_at is null'} order by rp.archived_at nulls first, rp.created_at`, [patientId]);
  if (programs.length === 0) return [];
  const items = await db.query<RehabItem & { programId: string }>(
    `select ri.id, ri.program_id as "programId", ri.exercise_id as "exerciseId", e.name as "exerciseName", e.instructions,
            coalesce(public.exercise_image_urls(e.id, e.image_urls), '{}') as images, e.media_url as "mediaUrl", e.tracking_type as "trackingType",
            ri.position, ri.sets, ri.reps, ri.hold_seconds as "holdSeconds", ri.weekly_target as "weeklyTarget", ri.notes,
            coalesce(c.week_done, 0)::int as "weekDone", to_char(c.last_on, 'YYYY-MM-DD') as "lastDoneOn", coalesce(c.today_done, false) as "todayDone"
       from public.rehab_items ri
       join public.exercises e on e.id = ri.exercise_id
       left join lateral (
         select count(*) filter (where l.done_on between $2::date and $3::date) as week_done, max(l.done_on) as last_on, bool_or(l.done_on = $4::date) as today_done
           from public.rehab_logs l where l.item_id = ri.id) c on true
      where ri.program_id = any ($1::uuid[]) order by ri.position`, [programs.map((p) => p.id), w.weekStart, w.weekEnd, w.today]);
  return programs.map((p) => ({ ...p, items: items.filter((i) => i.programId === p.id).map(({ programId, ...i }) => i) }));
}

export async function getProgram(db: Db, id: string, w: { weekStart: string; weekEnd: string; today: string }): Promise<RehabProgram | null> {
  const row = await db.one<{ patientId: string }>('select patient_id as "patientId" from public.rehab_programs where id = $1', [id]);
  if (!row) return null;
  return (await listPrograms(db, row.patientId, w, { includeArchived: true })).find((p) => p.id === id) ?? null;
}

export async function createProgram(db: Db, physioId: string, patientId: string, i: { name: string; notes?: string }): Promise<string> {
  const r = await db.one<{ id: string }>(
    'insert into public.rehab_programs (patient_id, physio_id, name, notes) values ($1, $2, $3, $4) returning id', [patientId, physioId, i.name, i.notes ?? null]);
  return r!.id;
}
export async function updateProgram(db: Db, id: string, i: { name: string; notes?: string }) {
  if (!(await db.exec('update public.rehab_programs set name = $2, notes = $3 where id = $1', [id, i.name, i.notes ?? null]))) throw NOT_FOUND;
}
export async function archiveProgram(db: Db, id: string, archived: boolean) {
  if (!(await db.exec('update public.rehab_programs set archived_at = $2 where id = $1', [id, archived ? new Date().toISOString() : null]))) throw NOT_FOUND;
}
export async function deleteProgram(db: Db, id: string) {
  if (!(await db.exec('delete from public.rehab_programs where id = $1', [id]))) throw NOT_FOUND;
}

export interface ItemInput { sets?: number; reps?: number; holdSeconds?: number; weeklyTarget: number; notes?: string }
export async function addItem(db: Db, programId: string, exerciseId: string): Promise<string> {
  const pos = await db.one<{ n: number }>('select coalesce(max(position), -1) + 1 as n from public.rehab_items where program_id = $1', [programId]);
  const r = await db.one<{ id: string }>(
    `insert into public.rehab_items (program_id, exercise_id, position, sets, reps, weekly_target) values ($1, $2, $3, 3, 10, 3) returning id`, [programId, exerciseId, pos!.n]);
  return r!.id;
}
export async function updateItem(db: Db, id: string, i: ItemInput) {
  if (!(await db.exec('update public.rehab_items set sets = $2, reps = $3, hold_seconds = $4, weekly_target = $5, notes = $6 where id = $1',
    [id, i.sets ?? null, i.reps ?? null, i.holdSeconds ?? null, i.weeklyTarget, i.notes ?? null]))) throw NOT_FOUND;
}
export async function removeItem(db: Db, id: string) {
  if (!(await db.exec('delete from public.rehab_items where id = $1', [id]))) throw NOT_FOUND;
}
export async function moveItem(db: Db, id: string, dir: 'up' | 'down') {
  const cur = await db.one<{ programId: string; position: number }>('select program_id as "programId", position from public.rehab_items where id = $1', [id]);
  if (!cur) throw NOT_FOUND;
  const other = await db.one<{ id: string; position: number }>(
    `select id, position from public.rehab_items where program_id = $1 and position ${dir === 'up' ? '<' : '>'} $2 order by position ${dir === 'up' ? 'desc' : 'asc'} limit 1`, [cur.programId, cur.position]);
  if (!other) return;
  await db.exec('update public.rehab_items set position = case when id = $1 then $4 when id = $2 then $3 end where id in ($1, $2)', [id, other.id, cur.position, other.position]);
}

// ------------------------------------------------------------------ registos (paciente)
export async function logExercise(db: Db, patientId: string, itemId: string, i: { doneOn: string; pain?: number; note?: string }): Promise<void> {
  const item = await db.one<{ programId: string }>('select program_id as "programId" from public.rehab_items where id = $1', [itemId]);
  if (!item) throw bad('Exercício não encontrado.', 'P0002');
  await db.exec('insert into public.rehab_logs (item_id, program_id, patient_id, done_on, pain, note) values ($1, $2, $3, $4, $5, $6)',
    [itemId, item.programId, patientId, i.doneOn, i.pain ?? null, i.note || null]);
}
export async function undoLog(db: Db, logId: string) {
  if (!(await db.exec('delete from public.rehab_logs where id = $1', [logId]))) throw NOT_FOUND;
}

export interface RehabLogRow { id: string; itemId: string; programId: string; programName: string; exerciseName: string; doneOn: string; doneAt: string; pain: number | null; note: string | null }
/** Registos recentes de um paciente (opcionalmente só de um programa). */
export const listLogs = (db: Db, patientId: string, opts: { programId?: string; limit?: number } = {}): Promise<RehabLogRow[]> =>
  db.query(
    `select l.id, l.item_id as "itemId", l.program_id as "programId", rp.name as "programName", e.name as "exerciseName",
            to_char(l.done_on, 'YYYY-MM-DD') as "doneOn", l.done_at as "doneAt", l.pain, l.note
       from public.rehab_logs l
       join public.rehab_programs rp on rp.id = l.program_id
       join public.rehab_items ri on ri.id = l.item_id join public.exercises e on e.id = ri.exercise_id
      where l.patient_id = $1 ${opts.programId ? 'and l.program_id = $3' : ''} order by l.done_at desc limit $2`,
    opts.programId ? [patientId, opts.limit ?? 40, opts.programId] : [patientId, opts.limit ?? 40]);

/** Dor média por dia (para o gráfico do fisioterapeuta). */
export const painByDay = (db: Db, patientId: string, from: string) =>
  db.query<{ day: string; pain: number; n: number }>(
    `select to_char(done_on, 'YYYY-MM-DD') as day, round(avg(pain)::numeric, 1)::float as pain, count(*)::int as n
       from public.rehab_logs where patient_id = $1 and pain is not null and done_on >= $2::date group by done_on order by done_on`, [patientId, from]);

/** Resumo para o paciente: quantos exercícios por fazer esta semana. */
export const weekSummary = (db: Db, patientId: string, weekStart: string, weekEnd: string) =>
  db.one<{ target: number; done: number }>(
    `select coalesce(sum(ri.weekly_target), 0)::int as target,
            coalesce((select count(*) from public.rehab_logs l join public.rehab_programs p2 on p2.id = l.program_id
                       where l.patient_id = $1 and p2.archived_at is null and l.done_on between $2::date and $3::date), 0)::int as done
       from public.rehab_items ri join public.rehab_programs rp on rp.id = ri.program_id where rp.patient_id = $1 and rp.archived_at is null`, [patientId, weekStart, weekEnd]);

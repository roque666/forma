import { withAdmin, withUser, type Db } from '@/lib/db/pool';
import type { Actor } from '@/lib/services/training';

let n = 0;
export const uniq = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;

export interface TestUser extends Actor { email: string; name: string }

/** Cria um utilizador diretamente (sem passar pelo fluxo web) — só para testes. */
export async function makeUser(role: 'student' | 'coach' | 'physio', name = uniq(role)): Promise<TestUser> {
  const email = `${name}@test.local`;
  const id = await withAdmin(async (db) => {
    const u = await db.one<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id`, [email, name]);
    if (role !== 'student') await db.exec('update public.profiles set role = $2 where id = $1', [u!.id, role]);
    return u!.id;
  });
  return { id, role, email, name };
}

/** Liga um atleta a um coach (aceite pelo próprio atleta, como na app). */
export async function link(coach: TestUser, student: TestUser): Promise<void> {
  const linkId = await withUser(coach.id, async (db) => (await db.one<{ id: string }>('select public.coach_invite_student($1) as id', [student.email]))!.id);
  await withUser(student.id, (db) => db.query('select public.accept_coach_link($1)', [linkId]));
}

export const as = <T>(u: { id: string }, fn: (db: Db) => Promise<T>) => withUser(u.id, fn);
export const admin = withAdmin;

export async function systemExercise(name: string): Promise<string> {
  return withAdmin(async (db) => (await db.one<{ id: string }>("select id from public.exercises where source = 'system' and name = $1", [name]))!.id);
}

/** Liga um paciente a um fisioterapeuta (aceite pelo próprio paciente). */
export async function linkPhysio(physio: TestUser, patient: TestUser): Promise<string> {
  const linkId = await withUser(physio.id, async (db) => (await db.one<{ id: string }>('select public.physio_invite_patient($1) as id', [patient.email]))!.id);
  await withUser(patient.id, (db) => db.query('select public.accept_physio_link($1)', [linkId]));
  return linkId;
}

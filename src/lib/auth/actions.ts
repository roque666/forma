'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { fail, formToObject, ok, parse, run, type ActionResult } from '../actions';
import { withAdmin } from '../db/pool';
import { mailLayout, sendMail } from '../mailer';
import { sendVerificationEmail } from './verification';
import {
  changePasswordSchema, loginSchema, registerSchema, resetPasswordSchema, resetRequestSchema,
} from '../validation/auth';
import { hashPassword, verifyPassword } from './password';
import {
  VIEW_MODE_COOKIE, clientIpFrom, createSession, destroySession, getSessionUser, hashToken, requireUser, revokeUserSessions,
} from './session';

export type FormState = ActionResult<undefined> | null;

const LOGIN_WINDOW_MIN = 15;
const MAX_FAILS_PER_EMAIL = 8;
const MAX_FAILS_PER_IP = 40;
const MAX_REGISTRATIONS_PER_IP_HOUR = 10;

const safeNext = (n: string | undefined) => (n && /^\/(?!\/)[\w\-/?=&%.]*$/.test(n) ? n : '/dashboard');

function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const p = parse(registerSchema, formToObject(fd));
    if ('error' in p) return p.error;
    const { fullName, email, password, coachCode, physioCode } = p.data;
    const ip = clientIpFrom(await headers());

    if (coachCode && physioCode) return fail('Usa só um código profissional.');
    const wantsPhysio = !!physioCode;
    if (wantsPhysio) {
      const expected = process.env.PHYSIO_SIGNUP_CODE;
      if (!expected) return fail('O registo de fisioterapeutas não está disponível.', { physioCode: 'Indisponível' });
      if (!constantTimeEquals(physioCode!, expected)) return fail('Código de fisioterapeuta inválido.', { physioCode: 'Código inválido' });
    }
    const wantsCoach = !!coachCode;
    if (wantsCoach) {
      const expected = process.env.COACH_SIGNUP_CODE;
      if (!expected) return fail('O registo de coaches não está disponível.', { coachCode: 'Indisponível' });
      if (!constantTimeEquals(coachCode!, expected)) return fail('Código de coach inválido.', { coachCode: 'Código inválido' });
    }

    const hash = await hashPassword(password);
    const result = await withAdmin(async (db) => {
      const recent = await db.one<{ n: number }>(
        `select count(*) as n from private.login_attempts
          where identifier = 'register' and ip = $1 and created_at > now() - interval '1 hour'`,
        [ip],
      );
      if ((recent?.n ?? 0) >= MAX_REGISTRATIONS_PER_IP_HOUR) return { error: 'Demasiados registos. Tenta mais tarde.' as const };
      await db.exec(`insert into private.login_attempts (identifier, ip, success) values ('register', $1, true)`, [ip]);

      const exists = await db.one('select 1 from auth.users where lower(email) = $1', [email]);
      if (exists) return { error: 'Já existe uma conta com este email. Tenta iniciar sessão.' as const };

      const user = await db.one<{ id: string }>(
        `insert into auth.users (email, encrypted_password, raw_user_meta_data)
         values ($1, $2, jsonb_build_object('full_name', $3::text)) returning id`,
        [email, hash, fullName],
      );
      // O trigger handle_new_user cria o perfil como 'student'. A promoção a coach só acontece aqui, no servidor.
      if (wantsCoach) await db.exec(`update public.profiles set role = 'coach' where id = $1`, [user!.id]);
      if (wantsPhysio) await db.exec(`update public.profiles set role = 'physio' where id = $1`, [user!.id]);
      return { id: user!.id };
    });
    if ('error' in result) return fail(result.error!, result.error!.startsWith('Já existe') ? { email: 'Email já registado' } : undefined);

    await createSession(result.id);
    await sendVerificationEmail({ id: result.id, email, fullName }, { welcome: true }); // não bloqueia o registo se falhar
    redirect('/dashboard');
  });
}

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const p = parse(loginSchema, formToObject(fd));
    if ('error' in p) return p.error;
    const { email, password, next } = p.data;
    const ip = clientIpFrom(await headers());

    const blocked = await withAdmin(async (db) => {
      const r = await db.one<{ by_email: number; by_ip: number }>(
        `select count(*) filter (where identifier = $1 and not success) as by_email,
                count(*) filter (where ip = $2 and not success) as by_ip
           from private.login_attempts
          where created_at > now() - ($3 || ' minutes')::interval`,
        [email, ip, String(LOGIN_WINDOW_MIN)],
      );
      return (r?.by_email ?? 0) >= MAX_FAILS_PER_EMAIL || (r?.by_ip ?? 0) >= MAX_FAILS_PER_IP;
    });
    if (blocked) return fail(`Demasiadas tentativas. Tenta novamente dentro de ${LOGIN_WINDOW_MIN} minutos.`);

    const user = await withAdmin((db) =>
      db.one<{ id: string; encrypted_password: string | null; must_change_password: boolean }>(
        `select u.id, u.encrypted_password, p.must_change_password
           from auth.users u join public.profiles p on p.id = u.id
          where lower(u.email) = $1`,
        [email],
      ),
    );
    const valid = await verifyPassword(password, user?.encrypted_password);
    await withAdmin((db) =>
      db.exec('insert into private.login_attempts (identifier, ip, success) values ($1, $2, $3)', [email, ip, valid]),
    );
    if (!valid || !user) return fail('Email ou palavra-passe incorretos.');

    await createSession(user.id);
    redirect(user.must_change_password ? '/change-password' : safeNext(next));
  });
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser({ allowMustChange: true });
    const p = parse(changePasswordSchema, formToObject(fd));
    if ('error' in p) return p.error;
    if (p.data.newPassword.toLowerCase() === user.email) return fail('A palavra-passe não pode ser o email.', { newPassword: 'Inválida' });

    const row = await withAdmin((db) =>
      db.one<{ encrypted_password: string | null }>('select encrypted_password from auth.users where id = $1', [user.id]),
    );
    if (!(await verifyPassword(p.data.currentPassword, row?.encrypted_password))) {
      return fail('A palavra-passe atual está incorreta.', { currentPassword: 'Incorreta' });
    }
    const hash = await hashPassword(p.data.newPassword);
    await withAdmin(async (db) => {
      await db.exec('update auth.users set encrypted_password = $1 where id = $2', [hash, user.id]);
      await db.exec('update public.profiles set must_change_password = false where id = $1', [user.id]);
    });
    await revokeUserSessions(user.id, true);
    if (user.mustChangePassword) redirect('/dashboard');
    return ok(undefined, 'Palavra-passe atualizada.');
  });
}

export async function requestPasswordResetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const p = parse(resetRequestSchema, formToObject(fd));
    if ('error' in p) return p.error;
    const ip = clientIpFrom(await headers());
    const email = p.data.email;

    const allowed = await withAdmin(async (db) => {
      const r = await db.one<{ n: number }>(
        `select count(*) as n from private.login_attempts
          where identifier = $1 and ip = $2 and created_at > now() - interval '1 hour'`,
        [`reset:${email}`, ip],
      );
      if ((r?.n ?? 0) >= 5) return false;
      await db.exec(`insert into private.login_attempts (identifier, ip, success) values ($1, $2, true)`, [`reset:${email}`, ip]);
      return true;
    });
    // Resposta sempre igual, exista ou não a conta (não revela contas registadas).
    const generic = ok(undefined, 'Se existir uma conta com este email, enviámos um link para redefinir a palavra-passe.');
    if (!allowed) return generic;

    const user = await withAdmin((db) => db.one<{ id: string }>('select id from auth.users where lower(email) = $1', [email]));
    if (user) {
      const token = randomBytes(32).toString('base64url');
      await withAdmin((db) =>
        db.exec(
          `insert into private.password_resets (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`,
          [hashToken(token), user.id],
        ),
      );
      const base = process.env.APP_URL ?? 'http://localhost:3000';
      const link = `${base}/reset-password?token=${token}`;
      const m = mailLayout({ title: 'Redefinir palavra-passe', paragraphs: ['Recebemos um pedido para redefinir a tua palavra-passe.'], button: { label: 'Escolher nova palavra-passe', url: link }, footer: 'O link expira em 1 hora. Se não foste tu, ignora este email.' });
      await sendMail({ to: email, subject: 'Redefinir palavra-passe', text: m.text, html: m.html });
    }
    return generic;
  });
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const p = parse(resetPasswordSchema, formToObject(fd));
    if ('error' in p) return p.error;
    const hash = await hashPassword(p.data.newPassword);
    const done = await withAdmin(async (db) => {
      const row = await db.one<{ user_id: string }>(
        `update private.password_resets set used_at = now()
          where token_hash = $1 and used_at is null and expires_at > now()
        returning user_id`,
        [hashToken(p.data.token)],
      );
      if (!row) return false;
      await db.exec('update auth.users set encrypted_password = $1 where id = $2', [hash, row.user_id]);
      await db.exec('update public.profiles set must_change_password = false, email_verified_at = coalesce(email_verified_at, now()) where id = $1', [row.user_id]); // receber o link prova que o email é dele
      await db.exec('delete from private.sessions where user_id = $1', [row.user_id]);
      return true;
    });
    if (!done) return fail('Link inválido ou expirado. Pede um novo.');
    redirect('/login?reset=1');
  });
}

/** Elimina a conta e todos os dados do próprio utilizador (RGPD). Exige a palavra-passe. */
export async function deleteAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const parsed = z.object({ password: z.string().min(1, 'Indica a palavra-passe'), confirm: z.literal('ELIMINAR', { errorMap: () => ({ message: 'Escreve ELIMINAR para confirmar' }) }) })
      .safeParse(formToObject(fd));
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const row = await withAdmin((db) => db.one<{ encrypted_password: string | null }>('select encrypted_password from auth.users where id = $1', [user.id]));
    if (!(await verifyPassword(parsed.data.password, row?.encrypted_password))) return fail('Palavra-passe incorreta.');
    await withAdmin(async (db) => {
      // Modelos do coach desaparecem com ele; exercícios do coach usados em planos de outros ficam na biblioteca.
      await db.exec('delete from public.workout_plans where is_template and created_by = $1', [user.id]);
      await db.exec(
        `update public.exercises e set owner_id = null, source = 'system', archived_at = coalesce(archived_at, now())
          where e.owner_id = $1 and exists (
            select 1 from public.plan_exercises pe join public.workout_plans p on p.id = pe.plan_id
             where pe.exercise_id = e.id and p.student_id is distinct from $1)`,
        [user.id],
      );
      await db.exec('delete from auth.users where id = $1', [user.id]);
    });
    await destroySession();
    redirect('/login?deleted=1');
  });
}

export async function currentUserOrNull() {
  return getSessionUser();
}

/** Só para contas de coach: alterna entre o modo coach e "O meu treino" (a app de atleta, com os dados do próprio coach). */
export async function setViewModeAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (user.realRole !== 'coach') redirect('/dashboard');
  const jar = await cookies();
  if (fd.get('mode') === 'personal') {
    jar.set(VIEW_MODE_COOKIE, 'personal', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 86_400 });
  } else {
    jar.delete(VIEW_MODE_COOKIE);
  }
  redirect('/dashboard');
}

/** Reenvia o email de confirmação (no máximo 1 de 5 em 5 minutos). */
export async function resendVerificationAction(): Promise<void> {
  const user = await requireUser();
  const state = await withAdmin(async (db) => {
    const p = await db.one<{ verified: boolean; recent: boolean }>(
      `select (email_verified_at is not null) as verified,
              exists (select 1 from private.email_verifications v where v.user_id = $1 and v.created_at > now() - interval '5 minutes') as recent
         from public.profiles where id = $1`, [user.id]);
    return p;
  });
  if (!state || state.verified) redirect('/profile');
  if (state.recent) redirect('/profile?mail=wait');
  const sent = await sendVerificationEmail({ id: user.id, email: user.email, fullName: user.fullName });
  redirect(`/profile?mail=${sent ? 'sent' : 'failed'}`);
}

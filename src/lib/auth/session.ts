import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash, randomBytes } from 'node:crypto';
import { withAdmin } from '../db/pool';

export const SESSION_COOKIE = 'gym_session';
/** Cookie do "modo" de um coach: 'personal' = usa a app como atleta, com os seus próprios dados. */
export const VIEW_MODE_COOKIE = 'view_mode';
const SESSION_DAYS = 30;

export type Role = 'student' | 'coach';

export interface SessionUser {
  id: string;
  email: string;
  /** Papel efetivo (um coach em "O meu treino" comporta-se como atleta). */
  role: Role;
  /** Papel real da conta. */
  realRole: Role;
  fullName: string;
  timezone: string;
  mustChangePassword: boolean;
  avatarUrl: string | null;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function clientIpFrom(h: Headers): string {
  // Atrás de um proxy de confiança (Vercel, nginx...) o primeiro valor de x-forwarded-for é o cliente.
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

/** Cria a sessão na BD (guarda apenas o hash do token) e define o cookie httpOnly. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const h = await headers();
  await withAdmin((db) =>
    db.exec(
      `insert into private.sessions (token_hash, user_id, expires_at, user_agent, ip)
       values ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
      [hashToken(token), userId, String(SESSION_DAYS), h.get('user-agent')?.slice(0, 300) ?? null, clientIpFrom(h)],
    ),
  );
  (await cookies()).delete(VIEW_MODE_COOKIE);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await withAdmin((db) => db.exec('delete from private.sessions where token_hash = $1', [hashToken(token)]));
  jar.delete(SESSION_COOKIE);
  jar.delete(VIEW_MODE_COOKIE);
}

/** Termina todas as sessões do utilizador (opcionalmente mantendo a atual). */
export async function revokeUserSessions(userId: string, keepCurrent = false): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const keep = keepCurrent && token ? hashToken(token) : '';
  await withAdmin((db) => db.exec('delete from private.sessions where user_id = $1 and token_hash <> $2', [userId, keep]));
}

/** Utilizador autenticado do pedido atual (ou null). Memoizado por pedido. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const personalMode = jar.get(VIEW_MODE_COOKIE)?.value === 'personal';
  return withAdmin(async (db) => {
    const row = await db.one<{
      id: string; email: string; role: Role; full_name: string; timezone: string;
      must_change_password: boolean; avatar_url: string | null; last_seen_at: string;
    }>(
      `select u.id, u.email, p.role, p.full_name, p.timezone, p.must_change_password, p.avatar_url, s.last_seen_at
         from private.sessions s
         join auth.users u on u.id = s.user_id
         join public.profiles p on p.id = u.id
        where s.token_hash = $1 and s.expires_at > now()`,
      [hashToken(token)],
    );
    if (!row) return null;
    if (Date.now() - new Date(row.last_seen_at).getTime() > 3_600_000) {
      await db.exec('update private.sessions set last_seen_at = now() where token_hash = $1', [hashToken(token)]);
    }
    return {
      id: row.id,
      email: row.email,
      role: row.role === 'coach' && personalMode ? 'student' : row.role,
      realRole: row.role,
      fullName: row.full_name,
      timezone: row.timezone,
      mustChangePassword: row.must_change_password,
      avatarUrl: row.avatar_url,
    };
  });
});

export async function requireUser(opts: { allowMustChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword && !opts.allowMustChange) redirect('/change-password');
  return user;
}

export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== role) redirect('/dashboard');
  return user;
}

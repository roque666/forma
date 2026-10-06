import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { addDays, startOfWeek, todayInTz } from '@/lib/dates';
import { uuid } from '@/lib/validation/common';

/** Utilizador autenticado que é mesmo fisioterapeuta; senão volta ao dashboard. */
export async function requirePhysioPage() {
  const user = await requireUser();
  if (user.realRole !== 'physio') redirect('/dashboard');
  return user;
}
export function weekOf(tz: string) {
  const today = todayInTz(tz);
  const weekStart = startOfWeek(today);
  return { today, weekStart, weekEnd: addDays(weekStart, 6) };
}
export function idParam(v: string): string {
  if (!uuid.safeParse(v).success) notFound();
  return v;
}

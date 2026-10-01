import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listActivePlans, toCalPlans } from '@/lib/data/plans';
import { listSessions } from '@/lib/data/sessions';
import { itemsOn, recurrenceLabel } from '@/lib/training/calendar';
import { addDays, formatDatePt, isoToLocalDate, isValidYmd, isoWeekday, startOfWeek, todayInTz, weekdayShort } from '@/lib/dates';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { StartWorkoutButton } from '@/components/training/start-button';
import { cn } from '@/components/ui/cn';

export const metadata = { title: 'Calendário' };

const COLORS = ['#84cc16', '#38bdf8', '#f59e0b', '#a78bfa', '#fb7185', '#2dd4bf', '#f472b6', '#94a3b8'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (user.role === 'coach') redirect('/students');
  const sp = await searchParams;
  const today = todayInTz(user.timezone);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const selected = isValidYmd(sp.d) ? sp.d : today;
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const rows = days.slice(35).every((d) => d.slice(0, 7) !== month) ? 5 : 6;

  const d = await withUser(user.id, async (db) => ({ plans: await listActivePlans(db, user.id), sessions: await listSessions(db, user.id, { limit: 200 }) }));
  const cal = toCalPlans(d.plans);
  const colorOf = new Map(cal.map((p, i) => [p.id, COLORS[i % COLORS.length]]));
  const doneDates = new Set(d.sessions.map((s) => isoToLocalDate(s.startedAt, user.timezone)));
  const selItems = itemsOn(cal, selected);
  const exCount = (planId: string, dayId: string) => d.plans.find((p) => p.id === planId)?.days.find((x) => x.id === dayId)?.exercises.length ?? 0;
  const href = (extra: Record<string, string>) => `/calendar?${new URLSearchParams({ m: month, d: selected, ...extra })}`;

  return (
    <>
      <PageHeader title="Calendário" subtitle="Os teus planos ao longo do tempo" actions={<LinkButton href="/workouts" variant="outline">Planos</LinkButton>} />
      {cal.length === 0 ? (
        <EmptyState title="Ainda não tens planos no calendário" description="Abre um plano e põe-no no calendário com a regularidade que quiseres." action={<LinkButton href="/workouts">Ver planos</LinkButton>} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <Link href={`/calendar?m=${prevMonth}`} aria-label="Mês anterior" className="rounded-lg p-2 hover:bg-surface2"><ChevronLeft className="h-5 w-5" /></Link>
              <h2 className="text-base font-bold capitalize">{MONTHS[m - 1]} {y}</h2>
              <Link href={`/calendar?m=${nextMonth}`} aria-label="Mês seguinte" className="rounded-lg p-2 hover:bg-surface2"><ChevronRight className="h-5 w-5" /></Link>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-muted">{[1, 2, 3, 4, 5, 6, 7].map((n) => <span key={n}>{weekdayShort(n)}</span>)}</div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.slice(0, rows * 7).map((date) => {
                const items = itemsOn(cal, date);
                const inMonth = date.slice(0, 7) === month;
                const isSel = date === selected;
                return (
                  <Link key={date} href={href({ d: date })} aria-label={`${formatDatePt(date, { day: 'numeric', month: 'long' })}${items.length ? `: ${items.map((i) => i.day.name).join(', ')}` : ''}`} aria-current={isSel ? 'date' : undefined}
                    className={cn('flex min-h-[3.4rem] flex-col items-center rounded-xl border px-1 py-1.5 text-sm transition', isSel ? 'border-accent-text bg-accent/15' : 'border-transparent hover:bg-surface2', !inMonth && 'opacity-40', date === today && 'font-bold ring-1 ring-accent-text')}>
                    <span className="tabular-nums">{Number(date.slice(8))}</span>
                    <span className="mt-1 flex flex-wrap justify-center gap-0.5">
                      {items.slice(0, 4).map((it) => <span key={it.day.id} className="h-2 w-2 rounded-full" style={{ background: colorOf.get(it.plan.id) }} />)}
                    </span>
                    {doneDates.has(date) && <Check className="mt-0.5 h-3 w-3 text-ok" aria-label="Treino feito" />}
                  </Link>
                );
              })}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs">
              {cal.map((p) => <li key={p.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf.get(p.id) }} /><Link href={`/workouts/${p.id}#calendario`} className="font-medium hover:underline">{p.name}</Link><span className="text-muted">· {recurrenceLabel(p.recurrence)}</span></li>)}
            </ul>
          </Card>
          <Card>
            <CardTitle>{selected === today ? 'Hoje' : formatDatePt(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</CardTitle>
            {selItems.length === 0 ? <p className="text-sm text-muted">Sem treinos marcados neste dia.</p> : (
              <ul className="space-y-3">
                {selItems.map((it) => (
                  <li key={it.day.id} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorOf.get(it.plan.id) }} />
                      <div className="min-w-0"><p className="truncate font-semibold">{it.day.name}</p><p className="truncate text-xs text-muted">{it.plan.name} · {exCount(it.plan.id, it.day.id)} exercícios</p></div>
                    </div>
                    {selected <= today && <StartWorkoutButton dayId={it.day.id} label="Iniciar" variant="outline" size="md" />}
                  </li>
                ))}
              </ul>
            )}
            {doneDates.has(selected) && <p className="mt-3 flex items-center gap-1.5 text-sm text-ok"><Check className="h-4 w-4" /> Treino feito neste dia</p>}
          </Card>
        </div>
      )}
    </>
  );
}

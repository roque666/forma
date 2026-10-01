import { addDays, dayNumber, isoWeekday, startOfWeek } from '../dates';
import { resolveSchedule, type ScheduleDay } from './schedule';

/** Regularidade de um plano no calendário. */
export interface Recurrence {
  kind: 'weekly' | 'monthly';
  /** de N em N semanas (kind = weekly) */
  every: number;
  /** 1–4 ou 5 = última semana do mês (kind = monthly) */
  weekOfMonth: number | null;
  /** data a partir da qual o plano está em vigor (a semana desta data conta como semana 0) */
  anchor: string | null;
  endsOn: string | null;
}

export interface CalPlan { id: string; name: string; recurrence: Recurrence; days: ScheduleDay[] }
export interface CalItem { plan: CalPlan; day: ScheduleDay }

const EPOCH_MONDAY = '2001-01-01';
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** O plano está em vigor na semana que começa (segunda-feira) em `weekStart`? */
export function planOnWeek(r: Recurrence, weekStart: string): boolean {
  const anchorWeek = startOfWeek(r.anchor ?? EPOCH_MONDAY);
  if (dayNumber(weekStart) < dayNumber(anchorWeek)) return false;
  if (r.kind === 'monthly') {
    const [y, m, d] = weekStart.split('-').map(Number);
    if (r.weekOfMonth === 5) return d + 7 > daysInMonth(y, m); // última semana: a segunda-feira seguinte já é de outro mês
    return Math.floor((d - 1) / 7) + 1 === r.weekOfMonth;
  }
  const weeks = Math.round((dayNumber(weekStart) - dayNumber(anchorWeek)) / 7);
  return weeks % Math.max(1, r.every) === 0;
}

export function planOnDate(r: Recurrence, date: string): boolean {
  if (r.endsOn && date > r.endsOn) return false;
  return planOnWeek(r, startOfWeek(date));
}

const hasWeekdays = (p: CalPlan) => p.days.some((d) => d.weekdays.length > 0);

/** Treinos com dia da semana marcado numa data (de todos os planos em vigor nesse dia). */
export function itemsOn(plans: CalPlan[], date: string): CalItem[] {
  const wd = isoWeekday(date);
  const out: CalItem[] = [];
  for (const plan of plans) {
    if (!planOnDate(plan.recurrence, date)) continue;
    for (const day of plan.days) if (day.weekdays.includes(wd)) out.push({ plan, day });
  }
  return out;
}

/** Próxima ocorrência (a partir do dia seguinte) de um treino com dia marcado. */
export function nextScheduled(plans: CalPlan[], from: string, horizon = 70): { date: string; item: CalItem } | null {
  for (let i = 1; i <= horizon; i++) {
    const date = addDays(from, i);
    const first = itemsOn(plans, date)[0];
    if (first) return { date, item: first };
  }
  return null;
}

export interface TodayEntry { plan: CalPlan; day: ScheduleDay; mode: 'weekday' | 'rotation'; done: boolean }
export interface TodayResult { entries: TodayEntry[]; next: { plan: CalPlan; day: ScheduleDay; date: string | null } | null; hasPlans: boolean }

/**
 * "Hoje" com vários planos: cada plano em vigor hoje contribui com o seu treino (dia da semana ou, sem dias fixos, o sugerido por rotação).
 * O "próximo" é o primeiro treino futuro marcado no calendário; sem nenhum, o seguinte de um plano em rotação.
 */
export function resolveToday(plans: CalPlan[], today: string, ctx: { lastByPlan?: Record<string, string>; completedTodayDayIds?: string[] }): TodayResult {
  const entries: TodayEntry[] = [];
  let rotationNext: TodayResult['next'] = null;
  for (const plan of plans) {
    if (plan.days.length === 0 || !planOnDate(plan.recurrence, today)) continue;
    const s = resolveSchedule({ days: plan.days, today, lastCompletedDayId: ctx.lastByPlan?.[plan.id] ?? null, completedTodayDayIds: ctx.completedTodayDayIds });
    if (s.today) entries.push({ plan, day: s.today, mode: s.mode === 'rotation' ? 'rotation' : 'weekday', done: s.doneToday });
    if (s.mode === 'rotation' && s.next && !rotationNext) rotationNext = { plan, day: s.next.day, date: null };
  }
  const sched = nextScheduled(plans.filter(hasWeekdays), today);
  const next = sched ? { plan: sched.item.plan, day: sched.item.day, date: sched.date } : rotationNext;
  return { entries, next, hasPlans: plans.length > 0 };
}

/** Treinos previstos na semana que começa em `weekStart` (para a adesão). */
export function expectedForWeek(plans: CalPlan[], weekStart: string): number {
  let n = 0;
  for (const p of plans) {
    if (p.days.length === 0 || !planOnWeek(p.recurrence, weekStart)) continue;
    const scheduled = p.days.reduce((s, d) => s + d.weekdays.length, 0);
    n += scheduled > 0 ? scheduled : Math.min(p.days.length, 7);
  }
  return n;
}

export function recurrenceLabel(r: Recurrence): string {
  if (r.kind === 'monthly') return r.weekOfMonth === 5 ? 'Uma vez por mês (última semana)' : `Uma vez por mês (${r.weekOfMonth}.ª semana)`;
  if (r.every === 1) return 'Todas as semanas';
  if (r.every === 2) return 'De 2 em 2 semanas';
  return `De ${r.every} em ${r.every} semanas`;
}

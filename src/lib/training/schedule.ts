import { addDays, isoWeekday } from '../dates';

export interface ScheduleDay { id: string; name: string; position: number; weekdays: number[] }

export interface ScheduleResult {
  mode: 'weekday' | 'rotation' | 'none';
  /** Treino de hoje (ou o sugerido, em modo rotação). */
  today: ScheduleDay | null;
  /** Já foi concluído hoje? */
  doneToday: boolean;
  /** Próximo treino depois do de hoje. */
  next: { day: ScheduleDay; date: string | null } | null;
}

/**
 * Determina "Treino de hoje" e "Próximo treino".
 *  - Com dias da semana definidos nos dias do plano: segue o calendário.
 *  - Sem dias da semana: rotação (o seguinte ao último concluído, por ordem).
 */
export function resolveSchedule(input: {
  days: ScheduleDay[];
  today: string;
  /** dia do plano do último treino concluído (para a rotação) */
  lastCompletedDayId?: string | null;
  /** dias do plano com sessão concluída hoje */
  completedTodayDayIds?: string[];
}): ScheduleResult {
  const days = [...input.days].sort((a, b) => a.position - b.position);
  if (days.length === 0) return { mode: 'none', today: null, doneToday: false, next: null };
  const doneIds = new Set(input.completedTodayDayIds ?? []);

  const scheduled = days.filter((d) => d.weekdays.length > 0);
  if (scheduled.length > 0) {
    const onDate = (date: string) => scheduled.find((d) => d.weekdays.includes(isoWeekday(date))) ?? null;
    const today = onDate(input.today);
    let next: ScheduleResult['next'] = null;
    for (let i = 1; i <= 7 && !next; i++) {
      const date = addDays(input.today, i);
      const day = onDate(date);
      if (day) next = { day, date };
    }
    return { mode: 'weekday', today, doneToday: today ? doneIds.has(today.id) : false, next };
  }

  const lastIdx = input.lastCompletedDayId ? days.findIndex((d) => d.id === input.lastCompletedDayId) : -1;
  const suggested = days[(lastIdx + 1) % days.length];
  const after = days.length > 1 ? days[(lastIdx + 2) % days.length] : null;
  const doneToday = doneIds.size > 0;
  // Já treinou hoje em modo rotação: o "de hoje" fica concluído e o próximo é o sugerido.
  if (doneToday) return { mode: 'rotation', today: days[lastIdx] ?? suggested, doneToday: true, next: { day: suggested, date: null } };
  return { mode: 'rotation', today: suggested, doneToday: false, next: after ? { day: after, date: null } : null };
}

/** Treinos previstos por semana (para a adesão). */
export function expectedSessionsPerWeek(days: { weekdays: number[] }[]): number {
  const scheduled = days.reduce((n, d) => n + d.weekdays.length, 0);
  return scheduled > 0 ? scheduled : Math.min(days.length, 7);
}

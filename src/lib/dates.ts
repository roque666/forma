/** Utilitários de datas (YYYY-MM-DD, sem depender do fuso do servidor). */

const MS_DAY = 86_400_000;

export function todayInTz(tz = 'Europe/Lisbon', now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const dayNumber = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
};
export const fromDayNumber = (n: number): string => new Date(n * MS_DAY).toISOString().slice(0, 10);

export function addDays(ymd: string, n: number): string {
  return fromDayNumber(dayNumber(ymd) + n);
}

/** 1 = segunda ... 7 = domingo */
export function isoWeekday(ymd: string): number {
  const d = new Date(dayNumber(ymd) * MS_DAY).getUTCDay();
  return d === 0 ? 7 : d;
}

export function startOfWeek(ymd: string): string {
  return addDays(ymd, -(isoWeekday(ymd) - 1));
}

export function startOfMonth(ymd: string): string {
  return ymd.slice(0, 8) + '01';
}

export function endOfMonth(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  return fromDayNumber(Math.round(Date.UTC(y, m, 1) / MS_DAY) - 1);
}

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = dayNumber(from); d <= dayNumber(to); d++) out.push(fromDayNumber(d));
  return out;
}

export function isValidYmd(v: string | undefined | null): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return fromDayNumber(dayNumber(v)) === v;
}

/** Instante ISO → YYYY-MM-DD no fuso dado. */
export function isoToLocalDate(iso: string, tz = 'Europe/Lisbon'): string {
  return todayInTz(tz, new Date(iso));
}

const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const weekdayShort = (iso: number) => WEEKDAYS_SHORT[iso - 1];
export const WEEKDAYS_LONG = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];

export function formatDatePt(ymd: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat('pt-PT', { ...opts, timeZone: 'UTC' }).format(new Date(dayNumber(ymd) * MS_DAY));
}

export function formatDateTimePt(iso: string, tz = 'Europe/Lisbon'): string {
  return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
}

export function relativeDayLabel(ymd: string, today: string): string {
  const diff = daysBetween(ymd, today);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff > 1 && diff < 7) return `Há ${diff} dias`;
  return formatDatePt(ymd, { day: 'numeric', month: 'short' });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

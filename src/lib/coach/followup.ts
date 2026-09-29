/**
 * Estado de acompanhamento de um aluno (página "Meus Alunos").
 * Calculado na aplicação a partir de coach_students_overview + coach_settings,
 * para os limites serem configuráveis por coach sem alterar a base de dados.
 */

export type FollowUpStatus = 'pending' | 'on_track' | 'attention' | 'inactive';

export type FollowUpReason =
  | 'no_active_plan'
  | 'no_workout'
  | 'workout_overdue'
  | 'no_meals'
  | 'meals_overdue'
  | 'no_weigh_in'
  | 'weigh_in_overdue';

export interface FollowUpThresholds {
  workoutAlertDays: number;
  mealAlertDays: number;
  weighInAlertDays: number;
  /** Sem qualquer atividade há tantos dias => "inativo". */
  inactiveDays: number;
}

export const DEFAULT_THRESHOLDS: FollowUpThresholds = {
  workoutAlertDays: 7,
  mealAlertDays: 3,
  weighInAlertDays: 14,
  inactiveDays: 14,
};

export interface StudentActivity {
  linkStatus: 'pending' | 'active' | 'ended';
  /** ISO timestamp do último treino concluído. */
  lastWorkoutAt: string | null;
  /** YYYY-MM-DD do último registo alimentar. */
  lastMealDate: string | null;
  /** YYYY-MM-DD da última pesagem. */
  lastWeighIn: string | null;
  hasActivePlan: boolean;
  /** ISO timestamp do início do vínculo (para alunos novos sem atividade ainda). */
  linkedAt: string;
}

export interface FollowUpResult {
  status: FollowUpStatus;
  reasons: FollowUpReason[];
  daysSince: { workout: number | null; meal: number | null; weighIn: number | null };
}

const MS_DAY = 86_400_000;
const dayNumber = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
};

/** Converte um instante para YYYY-MM-DD no fuso indicado (por defeito Europe/Lisbon). */
export function toLocalDate(iso: string, timeZone = 'Europe/Lisbon'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** Dias de calendário entre `date` e `today` (ambos YYYY-MM-DD). Nunca negativo. */
export function calendarDaysBetween(date: string, today: string): number {
  return Math.max(0, dayNumber(today) - dayNumber(date));
}

/**
 * @param today data de hoje (YYYY-MM-DD) no fuso do coach — passada de fora para o cálculo ser testável.
 */
export function computeFollowUp(
  a: StudentActivity,
  today: string,
  t: FollowUpThresholds = DEFAULT_THRESHOLDS,
  timeZone = 'Europe/Lisbon',
): FollowUpResult {
  const workoutDate = a.lastWorkoutAt ? toLocalDate(a.lastWorkoutAt, timeZone) : null;
  const daysSince = {
    workout: workoutDate ? calendarDaysBetween(workoutDate, today) : null,
    meal: a.lastMealDate ? calendarDaysBetween(a.lastMealDate, today) : null,
    weighIn: a.lastWeighIn ? calendarDaysBetween(a.lastWeighIn, today) : null,
  };

  if (a.linkStatus !== 'active') return { status: 'pending', reasons: [], daysSince };

  const linkedDays = calendarDaysBetween(toLocalDate(a.linkedAt, timeZone), today);
  const activity = [daysSince.workout, daysSince.meal, daysSince.weighIn].filter((d): d is number => d !== null);

  // Inativo: sem atividade recente (ou sem nunca ter tido, depois do período de arranque).
  const inactive = activity.length === 0 ? linkedDays > t.inactiveDays : Math.min(...activity) > t.inactiveDays;
  if (inactive) return { status: 'inactive', reasons: [], daysSince };

  // Alunos acabados de associar têm um período de graça para não gerar alertas falsos.
  const grace = linkedDays <= 3;
  const reasons: FollowUpReason[] = [];
  if (!a.hasActivePlan) reasons.push('no_active_plan');

  if (daysSince.workout === null) {
    if (!grace && a.hasActivePlan) reasons.push('no_workout');
  } else if (daysSince.workout > t.workoutAlertDays) reasons.push('workout_overdue');

  if (daysSince.meal === null) {
    if (!grace) reasons.push('no_meals');
  } else if (daysSince.meal > t.mealAlertDays) reasons.push('meals_overdue');

  if (daysSince.weighIn === null) {
    if (!grace) reasons.push('no_weigh_in');
  } else if (daysSince.weighIn > t.weighInAlertDays) reasons.push('weigh_in_overdue');

  return { status: reasons.length ? 'attention' : 'on_track', reasons, daysSince };
}

export const FOLLOWUP_LABELS_PT: Record<FollowUpStatus, string> = {
  pending: 'Convite pendente',
  on_track: 'Em dia',
  attention: 'Precisa de atenção',
  inactive: 'Inativo',
};

export const FOLLOWUP_REASON_LABELS_PT: Record<FollowUpReason, string> = {
  no_active_plan: 'Sem plano de treino atual',
  no_workout: 'Ainda sem treinos registados',
  workout_overdue: 'Sem treinar há vários dias',
  no_meals: 'Ainda sem refeições registadas',
  meals_overdue: 'Sem registar refeições há vários dias',
  no_weigh_in: 'Ainda sem pesagens',
  weigh_in_overdue: 'Sem pesagem há vários dias',
};

const PRIORITY: Record<FollowUpStatus, number> = { attention: 0, inactive: 1, on_track: 2, pending: 3 };

/** Ordena "Meus Alunos": primeiro quem precisa de atenção, depois inativos, em dia e pendentes. */
export function sortByAttention<T extends { followUp: FollowUpResult; fullName?: string | null }>(rows: T[]): T[] {
  return [...rows].sort(
    (x, y) =>
      PRIORITY[x.followUp.status] - PRIORITY[y.followUp.status] ||
      y.followUp.reasons.length - x.followUp.reasons.length ||
      (x.fullName ?? '').localeCompare(y.fullName ?? '', 'pt'),
  );
}

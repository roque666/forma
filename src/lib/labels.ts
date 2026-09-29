export const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Peito', upper_back: 'Costas (superior)', lats: 'Dorsais', shoulders: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps',
  forearms: 'Antebraços', abs: 'Abdominais', obliques: 'Oblíquos', lower_back: 'Lombar', traps: 'Trapézios', glutes: 'Glúteos',
  quads: 'Quadríceps', hamstrings: 'Isquiotibiais', calves: 'Gémeos', adductors: 'Adutores', full_body: 'Corpo inteiro', cardio: 'Cardio',
};
export const MUSCLES = Object.keys(MUSCLE_LABELS);

export const TRACKING_LABELS: Record<string, string> = {
  weight_reps: 'Peso × repetições', bodyweight_reps: 'Peso corporal × repetições', duration: 'Duração',
};

export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Pequeno-almoço', lunch: 'Almoço', dinner: 'Jantar', snack: 'Lanche',
  pre_workout: 'Pré-treino', post_workout: 'Pós-treino', other: 'Outras',
};
export const MEAL_TYPES = Object.keys(MEAL_TYPE_LABELS);

export const PR_LABELS: Record<string, string> = {
  max_weight: 'Peso máximo', est_1rm: '1RM estimado', max_reps: 'Repetições máximas',
  best_set_volume: 'Melhor série (volume)', session_volume: 'Volume da sessão', reps_at_weight: 'Repetições ao mesmo peso',
};

export const GOAL_LABELS: Record<string, string> = { cut: 'Cut', maintenance: 'Manutenção', bulk: 'Bulk' };

export const fmtNum = (n: number | null | undefined, decimals = 1) =>
  n == null ? '—' : new Intl.NumberFormat('pt-PT', { maximumFractionDigits: decimals }).format(n);
export const fmtKg = (n: number | null | undefined) => (n == null ? '—' : `${fmtNum(n, 2)} kg`);
export const fmtKcal = (n: number | null | undefined) => (n == null ? '—' : `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(n)} kcal`);

export function prValueText(type: string, value: number, weightKg?: number | null, reps?: number | null): string {
  switch (type) {
    case 'max_weight': return `${fmtNum(value, 2)} kg`;
    case 'est_1rm': return `${fmtNum(value, 1)} kg`;
    case 'max_reps': return `${fmtNum(value, 0)} reps`;
    case 'best_set_volume': return `${fmtNum(value, 0)} kg` + (weightKg && reps ? ` (${fmtNum(weightKg, 2)}×${reps})` : '');
    case 'session_volume': return `${fmtNum(value, 0)} kg`;
    case 'reps_at_weight': return `${fmtNum(value, 0)} reps @ ${fmtNum(weightKg ?? 0, 2)} kg`;
    default: return fmtNum(value);
  }
}

export const trackingHint = (t: string) => (t === 'weight_reps' ? null : TRACKING_LABELS[t]);

/**
 * Motor de cálculo nutricional (funções puras, sem dependências).
 * Todos os resultados são ESTIMATIVAS e devem poder ser ajustados pelo utilizador/coach.
 */

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active' | 'extra_active';
export type GoalType = 'cut' | 'maintenance' | 'bulk';
export type BmrFormula = 'mifflin_st_jeor' | 'katch_mcardle';

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export const ACTIVITY_LABELS_PT: Record<ActivityLevel, string> = {
  sedentary: 'Sedentário',
  light: 'Ligeiramente ativo',
  moderate: 'Moderadamente ativo',
  very_active: 'Muito ativo',
  extra_active: 'Extremamente ativo',
};

export const GOAL_LABELS_PT: Record<GoalType, string> = {
  cut: 'Cut',
  maintenance: 'Manutenção',
  bulk: 'Bulk',
};

/** Percentagens por defeito (magnitude). CUT = défice, BULK = excedente. */
export const DEFAULT_ADJUSTMENT_PCT: Record<GoalType, number> = {
  cut: 15,
  maintenance: 0,
  bulk: 10,
};

export const DEFAULT_PROTEIN_G_PER_KG: Record<GoalType, number> = {
  cut: 2.0,
  maintenance: 1.8,
  bulk: 1.8,
};
export const DEFAULT_FAT_G_PER_KG = 0.9;

export const MAX_ADJUSTMENT_PCT = 50;
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export const NUTRITION_DISCLAIMER_PT =
  'Estes valores são estimativas baseadas em fórmulas gerais e não constituem aconselhamento médico ou nutricional. ' +
  'Ajusta-os conforme a tua resposta e, em caso de condições de saúde, consulta um profissional.';

export interface NutritionInputs {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: GoalType;
  bodyFatPct?: number | null;
  /** Por defeito Mifflin-St Jeor. Katch-McArdle exige bodyFatPct. */
  bmrFormula?: BmrFormula;
  /** Magnitude em % (positiva). Défice no CUT, excedente no BULK. Ignorada em MANUTENÇÃO. */
  adjustmentPct?: number;
  /** Meta calórica manual (substitui a calculada). */
  manualCalories?: number | null;
  proteinGPerKg?: number;
  fatGPerKg?: number;
}

export type WarningCode =
  | 'under_min_calories'
  | 'minor_age'
  | 'aggressive_deficit'
  | 'aggressive_surplus'
  | 'macros_exceed_calories'
  | 'manual_override';

export interface NutritionWarning {
  code: WarningCode;
  severity: 'info' | 'warning';
}

export interface NutritionResult {
  bmrFormula: BmrFormula;
  bmr: number;
  activityFactor: number;
  tdee: number;
  /** Percentagem com sinal: CUT negativo, BULK positivo, MANUTENÇÃO 0. */
  adjustmentPct: number;
  caloriesCalculated: number;
  caloriesTarget: number;
  isManualOverride: boolean;
  proteinG: number;
  fatG: number;
  carbsG: number;
  proteinGPerKg: number;
  fatGPerKg: number;
  macroKcal: { protein: number; fat: number; carbs: number };
  macroPct: { protein: number; fat: number; carbs: number };
  warnings: NutritionWarning[];
}

export function ageFromBirthDate(birthDate: string | Date, on: Date = new Date()): number {
  const b = typeof birthDate === 'string' ? new Date(`${birthDate}T00:00:00Z`) : birthDate;
  let age = on.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < b.getUTCMonth() ||
    (on.getUTCMonth() === b.getUTCMonth() && on.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function assertRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} fora do intervalo válido (${min}–${max}): ${value}`);
  }
}

export function calculateBmr(
  input: Pick<NutritionInputs, 'sex' | 'ageYears' | 'heightCm' | 'weightKg' | 'bodyFatPct'>,
  formula: BmrFormula = 'mifflin_st_jeor',
): number {
  const { sex, ageYears, heightCm, weightKg, bodyFatPct } = input;
  if (formula === 'katch_mcardle') {
    if (bodyFatPct == null) throw new Error('Katch-McArdle requer percentagem de gordura corporal');
    const leanMass = weightKg * (1 - bodyFatPct / 100);
    return Math.round(370 + 21.6 * leanMass);
  }
  const s = sex === 'male' ? 5 : -161;
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * ageYears + s);
}

export function signedAdjustment(goal: GoalType, magnitudePct: number): number {
  if (goal === 'maintenance') return 0;
  return goal === 'cut' ? -magnitudePct : magnitudePct;
}

/** Calorias objetivo a partir do TDEE. Ex.: 2500 → CUT 15% = 2125, BULK 10% = 2750. */
export function caloriesForGoal(tdee: number, goal: GoalType, magnitudePct: number): number {
  return Math.round(tdee * (1 + signedAdjustment(goal, magnitudePct) / 100));
}

export interface GoalScenario {
  goal: GoalType;
  adjustmentPct: number; // com sinal
  calories: number;
}

/** Os três cenários lado a lado, para mostrar de forma clara ao utilizador. */
export function buildScenarios(
  tdee: number,
  pct: { cut?: number; bulk?: number } = {},
): GoalScenario[] {
  const cut = pct.cut ?? DEFAULT_ADJUSTMENT_PCT.cut;
  const bulk = pct.bulk ?? DEFAULT_ADJUSTMENT_PCT.bulk;
  return [
    { goal: 'cut', adjustmentPct: -cut, calories: caloriesForGoal(tdee, 'cut', cut) },
    { goal: 'maintenance', adjustmentPct: 0, calories: caloriesForGoal(tdee, 'maintenance', 0) },
    { goal: 'bulk', adjustmentPct: bulk, calories: caloriesForGoal(tdee, 'bulk', bulk) },
  ];
}

const MIN_CALORIES: Record<Sex, number> = { male: 1500, female: 1200 };

export function calculateNutrition(input: NutritionInputs): NutritionResult {
  assertRange('Idade', input.ageYears, 14, 100);
  assertRange('Altura (cm)', input.heightCm, 100, 250);
  assertRange('Peso (kg)', input.weightKg, 25, 400);
  if (input.bodyFatPct != null) assertRange('Gordura corporal (%)', input.bodyFatPct, 2, 70);

  const magnitude = input.adjustmentPct ?? DEFAULT_ADJUSTMENT_PCT[input.goal];
  assertRange('Percentagem de ajuste', magnitude, 0, MAX_ADJUSTMENT_PCT);
  if (input.manualCalories != null) assertRange('Calorias manuais', input.manualCalories, 800, 10000);

  const formula = input.bmrFormula ?? 'mifflin_st_jeor';
  const bmr = calculateBmr(input, formula);
  const activityFactor = ACTIVITY_FACTORS[input.activityLevel];
  const tdee = Math.round(bmr * activityFactor);

  const caloriesCalculated = caloriesForGoal(tdee, input.goal, magnitude);
  const isManualOverride = input.manualCalories != null;
  const caloriesTarget = isManualOverride ? Math.round(input.manualCalories as number) : caloriesForGoal(tdee, input.goal, magnitude);

  const proteinGPerKg = input.proteinGPerKg ?? DEFAULT_PROTEIN_G_PER_KG[input.goal];
  const fatGPerKg = input.fatGPerKg ?? DEFAULT_FAT_G_PER_KG;
  const proteinG = Math.round(proteinGPerKg * input.weightKg);
  const fatG = Math.round(fatGPerKg * input.weightKg);

  const remainingKcal = caloriesTarget - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat;
  const carbsG = Math.max(0, Math.round(remainingKcal / KCAL_PER_G.carbs));

  const macroKcal = {
    protein: proteinG * KCAL_PER_G.protein,
    fat: fatG * KCAL_PER_G.fat,
    carbs: carbsG * KCAL_PER_G.carbs,
  };
  const macroTotal = macroKcal.protein + macroKcal.fat + macroKcal.carbs || 1;
  const macroPct = {
    protein: Math.round((macroKcal.protein / macroTotal) * 100),
    fat: Math.round((macroKcal.fat / macroTotal) * 100),
    carbs: Math.round((macroKcal.carbs / macroTotal) * 100),
  };

  const warnings: NutritionWarning[] = [];
  if (input.ageYears < 18) warnings.push({ code: 'minor_age', severity: 'warning' });
  if (caloriesTarget < MIN_CALORIES[input.sex]) warnings.push({ code: 'under_min_calories', severity: 'warning' });
  if (input.goal === 'cut' && magnitude > 25 && !isManualOverride) warnings.push({ code: 'aggressive_deficit', severity: 'warning' });
  if (input.goal === 'bulk' && magnitude > 20 && !isManualOverride) warnings.push({ code: 'aggressive_surplus', severity: 'warning' });
  if (remainingKcal < 0) warnings.push({ code: 'macros_exceed_calories', severity: 'warning' });
  if (isManualOverride) warnings.push({ code: 'manual_override', severity: 'info' });

  return {
    bmrFormula: formula,
    bmr,
    activityFactor,
    tdee,
    adjustmentPct: signedAdjustment(input.goal, magnitude),
    caloriesCalculated,
    caloriesTarget,
    isManualOverride,
    proteinG,
    fatG,
    carbsG,
    proteinGPerKg,
    fatGPerKg,
    macroKcal,
    macroPct,
    warnings,
  };
}

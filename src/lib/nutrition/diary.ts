/** Lógica do diário alimentar (funções puras). */

export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
}

export interface FoodPer100g {
  kcal100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
  fiber100g?: number | null;
  /** g por ml; por defeito 1 (água). */
  densityGPerMl?: number | null;
}

export type FoodUnit = 'g' | 'ml' | 'unit';

export interface Amount {
  quantity: number;
  unit: FoodUnit;
  /** Necessário quando unit = 'unit' (ex.: 1 banana = 120 g). */
  gramsPerUnit?: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function amountToGrams(food: Pick<FoodPer100g, 'densityGPerMl'>, amount: Amount): number {
  if (!(amount.quantity > 0)) throw new RangeError('A quantidade tem de ser positiva');
  switch (amount.unit) {
    case 'g':
      return amount.quantity;
    case 'ml':
      return amount.quantity * (food.densityGPerMl ?? 1);
    case 'unit':
      if (!amount.gramsPerUnit || amount.gramsPerUnit <= 0) {
        throw new Error('Unidade sem equivalência em gramas');
      }
      return amount.quantity * amount.gramsPerUnit;
  }
}

/** Ex.: peito de frango 165 kcal/100 g × 200 g = 330 kcal. */
export function scaleFood(food: FoodPer100g, amount: Amount): Nutrients {
  const factor = amountToGrams(food, amount) / 100;
  return {
    kcal: round1(food.kcal100g * factor),
    proteinG: round1(food.protein100g * factor),
    carbsG: round1(food.carbs100g * factor),
    fatG: round1(food.fat100g * factor),
    fiberG: food.fiber100g == null ? null : round1(food.fiber100g * factor),
  };
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  const total: Nutrients = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: null };
  for (const i of items) {
    total.kcal += i.kcal;
    total.proteinG += i.proteinG;
    total.carbsG += i.carbsG;
    total.fatG += i.fatG;
    if (i.fiberG != null) total.fiberG = (total.fiberG ?? 0) + i.fiberG;
  }
  return {
    kcal: round1(total.kcal),
    proteinG: round1(total.proteinG),
    carbsG: round1(total.carbsG),
    fatG: round1(total.fatG),
    fiberG: total.fiberG == null ? null : round1(total.fiberG),
  };
}

export interface Targets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MetricProgress {
  consumed: number;
  target: number;
  /** Pode ser negativo quando o objetivo é ultrapassado. */
  remaining: number;
  /** Percentagem real (pode passar 100). */
  percent: number;
  /** Para a barra de progresso (0–100). */
  barPercent: number;
  over: boolean;
}

function metric(consumed: number, target: number): MetricProgress {
  const percent = target > 0 ? (consumed / target) * 100 : 0;
  return {
    consumed: Math.round(consumed),
    target: Math.round(target),
    remaining: Math.round(target - consumed),
    percent: Math.round(percent),
    barPercent: Math.min(100, Math.max(0, Math.round(percent))),
    over: consumed > target,
  };
}

/** Resumo do fim do dia: consumido / objetivo / restante + barras. */
export function dailyProgress(consumed: Nutrients, target: Targets) {
  return {
    kcal: metric(consumed.kcal, target.kcal),
    protein: metric(consumed.proteinG, target.proteinG),
    carbs: metric(consumed.carbsG, target.carbsG),
    fat: metric(consumed.fatG, target.fatG),
  };
}

export type DayStatus = 'within' | 'over' | 'under' | 'no_data';

export function classifyDay(consumedKcal: number, targetKcal: number, tolerancePct = 10): DayStatus {
  if (consumedKcal <= 0) return 'no_data';
  const diffPct = ((consumedKcal - targetKcal) / targetKcal) * 100;
  if (Math.abs(diffPct) <= tolerancePct) return 'within';
  return diffPct > 0 ? 'over' : 'under';
}

export interface DayRecord {
  /** YYYY-MM-DD */
  date: string;
  totals: Nutrients;
  /** Meta em vigor nesse dia (o histórico de metas pode variar). */
  target: Targets;
}

export interface PeriodStats {
  daysInPeriod: number;
  daysLogged: number;
  avgKcal: number;
  avgProteinG: number;
  avgCarbsG: number;
  avgFatG: number;
  daysWithin: number;
  daysOver: number;
  daysUnder: number;
  daysProteinOnTarget: number;
}

/**
 * Estatísticas semanais/mensais. Médias calculadas apenas sobre dias com registos
 * (dias sem registo não puxam a média para baixo).
 */
export function periodStats(
  days: DayRecord[],
  opts: { daysInPeriod?: number; tolerancePct?: number; proteinMinPct?: number } = {},
): PeriodStats {
  const tolerancePct = opts.tolerancePct ?? 10;
  const proteinMinPct = opts.proteinMinPct ?? 90;
  const logged = days.filter((d) => d.totals.kcal > 0);
  const n = logged.length;
  const avg = (pick: (d: DayRecord) => number) =>
    n === 0 ? 0 : Math.round(logged.reduce((s, d) => s + pick(d), 0) / n);

  let within = 0;
  let over = 0;
  let under = 0;
  let proteinOk = 0;
  for (const d of logged) {
    const status = classifyDay(d.totals.kcal, d.target.kcal, tolerancePct);
    if (status === 'within') within++;
    else if (status === 'over') over++;
    else if (status === 'under') under++;
    if (d.target.proteinG > 0 && d.totals.proteinG >= (d.target.proteinG * proteinMinPct) / 100) proteinOk++;
  }

  return {
    daysInPeriod: opts.daysInPeriod ?? days.length,
    daysLogged: n,
    avgKcal: avg((d) => d.totals.kcal),
    avgProteinG: avg((d) => d.totals.proteinG),
    avgCarbsG: avg((d) => d.totals.carbsG),
    avgFatG: avg((d) => d.totals.fatG),
    daysWithin: within,
    daysOver: over,
    daysUnder: under,
    daysProteinOnTarget: proteinOk,
  };
}

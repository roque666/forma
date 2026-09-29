/** Acompanhamento corporal (funções puras). Datas em YYYY-MM-DD, sem depender de fusos horários. */

import type { GoalType } from '../nutrition/calculator';

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  weightKg: number;
  bodyFatPct?: number | null;
}

const MS_DAY = 86_400_000;
const KCAL_PER_KG = 7700;

const dayNumber = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
};
const dayToString = (n: number): string => new Date(n * MS_DAY).toISOString().slice(0, 10);
const round = (n: number, decimals = 2) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};
const sorted = (entries: WeightEntry[]) =>
  [...entries].sort((a, b) => dayNumber(a.date) - dayNumber(b.date));

/** Média móvel sobre os últimos `windowDays` dias de calendário (inclui o próprio dia). */
export function movingAverage(entries: WeightEntry[], windowDays = 7) {
  const list = sorted(entries);
  return list.map((e, i) => {
    const end = dayNumber(e.date);
    const inWindow = list.slice(0, i + 1).filter((x) => dayNumber(x.date) > end - windowDays);
    const avg = inWindow.reduce((s, x) => s + x.weightKg, 0) / inWindow.length;
    return { date: e.date, weightKg: e.weightKg, average: round(avg) };
  });
}

/** Média por semana (segunda a domingo). */
export function weeklyAverages(entries: WeightEntry[]) {
  const weeks = new Map<number, WeightEntry[]>();
  for (const e of sorted(entries)) {
    const n = dayNumber(e.date);
    const weekday = (new Date(n * MS_DAY).getUTCDay() + 6) % 7; // segunda = 0
    const start = n - weekday;
    weeks.set(start, [...(weeks.get(start) ?? []), e]);
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, list]) => {
      const fats = list.map((x) => x.bodyFatPct).filter((x): x is number => x != null);
      return {
        weekStart: dayToString(start),
        entries: list.length,
        avgWeightKg: round(list.reduce((s, x) => s + x.weightKg, 0) / list.length),
        avgBodyFatPct: fats.length ? round(fats.reduce((s, x) => s + x, 0) / fats.length, 1) : null,
      };
    });
}

/**
 * Tendência em kg/semana por regressão linear nos últimos `days` dias.
 * Devolve null se não houver dados suficientes (mín. 3 registos e 7 dias de intervalo).
 */
export function weightTrendKgPerWeek(entries: WeightEntry[], days = 28): number | null {
  const list = sorted(entries);
  if (list.length === 0) return null;
  const last = dayNumber(list[list.length - 1].date);
  const recent = list.filter((e) => dayNumber(e.date) > last - days);
  if (recent.length < 3) return null;
  const xs = recent.map((e) => dayNumber(e.date));
  if (Math.max(...xs) - Math.min(...xs) < 7) return null;

  const n = recent.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = recent.reduce((s, e) => s + e.weightKg, 0) / n;
  let num = 0;
  let den = 0;
  recent.forEach((e, i) => {
    num += (xs[i] - meanX) * (e.weightKg - meanY);
    den += (xs[i] - meanX) ** 2;
  });
  return round((num / den) * 7);
}

export interface GoalProgress {
  startKg: number;
  currentKg: number;
  targetKg: number;
  /** current − target (positivo = ainda acima do objetivo). */
  differenceToGoalKg: number;
  /** current − start (negativo = perdeu peso). */
  evolutionKg: number;
  percent: number; // 0–100
  direction: 'lose' | 'gain' | 'maintain';
  reached: boolean;
}

/** Ex.: inicial 82, atual 79,5, objetivo 75 → diferença 4,5 kg, evolução −2,5 kg, 35,7 %. */
export function goalProgress(p: { startKg: number; currentKg: number; targetKg: number }): GoalProgress {
  const total = p.targetKg - p.startKg;
  const direction = total < 0 ? 'lose' : total > 0 ? 'gain' : 'maintain';
  const done = p.currentKg - p.startKg;
  const raw = total === 0 ? (p.currentKg === p.targetKg ? 100 : 0) : (done / total) * 100;
  const reached =
    direction === 'lose' ? p.currentKg <= p.targetKg : direction === 'gain' ? p.currentKg >= p.targetKg : p.currentKg === p.targetKg;
  return {
    startKg: p.startKg,
    currentKg: p.currentKg,
    targetKg: p.targetKg,
    differenceToGoalKg: round(p.currentKg - p.targetKg),
    evolutionKg: round(done),
    percent: round(Math.min(100, Math.max(0, raw)), 1),
    direction,
    reached,
  };
}

export type PaceStatus = 'on_track' | 'faster' | 'slower' | 'opposite' | 'insufficient_data';

export interface PaceComparison {
  expectedKgPerWeek: number;
  actualKgPerWeek: number | null;
  status: PaceStatus;
}

/**
 * Relaciona a tendência real de peso com o objetivo nutricional atual.
 * Ritmo esperado = (calorias objetivo − TDEE) × 7 / 7700.
 */
export function compareWithGoal(p: {
  goal: GoalType;
  tdee: number;
  caloriesTarget: number;
  trendKgPerWeek: number | null;
}): PaceComparison {
  const expected = round(((p.caloriesTarget - p.tdee) * 7) / KCAL_PER_KG);
  if (p.trendKgPerWeek == null) {
    return { expectedKgPerWeek: expected, actualKgPerWeek: null, status: 'insufficient_data' };
  }
  const actual = p.trendKgPerWeek;
  const tolerance = Math.max(0.15, Math.abs(expected) * 0.25);

  let status: PaceStatus;
  if (p.goal === 'maintenance') {
    status = Math.abs(actual) <= 0.25 ? 'on_track' : actual > 0 ? 'faster' : 'slower';
  } else if (Math.abs(actual - expected) <= tolerance) {
    status = 'on_track';
  } else if (Math.sign(actual) !== Math.sign(expected) && Math.abs(actual) > 0.1) {
    status = 'opposite';
  } else {
    status = Math.abs(actual) > Math.abs(expected) ? 'faster' : 'slower';
  }
  return { expectedKgPerWeek: expected, actualKgPerWeek: actual, status };
}

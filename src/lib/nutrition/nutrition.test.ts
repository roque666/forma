import { describe, expect, it } from 'vitest';
import {
  ageFromBirthDate,
  buildScenarios,
  calculateBmr,
  calculateNutrition,
  caloriesForGoal,
  type NutritionInputs,
} from './calculator';
import { classifyDay, dailyProgress, periodStats, scaleFood, sumNutrients } from './diary';
import {
  compareWithGoal,
  goalProgress,
  movingAverage,
  weeklyAverages,
  weightTrendKgPerWeek,
  type WeightEntry,
} from '../body/weight';

const male80: NutritionInputs = {
  sex: 'male',
  ageYears: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'moderate',
  goal: 'cut',
};

describe('BMR / TDEE', () => {
  it('Mifflin-St Jeor homem e mulher', () => {
    expect(calculateBmr(male80)).toBe(1780);
    expect(calculateBmr({ sex: 'female', ageYears: 25, heightCm: 165, weightKg: 60 })).toBe(1345);
  });
  it('Katch-McArdle com gordura corporal', () => {
    expect(calculateBmr({ ...male80, bodyFatPct: 15 }, 'katch_mcardle')).toBe(1839);
    expect(() => calculateBmr(male80, 'katch_mcardle')).toThrow();
  });
  it('TDEE = BMR × fator de atividade', () => {
    expect(calculateNutrition(male80).tdee).toBe(2759);
  });
  it('idade a partir da data de nascimento', () => {
    expect(ageFromBirthDate('1996-06-15', new Date('2026-06-14T12:00:00Z'))).toBe(29);
    expect(ageFromBirthDate('1996-06-15', new Date('2026-06-15T12:00:00Z'))).toBe(30);
  });
});

describe('Calorias objetivo', () => {
  it('exemplo do enunciado: TDEE 2500', () => {
    expect(caloriesForGoal(2500, 'cut', 15)).toBe(2125);
    expect(caloriesForGoal(2500, 'maintenance', 15)).toBe(2500);
    expect(caloriesForGoal(2500, 'bulk', 10)).toBe(2750);
  });
  it('percentagens configuráveis', () => {
    expect(caloriesForGoal(2500, 'cut', 20)).toBe(2000);
    expect(caloriesForGoal(2500, 'bulk', 5)).toBe(2625);
    const s = buildScenarios(2500, { cut: 20, bulk: 5 });
    expect(s.map((x) => x.calories)).toEqual([2000, 2500, 2625]);
    expect(s.map((x) => x.adjustmentPct)).toEqual([-20, 0, 5]);
  });
  it('valores por defeito 15% / 10%', () => {
    expect(buildScenarios(2500).map((x) => x.calories)).toEqual([2125, 2500, 2750]);
  });
  it('meta manual substitui a calculada mas preserva a calculada', () => {
    const r = calculateNutrition({ ...male80, manualCalories: 2300 });
    expect(r.caloriesTarget).toBe(2300);
    expect(r.caloriesCalculated).toBe(2345);
    expect(r.isManualOverride).toBe(true);
    expect(r.warnings.some((w) => w.code === 'manual_override')).toBe(true);
  });
  it('ajuste com sinal guardado para histórico', () => {
    expect(calculateNutrition(male80).adjustmentPct).toBe(-15);
    expect(calculateNutrition({ ...male80, goal: 'bulk' }).adjustmentPct).toBe(10);
    expect(calculateNutrition({ ...male80, goal: 'maintenance' }).adjustmentPct).toBe(0);
  });
});

describe('Macros', () => {
  it('CUT 80 kg: proteína 2 g/kg, gordura 0,9 g/kg, hidratos pelo restante', () => {
    const r = calculateNutrition(male80);
    expect(r.caloriesTarget).toBe(2345);
    expect(r.proteinG).toBe(160);
    expect(r.fatG).toBe(72);
    expect(r.carbsG).toBe(264);
    expect(r.macroPct.protein + r.macroPct.fat + r.macroPct.carbs).toBeGreaterThanOrEqual(99);
  });
  it('g/kg configuráveis', () => {
    const r = calculateNutrition({ ...male80, proteinGPerKg: 2.2, fatGPerKg: 1 });
    expect(r.proteinG).toBe(176);
    expect(r.fatG).toBe(80);
  });
});

describe('Validações e avisos', () => {
  it('rejeita valores absurdos', () => {
    expect(() => calculateNutrition({ ...male80, weightKg: 5 })).toThrow(RangeError);
    expect(() => calculateNutrition({ ...male80, adjustmentPct: -5 })).toThrow(RangeError);
    expect(() => calculateNutrition({ ...male80, adjustmentPct: 80 })).toThrow(RangeError);
    expect(() => calculateNutrition({ ...male80, ageYears: 10 })).toThrow(RangeError);
  });
  it('avisos de segurança', () => {
    const low = calculateNutrition({
      sex: 'female', ageYears: 25, heightCm: 165, weightKg: 45,
      activityLevel: 'sedentary', goal: 'cut', adjustmentPct: 25,
    });
    expect(low.caloriesTarget).toBeLessThan(1200);
    expect(low.warnings.map((w) => w.code)).toContain('under_min_calories');
    expect(calculateNutrition({ ...male80, ageYears: 16 }).warnings.map((w) => w.code)).toContain('minor_age');
    expect(calculateNutrition({ ...male80, adjustmentPct: 30 }).warnings.map((w) => w.code)).toContain('aggressive_deficit');
  });
});

describe('Escala de alimentos', () => {
  const chicken = { kcal100g: 165, protein100g: 31, carbs100g: 0, fat100g: 3.6, fiber100g: null };
  it('165 kcal/100 g × 200 g = 330 kcal', () => {
    const n = scaleFood(chicken, { quantity: 200, unit: 'g' });
    expect(n).toEqual({ kcal: 330, proteinG: 62, carbsG: 0, fatG: 7.2, fiberG: null });
  });
  it('fibra opcional e unidades', () => {
    const banana = { kcal100g: 89, protein100g: 1.1, carbs100g: 22.8, fat100g: 0.3, fiber100g: 2.6 };
    const n = scaleFood(banana, { quantity: 1, unit: 'unit', gramsPerUnit: 120 });
    expect(n.kcal).toBe(106.8);
    expect(n.fiberG).toBe(3.1);
    expect(() => scaleFood(banana, { quantity: 1, unit: 'unit' })).toThrow();
    expect(() => scaleFood(banana, { quantity: 0, unit: 'g' })).toThrow();
  });
  it('ml usa densidade (por defeito 1)', () => {
    const milk = { kcal100g: 46, protein100g: 3.4, carbs100g: 4.8, fat100g: 1.6 };
    expect(scaleFood(milk, { quantity: 250, unit: 'ml' }).kcal).toBe(115);
    expect(scaleFood({ ...milk, densityGPerMl: 0.92 }, { quantity: 100, unit: 'ml' }).kcal).toBe(42.3);
  });
  it('total da refeição', () => {
    const total = sumNutrients([
      { kcal: 300, proteinG: 10, carbsG: 50, fatG: 5, fiberG: 2 },
      { kcal: 120, proteinG: 24, carbsG: 3, fatG: 1, fiberG: null },
    ]);
    expect(total).toEqual({ kcal: 420, proteinG: 34, carbsG: 53, fatG: 6, fiberG: 2 });
  });
});

describe('Resumo diário', () => {
  it('consumido / objetivo / restante do enunciado', () => {
    const p = dailyProgress(
      { kcal: 2150, proteinG: 165, carbsG: 230, fatG: 70, fiberG: null },
      { kcal: 2300, proteinG: 180, carbsG: 260, fatG: 75 },
    );
    expect(p.kcal.remaining).toBe(150);
    expect(p.protein.remaining).toBe(15);
    expect(p.carbs.remaining).toBe(30);
    expect(p.fat.remaining).toBe(5);
    expect(p.kcal.barPercent).toBe(93);
  });
  it('excedente limita a barra a 100% mas mostra a percentagem real', () => {
    const p = dailyProgress(
      { kcal: 2600, proteinG: 0, carbsG: 0, fatG: 0, fiberG: null },
      { kcal: 2300, proteinG: 180, carbsG: 260, fatG: 75 },
    );
    expect(p.kcal.over).toBe(true);
    expect(p.kcal.remaining).toBe(-300);
    expect(p.kcal.barPercent).toBe(100);
    expect(p.kcal.percent).toBe(113);
  });
  it('classificação dos dias', () => {
    expect(classifyDay(2300, 2300)).toBe('within');
    expect(classifyDay(2500, 2300)).toBe('within'); // +8,7%
    expect(classifyDay(2600, 2300)).toBe('over');
    expect(classifyDay(1900, 2300)).toBe('under');
    expect(classifyDay(0, 2300)).toBe('no_data');
    expect(classifyDay(2500, 2300, 5)).toBe('over');
  });
  it('estatísticas do período ignoram dias sem registo', () => {
    const t = { kcal: 2300, proteinG: 180, carbsG: 260, fatG: 75 };
    const day = (date: string, kcal: number, proteinG: number) => ({
      date, target: t, totals: { kcal, proteinG, carbsG: 250, fatG: 70, fiberG: null },
    });
    const s = periodStats(
      [day('2026-09-21', 2300, 180), day('2026-09-22', 2700, 150), day('2026-09-23', 1800, 170), day('2026-09-24', 0, 0)],
      { daysInPeriod: 7 },
    );
    expect(s.daysInPeriod).toBe(7);
    expect(s.daysLogged).toBe(3);
    expect(s.avgKcal).toBe(2267);
    expect(s.daysWithin).toBe(1);
    expect(s.daysOver).toBe(1);
    expect(s.daysUnder).toBe(1);
    expect(s.daysProteinOnTarget).toBe(2); // 180 e 170 (≥162); 150 não
  });
});

describe('Peso corporal', () => {
  const series = (n: number, ratePerWeek: number, start = 80): WeightEntry[] =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
      return { date: d, weightKg: start + (ratePerWeek * i) / 7 };
    });

  it('progresso do exemplo: 82 → 79,5, objetivo 75', () => {
    const p = goalProgress({ startKg: 82, currentKg: 79.5, targetKg: 75 });
    expect(p.differenceToGoalKg).toBe(4.5);
    expect(p.evolutionKg).toBe(-2.5);
    expect(p.percent).toBe(35.7);
    expect(p.direction).toBe('lose');
    expect(p.reached).toBe(false);
  });
  it('objetivo de ganho e objetivo atingido', () => {
    const g = goalProgress({ startKg: 70, currentKg: 73, targetKg: 76 });
    expect(g.direction).toBe('gain');
    expect(g.percent).toBe(50);
    expect(goalProgress({ startKg: 82, currentKg: 74.5, targetKg: 75 })).toMatchObject({ reached: true, percent: 100 });
  });
  it('média móvel de 7 dias suaviza oscilações', () => {
    const m = movingAverage([
      { date: '2026-09-01', weightKg: 80 },
      { date: '2026-09-02', weightKg: 81 },
      { date: '2026-09-03', weightKg: 79 },
      { date: '2026-09-10', weightKg: 78 },
    ]);
    expect(m[2].average).toBe(80);
    expect(m[3].average).toBe(78); // fora da janela de 7 dias
  });
  it('médias semanais (semana começa à segunda)', () => {
    const w = weeklyAverages([
      { date: '2026-09-27', weightKg: 80 }, // domingo → semana de 21/09
      { date: '2026-09-28', weightKg: 79 }, // segunda → semana de 28/09
      { date: '2026-09-29', weightKg: 78, bodyFatPct: 15 },
    ]);
    expect(w).toEqual([
      { weekStart: '2026-09-21', entries: 1, avgWeightKg: 80, avgBodyFatPct: null },
      { weekStart: '2026-09-28', entries: 2, avgWeightKg: 78.5, avgBodyFatPct: 15 },
    ]);
  });
  it('tendência semanal por regressão linear', () => {
    expect(weightTrendKgPerWeek(series(28, -0.5))).toBe(-0.5);
    expect(weightTrendKgPerWeek(series(2, -0.5))).toBeNull();
    expect(weightTrendKgPerWeek(series(5, -0.5))).toBeNull(); // menos de 7 dias
  });
  it('compara ritmo real com o objetivo nutricional', () => {
    // TDEE 2500, CUT 15% → 2125: défice de 375 kcal/dia ≈ −0,34 kg/semana
    const base = { goal: 'cut' as const, tdee: 2500, caloriesTarget: 2125 };
    expect(compareWithGoal({ ...base, trendKgPerWeek: -0.35 })).toMatchObject({ expectedKgPerWeek: -0.34, status: 'on_track' });
    expect(compareWithGoal({ ...base, trendKgPerWeek: -0.9 }).status).toBe('faster');
    expect(compareWithGoal({ ...base, trendKgPerWeek: -0.05 }).status).toBe('slower');
    expect(compareWithGoal({ ...base, trendKgPerWeek: 0.4 }).status).toBe('opposite');
    expect(compareWithGoal({ ...base, trendKgPerWeek: null }).status).toBe('insufficient_data');
    expect(compareWithGoal({ goal: 'maintenance', tdee: 2500, caloriesTarget: 2500, trendKgPerWeek: 0.1 }).status).toBe('on_track');
  });
});

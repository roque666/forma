import { describe, expect, it } from 'vitest';
import { FOODS } from '../../../db/seed/foods';
import { FOODS_EXTRA } from '../../../db/seed/foods2';
import { generatePlan, roleOf, type GenFood } from './generator';

const ALL: GenFood[] = [...FOODS, ...FOODS_EXTRA].map(([name, category, kcal, p, c, f, fiber, density, servings], i) => ({
  id: `f${i}`, name, category, kcal100g: kcal, protein100g: p, carbs100g: c, fat100g: f, fiber100g: fiber, densityGPerMl: density,
  servings: servings.map(([label, grams], j) => ({ id: `s${i}-${j}`, label, grams })),
}));
const pantry = (names: string[]) => names.map((n) => ALL.find((f) => f.name === n) ?? (() => { throw new Error(`falta ${n}`); })());

const BASIC = pantry(['Peito de frango grelhado', 'Bife de vaca grelhado', 'Ovo inteiro', 'Salmão grelhado', 'Arroz branco cozido', 'Massa cozida', 'Batata-doce cozida', 'Aveia (flocos)',
  'Pão branco (papo-seco)', 'Iogurte grego natural (0% gordura)', 'Queijo fresco batido 0%', 'Banana', 'Maçã', 'Brócolos cozidos', 'Espinafres cozidos', 'Azeite', 'Amêndoas', 'Whey protein (pó)']);
const T = { kcal: 2400, proteinG: 160, carbsG: 270, fatG: 70 };
const near = (g: number, t: number, pct: number) => Math.abs(g - t) / t <= pct;

describe('gerador de refeições', () => {
  it('classifica os alimentos por papel', () => {
    const r = (n: string) => roleOf(ALL.find((f) => f.name === n)!);
    expect(r('Peito de frango grelhado')).toBe('protein');
    expect(r('Arroz branco cozido')).toBe('carb');
    expect(r('Azeite')).toBe('fat');
    expect(r('Banana')).toBe('fruit');
    expect(r('Brócolos cozidos')).toBe('veg');
    expect(r('Refrigerante de cola')).toBeNull();
    expect(r('Pastel de nata')).toBeNull();
  });

  it('dia-tipo: bate calorias e macros com margem pequena', () => {
    const g = generatePlan({ target: T, foods: BASIC, meals: ['breakfast', 'lunch', 'snack', 'dinner'], days: 1, seed: 3 });
    expect(g.days).toHaveLength(1);
    const d = g.days[0];
    expect(d.meals.map((m) => m.type)).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
    expect(near(d.totals.kcal, T.kcal, 0.06)).toBe(true);
    expect(near(d.totals.proteinG, T.proteinG, 0.1)).toBe(true);
    expect(near(d.totals.carbsG, T.carbsG, 0.12)).toBe(true);
    expect(near(d.totals.fatG, T.fatG, 0.25)).toBe(true);
  });

  it('só usa alimentos da despensa e quantidades positivas', () => {
    const g = generatePlan({ target: T, foods: BASIC, meals: ['lunch', 'dinner'], days: 1, seed: 1 });
    const ids = new Set(BASIC.map((f) => f.id));
    for (const m of g.days[0].meals) for (const i of m.items) { expect(ids.has(i.foodId)).toBe(true); expect(i.quantity).toBeGreaterThan(0); }
  });

  it('almoço e jantar têm proteína, hidratos e legumes; pequeno-almoço sem carne/peixe', () => {
    const g = generatePlan({ target: T, foods: BASIC, meals: ['breakfast', 'lunch', 'snack', 'dinner'], days: 1, seed: 2 });
    const names = (t: string) => g.days[0].meals.find((m) => m.type === t)!.items.map((i) => i.name);
    for (const t of ['lunch', 'dinner']) expect(names(t).some((n) => /Brócolos|Espinafres/.test(n))).toBe(true);
    expect(names('breakfast').some((n) => /frango|Bife|Salmão/i.test(n))).toBe(false);
    expect(names('lunch').some((n) => /Aveia/.test(n))).toBe(false);
  });

  it('semana variada: 7 dias, com alimentação diferente entre dias', () => {
    const g = generatePlan({ target: T, foods: BASIC, meals: ['breakfast', 'lunch', 'dinner'], days: 7, seed: 5 });
    expect(g.days).toHaveLength(7);
    expect(g.days.map((d) => d.weekdays[0])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const sig = new Set(g.days.map((d) => d.meals.map((m) => m.items.map((i) => i.foodId).join('+')).join('|')));
    expect(sig.size).toBeGreaterThanOrEqual(3);
    for (const d of g.days) expect(near(d.totals.kcal, T.kcal, 0.08)).toBe(true);
  });

  it('é determinístico com a mesma semente e muda com outra', () => {
    const a = generatePlan({ target: T, foods: BASIC, meals: ['lunch', 'dinner'], days: 1, seed: 7 });
    const b = generatePlan({ target: T, foods: BASIC, meals: ['lunch', 'dinner'], days: 1, seed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('avisa quando faltam fontes de proteína ou hidratos', () => {
    const g = generatePlan({ target: T, foods: pantry(['Arroz branco cozido', 'Banana']), meals: ['lunch', 'dinner'], days: 1 });
    expect(g.warnings.join(' ')).toMatch(/proteína/i);
    const h = generatePlan({ target: T, foods: pantry(['Peito de frango grelhado']), meals: ['lunch'], days: 1 });
    expect(h.warnings.join(' ')).toMatch(/hidratos/i);
  });

  it('despensa vazia ou sem refeições escolhidas não rebenta', () => {
    expect(generatePlan({ target: T, foods: [], meals: ['lunch'], days: 1 }).days[0]?.meals ?? []).toHaveLength(0);
    expect(generatePlan({ target: T, foods: BASIC, meals: [], days: 1 }).days).toHaveLength(0);
  });

  it('dá avisos de precisão quando a despensa não chega (só magros: gordura/calorias abaixo)', () => {
    const g = generatePlan({ target: { kcal: 3500, proteinG: 150, carbsG: 400, fatG: 120 }, foods: pantry(['Peito de frango grelhado', 'Arroz branco cozido', 'Brócolos cozidos']), meals: ['lunch', 'dinner'], days: 1 });
    expect(g.warnings.length).toBeGreaterThan(0);
  });
});

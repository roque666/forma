/**
 * Gerador de refeições a partir dos alimentos disponíveis (despensa) para bater as macros diárias.
 * Funções puras e determinísticas (com semente) — sem IA: escolhe combinações de alimentos por refeição e resolve as
 * quantidades por mínimos quadrados com limites (proteína, hidratos e gordura em relação ao alvo).
 */
import { scaleFood, type Targets } from './diary';

export type MealKind = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export const MEAL_KINDS: MealKind[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export interface GenFood {
  id: string; name: string; category: string | null;
  kcal100g: number; protein100g: number; carbs100g: number; fat100g: number; fiber100g: number | null;
  densityGPerMl: number | null; servings: { id: string; label: string; grams: number }[];
}
export interface GenItem { foodId: string; name: string; quantity: number; unit: 'g' | 'ml' | 'unit'; gramsPerUnit: number | null; grams: number; kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null }
export interface GenMeal { type: MealKind; items: GenItem[]; totals: Targets }
export interface GenDay { name: string; weekdays: number[]; meals: GenMeal[]; totals: Targets }
export interface GenResult { days: GenDay[]; warnings: string[]; target: Targets }
export interface GenInput { target: Targets; foods: GenFood[]; meals: MealKind[]; days: 1 | 7; seed?: number }

type Role = 'protein' | 'carb' | 'fat' | 'fruit' | 'veg';

const SHARE: Record<MealKind, number> = { breakfast: 0.25, lunch: 0.35, snack: 0.12, dinner: 0.28 };
export const MEAL_KIND_LABEL: Record<MealKind, string> = { breakfast: 'Pequeno-almoço', lunch: 'Almoço', snack: 'Lanche', dinner: 'Jantar' };

const BREAKFAST_CARB = /aveia|p[aã]o|torrada|tosta|cereais|granola|muesli|bolacha|wrap|broa|flocos|papas|cornflakes/i;
const MEAT_FISH = /frango|vaca|porco|peru|salm[aã]o|atum|bacalhau|pescada|sardinha|cavala|dourada|robalo|linguado|camar|gamba|polvo|lula|mexilh|ameijoa|bife|costeleta|hamb[uú]rguer|entrecosto|alm[oô]ndega|carne|peixe|espada|surimi|delícias/i;
const PROCESSED = /chouri[cç]o|bacon|salsicha|morcela|lingui[cç]a|presunto|fiambre|panado/i;
const BULK_CARB_DINNER = /aveia|cereais|granola|muesli|bolacha|cornflakes|tosta|torrada|wrap|papas/i;

const isMeatFishEgg = (cat: string) => /^(Carne|Peixe|Ovos)/.test(cat);
const kcalOf = (f: GenFood) => (f.kcal100g > 0 ? f.kcal100g : 4 * f.protein100g + 4 * f.carbs100g + 9 * f.fat100g);

/** Papel nutricional de um alimento (ou null se não serve para o gerador: doces, bebidas, pratos feitos…). */
export function roleOf(f: GenFood): Role | null {
  const cat = f.category ?? '';
  const k = kcalOf(f);
  if (k < 15) return null;
  if (/^(Bebidas|Doces e snacks|Pratos tradicionais)$/.test(cat)) return null;
  if (/Hortícolas/.test(cat)) return k <= 80 ? 'veg' : 'carb';
  if (cat === 'Fruta') return 'fruit';
  const pS = (4 * f.protein100g) / k, cS = (4 * f.carbs100g) / k, fS = (9 * f.fat100g) / k;
  if (fS >= 0.6) return 'fat';
  if (f.protein100g >= 8 && pS >= 0.3) return 'protein';
  if (cS >= 0.55) return 'carb';
  if (f.protein100g >= 8 && pS >= 0.22) return 'protein';
  return null;
}

/** O alimento faz sentido nesta refeição? */
function fits(f: GenFood, role: Role, kind: MealKind): boolean {
  const cat = f.category ?? '';
  const name = f.name;
  const own = f.category == null; // alimentos criados pelo utilizador: sem restrições
  if (own) return kind === 'breakfast' || kind === 'snack' ? role !== 'veg' : true;
  const main = kind === 'lunch' || kind === 'dinner';
  switch (role) {
    case 'veg': return main;
    case 'fruit': return true;
    case 'fat': return /azeite|[óo]leo|manteiga|margarina|maionese/i.test(name) ? main : true;
    case 'protein': {
      const meatFish = isMeatFishEgg(cat) && MEAT_FISH.test(name) && !/fiambre|fumado|presunto/i.test(name);
      if (main) return isMeatFishEgg(cat) || cat === 'Leguminosas' || /tofu|seitan|tempeh|cottage/i.test(name);
      if (kind === 'breakfast') return !meatFish && !/(chouri|bacon|salsicha|morcela|lingui)/i.test(name);
      return !meatFish && !PROCESSED.test(name); // lanche
    }
    case 'carb': {
      if (cat === 'Leguminosas' || cat === 'Tubérculos') return main;
      if (kind === 'breakfast') return BREAKFAST_CARB.test(name);
      if (kind === 'snack') return BREAKFAST_CARB.test(name) && !/pão com|massa/i.test(name);
      return !BULK_CARB_DINNER.test(name);
    }
  }
}

// ---------------------------------------------------------------- números
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r1 = (n: number) => Math.round(n * 10) / 10;
const sumT = (a: Targets, b: Targets): Targets => ({ kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, carbsG: a.carbsG + b.carbsG, fatG: a.fatG + b.fatG });
const ZERO: Targets = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

interface Slot { food: GenFood; role: Role; lo: number; hi: number; fixed?: number }
const perG = (f: GenFood) => ({ kcal: f.kcal100g / 100, p: f.protein100g / 100, c: f.carbs100g / 100, f: f.fat100g / 100 });

/** Limites (em g) de cada papel, a partir de limites calóricos para não gerar porções absurdas. */
function bounds(f: GenFood, role: Role): { lo: number; hi: number } {
  const kg = Math.max(0.05, kcalOf(f) / 100); // kcal por g
  const clampG = (kcal: number, maxG: number, minG = 0) => Math.max(minG, Math.min(maxG, kcal / kg));
  switch (role) {
    case 'protein': return { lo: Math.min(60, clampG(90, 400)), hi: clampG(650, f.protein100g > 60 ? 70 : /Lacticínios/.test(f.category ?? '') ? 250 : 350, 40) };
    case 'carb': return { lo: Math.min(40, clampG(80, 400)), hi: clampG(750, 380, 40) };
    case 'fat': return { lo: 0, hi: clampG(300, 60, 0) };
    case 'fruit': return { lo: clampG(40, 200), hi: clampG(200, 300, 60) };
    case 'veg': return { lo: 100, hi: 250 };
  }
}

/** Mínimos quadrados (relativos ao alvo) com limites, por descida por coordenadas. */
function solve(slots: Slot[], target: Targets, fixedSum: Targets): number[] {
  const vars = slots.map((s, i) => ({ s, i })).filter((v) => v.s.fixed == null);
  const x = slots.map((s) => s.fixed ?? Math.max(s.lo, Math.min(s.hi, (s.lo + s.hi) / 3)));
  const a = slots.map((s) => perG(s.food));
  const W = { kcal: 1.5, p: 3, c: 1.5, f: 1.2 };
  const sc = { kcal: Math.max(target.kcal, 50), p: Math.max(target.proteinG, 8), c: Math.max(target.carbsG, 10), f: Math.max(target.fatG, 5) };
  const got = () => {
    let k = fixedSum.kcal, p = fixedSum.proteinG, c = fixedSum.carbsG, f = fixedSum.fatG;
    slots.forEach((s, i) => { if (s.fixed != null) return; k += a[i].kcal * x[i]; p += a[i].p * x[i]; c += a[i].c * x[i]; f += a[i].f * x[i]; });
    return { k, p, c, f };
  };
  for (let sweep = 0; sweep < 250; sweep++) {
    for (const v of vars) {
      const g = got();
      const r = { k: g.k - target.kcal, p: g.p - target.proteinG, c: g.c - target.carbsG, f: g.f - target.fatG };
      const ai = a[v.i];
      const num = W.kcal * ai.kcal * r.k / sc.kcal ** 2 + W.p * ai.p * r.p / sc.p ** 2 + W.c * ai.c * r.c / sc.c ** 2 + W.f * ai.f * r.f / sc.f ** 2;
      const den = W.kcal * ai.kcal ** 2 / sc.kcal ** 2 + W.p * ai.p ** 2 / sc.p ** 2 + W.c * ai.c ** 2 / sc.c ** 2 + W.f * ai.f ** 2 / sc.f ** 2;
      if (den === 0) continue;
      x[v.i] = Math.max(v.s.lo, Math.min(v.s.hi, x[v.i] - num / den));
    }
  }
  return x;
}

const errOf = (t: Targets, target: Targets) => {
  const e = (g: number, tg: number, s: number) => ((g - tg) / Math.max(tg, s)) ** 2;
  return Math.sqrt((1.5 * e(t.kcal, target.kcal, 50) + 3 * e(t.proteinG, target.proteinG, 8) + 1.5 * e(t.carbsG, target.carbsG, 10) + 1.2 * e(t.fatG, target.fatG, 5)) / 7.2);
};

/** Arredonda a quantidade (unidades inteiras para ovos, fatias…; 5 g / 10 ml nos restantes) e calcula os nutrientes. */
function toItem(f: GenFood, grams: number): GenItem {
  const s = f.servings[0];
  let unit: 'g' | 'ml' | 'unit'; let quantity: number; let gpu: number | null = null;
  if (s && s.grams <= 80 && grams >= s.grams * 0.6 && (s.grams >= 30 || grams / s.grams <= 4)) { unit = 'unit'; gpu = s.grams; quantity = Math.max(1, Math.round(grams / s.grams)); }
  else if (f.densityGPerMl) { unit = 'ml'; quantity = Math.max(10, Math.round(grams / f.densityGPerMl / 10) * 10); }
  else { unit = 'g'; quantity = Math.max(5, Math.round(grams / 5) * 5); }
  const n = scaleFood(f, { quantity, unit, gramsPerUnit: gpu });
  const g = unit === 'g' ? quantity : unit === 'ml' ? quantity * (f.densityGPerMl ?? 1) : quantity * (gpu ?? 0);
  return { foodId: f.id, name: f.name, quantity, unit, gramsPerUnit: gpu, grams: g, kcal: n.kcal, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG, fiberG: n.fiberG };
}

interface Pools { protein: GenFood[]; carb: GenFood[]; fat: GenFood[]; fruit: GenFood[]; veg: GenFood[] }

function buildMeal(kind: MealKind, pools: Pools, target: Targets, used: Map<string, number>, today: Set<string>, rnd: () => number): GenMeal | null {
  const pick = (role: Role) => pools[role].filter((f) => fits(f, role, kind));
  const main = kind === 'lunch' || kind === 'dinner';
  const proteins = pick('protein'), carbs = pick('carb'), fats = pick('fat'), fruits = pick('fruit'), vegs = pick('veg');
  // fruta como "hidrato" no lanche; hidratos de pequeno-almoço podem ser fruta se não houver cereais/pão
  const carbOptions: GenFood[] = kind === 'snack' ? [...fruits, ...carbs] : carbs.length ? carbs : fruits;
  if (proteins.length === 0 && carbOptions.length === 0 && fats.length === 0) return null;

  const penalty = (f: GenFood) => (used.get(f.id) ?? 0) * 0.04 + (today.has(f.id) ? 0.18 : 0) + rnd() * 0.04;
  const rank = (arr: GenFood[], n: number) => [...arr].map((f) => ({ f, s: penalty(f) })).sort((x, y) => x.s - y.s).slice(0, n).map((x) => x.f);
  const P = proteins.length ? rank(proteins, 5) : [null];
  const C = carbOptions.length ? rank(carbOptions, 5) : [null];
  const F = [null, ...rank(fats, 2)] as (GenFood | null)[];
  const veg = main && vegs.length ? rank(vegs, 1)[0] : null;
  const fruitSide = kind === 'breakfast' && fruits.length ? rank(fruits.filter((x) => !(C as (GenFood | null)[]).includes(x)), 1)[0] ?? null : null;

  let best: { items: GenItem[]; err: number } | null = null;
  for (const p of P) for (const c of C) for (const fat of F) {
    if (p && c && p.id === c.id) continue;
    const slots: Slot[] = [];
    let fixedSum = ZERO;
    const addFixed = (f: GenFood, role: Role, g: number) => { slots.push({ food: f, role, lo: g, hi: g, fixed: g }); const n = scaleFood(f, { quantity: g, unit: 'g' }); fixedSum = sumT(fixedSum, { kcal: n.kcal, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG }); };
    if (veg) addFixed(veg, 'veg', 150);
    if (fruitSide && kind === 'breakfast') addFixed(fruitSide, 'fruit', 120);
    if (p) slots.push({ food: p, role: 'protein', ...bounds(p, 'protein') });
    if (c) slots.push({ food: c, role: (c.category === 'Fruta' ? 'fruit' : 'carb'), ...bounds(c, c.category === 'Fruta' ? 'fruit' : 'carb') });
    if (fat) slots.push({ food: fat, role: 'fat', ...bounds(fat, 'fat') });
    const x = solve(slots, target, fixedSum);
    const items: GenItem[] = [];
    slots.forEach((s, i) => { if (s.fixed != null) { items.push(toItem(s.food, s.fixed)); return; } if (x[i] >= Math.max(5, s.lo * 0.5) || s.role !== 'fat') items.push(toItem(s.food, x[i])); });
    const totals = items.reduce<Targets>((t, i) => sumT(t, { kcal: i.kcal, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG }), ZERO);
    const div = (p ? penalty(p) : 0) + (c ? penalty(c) : 0) + (fat ? 0.01 : 0);
    const err = errOf(totals, target) + div;
    if (!best || err < best.err) best = { items, err };
  }
  if (!best || best.items.length === 0) return null;
  const items = best.items.sort((a, b) => ROLE_ORDER(a, pools) - ROLE_ORDER(b, pools));
  const totals = items.reduce<Targets>((t, i) => sumT(t, { kcal: i.kcal, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG }), ZERO);
  return { type: kind, items, totals: { kcal: r1(totals.kcal), proteinG: r1(totals.proteinG), carbsG: r1(totals.carbsG), fatG: r1(totals.fatG) } };
}
const ROLE_ORDER = (i: GenItem, pools: Pools) => (pools.protein.some((f) => f.id === i.foodId) ? 0 : pools.carb.some((f) => f.id === i.foodId) ? 1 : pools.veg.some((f) => f.id === i.foodId) ? 2 : pools.fruit.some((f) => f.id === i.foodId) ? 3 : 4);

const WEEK_NAMES = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];

export function generatePlan(input: GenInput): GenResult {
  const { target } = input;
  const warnings: string[] = [];
  const pools: Pools = { protein: [], carb: [], fat: [], fruit: [], veg: [] };
  for (const f of input.foods) { const r = roleOf(f); if (r) pools[r].push(f); }
  if (pools.protein.length === 0) warnings.push('Não tens nenhuma boa fonte de proteína na despensa (carne, peixe, ovos, lacticínios, tofu…). Adiciona algumas para bater a proteína.');
  if (pools.carb.length === 0 && pools.fruit.length === 0) warnings.push('Não tens fontes de hidratos na despensa (arroz, massa, batata, pão, aveia, fruta…).');
  const kinds = MEAL_KINDS.filter((k) => input.meals.includes(k));
  if (kinds.length === 0) return { days: [], warnings: ['Escolhe pelo menos uma refeição.'], target };
  const rnd = mulberry32((input.seed ?? 1) * 2654435761);
  const used = new Map<string, number>();
  const days: GenDay[] = [];
  for (let d = 0; d < input.days; d++) {
    const today = new Set<string>();
    const meals: GenMeal[] = [];
    let remaining = { ...target };
    let shareLeft = kinds.reduce((s, k) => s + SHARE[k], 0);
    for (const k of kinds) {
      const frac = SHARE[k] / shareLeft;
      const mt: Targets = { kcal: Math.max(0, remaining.kcal * frac), proteinG: Math.max(0, remaining.proteinG * frac), carbsG: Math.max(0, remaining.carbsG * frac), fatG: Math.max(0, remaining.fatG * frac) };
      const meal = buildMeal(k, pools, mt, used, today, rnd);
      shareLeft -= SHARE[k];
      if (!meal) { warnings.push(`Com os alimentos da despensa não foi possível montar o ${MEAL_KIND_LABEL[k].toLowerCase()}.`); continue; }
      for (const i of meal.items) { today.add(i.foodId); used.set(i.foodId, (used.get(i.foodId) ?? 0) + 1); }
      remaining = { kcal: remaining.kcal - meal.totals.kcal, proteinG: remaining.proteinG - meal.totals.proteinG, carbsG: remaining.carbsG - meal.totals.carbsG, fatG: remaining.fatG - meal.totals.fatG };
      meals.push(meal);
    }
    const totals = meals.reduce<Targets>((t, m) => sumT(t, m.totals), ZERO);
    days.push({ name: input.days === 1 ? 'Dia-tipo' : WEEK_NAMES[d], weekdays: input.days === 1 ? [1, 2, 3, 4, 5, 6, 7] : [d + 1], meals, totals: { kcal: r1(totals.kcal), proteinG: r1(totals.proteinG), carbsG: r1(totals.carbsG), fatG: r1(totals.fatG) } });
  }
  // avisos sobre a precisão
  const t0 = days[0]?.totals;
  if (t0) {
    const off = (g: number, t: number) => (t > 0 ? Math.abs(g - t) / t : 0);
    if (off(t0.proteinG, target.proteinG) > 0.1) warnings.push(`Com estes alimentos a proteína fica em ${Math.round(t0.proteinG)} g (alvo ${Math.round(target.proteinG)} g). Adiciona fontes de proteína à despensa.`);
    if (off(t0.kcal, target.kcal) > 0.08) warnings.push(`As calorias ficam em ${Math.round(t0.kcal)} kcal (alvo ${Math.round(target.kcal)}). ${t0.kcal < target.kcal ? 'Faltam alimentos calóricos (hidratos ou gorduras: arroz, massa, azeite, frutos secos).' : 'Os alimentos disponíveis ultrapassam o alvo; considera menos refeições ou alimentos menos calóricos.'}`);
    else if (off(t0.fatG, target.fatG) > 0.25 && target.fatG > 0) warnings.push(`A gordura fica em ${Math.round(t0.fatG)} g (alvo ${Math.round(target.fatG)} g). Adiciona gorduras (azeite, frutos secos, abacate) ou alimentos mais magros, conforme o caso.`);
  }
  return { days, warnings, target };
}

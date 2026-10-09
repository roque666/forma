import { beforeAll, describe, expect, it } from 'vitest';
import * as n from '@/lib/services/nutrition';
import * as mp from '@/lib/services/mealplans';
import { itemsOn } from '@/lib/training/calendar';
import { as, link, makeUser, admin, type TestUser } from './helpers';

const skip = process.env.SKIP_DB_TESTS === '1';
const d = skip ? describe.skip : describe;

d('despensa e planos de alimentação', () => {
  let a: TestUser, b: TestUser, coach: TestUser, rice: string, chicken: string, planId: string;

  beforeAll(async () => {
    a = await makeUser('student', 'plano-a');
    b = await makeUser('student', 'plano-b');
    coach = await makeUser('coach', 'plano-coach');
    await link(coach, a);
    const ids = await admin((db) => db.query<{ id: string }>(`insert into public.foods (name, kcal_100g, protein_100g, carbs_100g, fat_100g, source) values ('Arroz teste plano', 130, 2.7, 28, 0.3, 'system'), ('Frango teste plano', 165, 31, 0, 3.6, 'system') returning id`));
    [rice, chicken] = ids.map((x) => x.id);
  });

  it('despensa: cada atleta só vê e altera a sua', async () => {
    await as(a, (db) => n.setPantry(db, a.id, [rice, chicken], true));
    expect((await as(a, (db) => n.listPantryFoods(db, a.id))).length).toBe(2);
    expect((await as(b, (db) => n.listPantryFoods(db, b.id))).length).toBe(0);
    await expect(as(b, (db) => n.setPantry(db, a.id, [rice], false))).resolves.not.toThrow();
    expect((await as(a, (db) => n.listPantryFoods(db, a.id))).length).toBe(2); // b não removeu nada
    await expect(as(b, (db) => n.setPantry(db, a.id, [rice], true))).rejects.toBeTruthy();
  });

  it('guarda o plano e recalcula os macros no servidor', async () => {
    planId = await as(a, (db) => mp.savePlan(db, {
      name: 'Plano teste', target: { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 },
      days: [{ name: 'Dia-tipo', weekdays: [1, 2, 3, 4, 5, 6, 7], meals: [{ mealType: 'lunch', items: [{ foodId: rice, quantity: 200, unit: 'g' }, { foodId: chicken, quantity: 150, unit: 'g' }] }] }],
    }));
    const p = await as(a, (db) => mp.getPlan(db, planId));
    expect(p?.days[0].kcal).toBeCloseTo(260 + 247.5, 0);
    expect(p?.days[0].proteinG).toBeCloseTo(5.4 + 46.5, 0);
  });

  it('isolamento: outro atleta não vê nem altera; o treinador do atleta vê', async () => {
    expect(await as(b, (db) => mp.getPlan(db, planId))).toBeNull();
    expect((await as(b, (db) => mp.listPlans(db, b.id))).length).toBe(0);
    await expect(as(b, (db) => mp.deletePlan(db, planId))).rejects.toBeTruthy();
    await expect(as(b, (db) => mp.renamePlan(db, planId, 'x'))).rejects.toBeTruthy();
    expect(await as(coach, (db) => mp.getPlan(db, planId))).not.toBeNull();
    await expect(as(coach, (db) => mp.renamePlan(db, planId, 'x'))).rejects.toBeTruthy();
  });

  it('calendário: só aparece depois de agendado', async () => {
    expect(itemsOn(mp.toCalPlans((await as(a, (db) => mp.listPlans(db, a.id)))), '2026-10-07')).toHaveLength(0);
    await as(a, (db) => mp.setSchedule(db, planId, { pattern: 'w1', anchor: '2026-10-05' }));
    const plans = await as(a, (db) => mp.listPlans(db, a.id));
    expect(itemsOn(mp.toCalPlans(plans), '2026-10-07')).toHaveLength(1);
    await as(a, (db) => mp.setActive(db, planId, false, '2026-10-05'));
    expect(itemsOn(mp.toCalPlans(await as(a, (db) => mp.listPlans(db, a.id))), '2026-10-07')).toHaveLength(0);
  });

  it('aplicar ao diário não duplica e pode ser desfeito', async () => {
    const dayId = (await as(a, (db) => mp.getPlan(db, planId)))!.days[0].id;
    expect(await as(a, (db) => mp.applyDay(db, a.id, dayId, '2026-10-07'))).toBe(2);
    await expect(as(a, (db) => mp.applyDay(db, a.id, dayId, '2026-10-07'))).rejects.toBeTruthy();
    expect((await as(a, (db) => mp.appliedDays(db, a.id, '2026-10-01', '2026-10-31'))).has(`${dayId}|2026-10-07`)).toBe(true);
    const tot = await as(a, (db) => n.getDailyTotals(db, a.id, '2026-10-07', '2026-10-07'));
    expect(tot[0].kcal).toBeCloseTo(507.5, 0);
    await expect(as(b, (db) => mp.applyDay(db, b.id, dayId, '2026-10-08'))).rejects.toBeTruthy();
    await as(a, (db) => mp.unapplyDay(db, a.id, dayId, '2026-10-07'));
    expect((await as(a, (db) => mp.appliedDays(db, a.id, '2026-10-01', '2026-10-31'))).size).toBe(0);
  });

  it('editar quantidade recalcula; apagar o plano mantém o diário', async () => {
    const p = (await as(a, (db) => mp.getPlan(db, planId)))!;
    const item = p.days[0].meals[0].items.find((i) => i.name.startsWith('Arroz'))!;
    await as(a, (db) => mp.updateItemQuantity(db, item.id, 100));
    expect((await as(a, (db) => mp.getPlan(db, planId)))!.days[0].kcal).toBeCloseTo(130 + 247.5, 0);
    await as(a, (db) => mp.applyDay(db, a.id, p.days[0].id, '2026-10-09'));
    await as(a, (db) => mp.deletePlan(db, planId));
    expect(await as(a, (db) => mp.getPlan(db, planId))).toBeNull();
    expect((await as(a, (db) => n.getDailyTotals(db, a.id, '2026-10-09', '2026-10-09')))[0].kcal).toBeGreaterThan(300);
  });
});

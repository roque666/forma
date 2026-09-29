/** Dados de sistema (idempotente): biblioteca de exercícios e base de alimentos. */
import pg from 'pg';
import { EXERCISES } from '../db/seed/exercises';
import { FOODS } from '../db/seed/foods';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definido');

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('begin');
    let ex = 0;
    for (const [name, primary, secondary, equipment, tracking, instructions] of EXERCISES) {
      const r = await client.query(
        `insert into public.exercises (name, primary_muscle, secondary_muscles, equipment, tracking_type, instructions, source)
         select $1::text, $2::public.muscle_group, $3::public.muscle_group[], $4, $5::public.exercise_tracking, $6, 'system'
         where not exists (select 1 from public.exercises where source = 'system' and lower(name) = lower($1))`,
        [name, primary, secondary, equipment, tracking, instructions],
      );
      ex += r.rowCount ?? 0;
    }
    let fd = 0;
    for (const [name, category, kcal, protein, carbs, fat, fiber, density, servings] of FOODS) {
      const r = await client.query(
        `insert into public.foods (name, category, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, density_g_per_ml, source)
         select $1::text, $2, $3, $4, $5, $6, $7, $8, 'system'
         where not exists (select 1 from public.foods where source = 'system' and lower(name) = lower($1))
         returning id`,
        [name, category, kcal, protein, carbs, fat, fiber, density],
      );
      if (r.rows[0]) {
        fd++;
        for (const [label, grams] of servings) {
          await client.query('insert into public.food_servings (food_id, label, grams) values ($1, $2, $3)', [r.rows[0].id, label, grams]);
        }
      }
    }
    await client.query('commit');
    console.log(`seed de sistema: ${ex} exercícios e ${fd} alimentos novos`);
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

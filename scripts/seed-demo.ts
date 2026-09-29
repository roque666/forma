/**
 * Dados de demonstração (SÓ desenvolvimento/teste). Cria um coach e alunos com histórico realista.
 * Recusa correr em produção. Idempotente: apaga e recria os utilizadores @demo.pt.
 *
 *   coach@demo.pt · ana@demo.pt · rui@demo.pt · sofia@demo.pt · tiago@demo.pt  — palavra-passe: Demo12345678
 */
import pg from 'pg';
import { hashPassword } from '../src/lib/auth/password';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== '1') {
  console.error('Recusado: o seed demo não corre em produção.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definido');

export const DEMO_PASSWORD = 'Demo12345678';
const DAY = 86_400_000;
const daysAgo = (n: number, hour = 18) => { const d = new Date(Date.now() - n * DAY); d.setUTCHours(hour, 0, 0, 0); return d; };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const q = async <T = any>(sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows as T[];
  try {
    await c.query('begin');
    await q(`delete from public.workout_plans where is_template and created_by in (select id from auth.users where email like '%@demo.pt')`);
    await q(`delete from auth.users where email like '%@demo.pt'`);
    const hash = await hashPassword(DEMO_PASSWORD);
    const mk = async (email: string, name: string, role: 'coach' | 'student') => {
      const [u] = await q<{ id: string }>(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1,$2,jsonb_build_object('full_name',$3::text)) returning id`, [email, hash, name]);
      if (role === 'coach') await q(`update public.profiles set role = 'coach' where id = $1`, [u.id]);
      return u.id;
    };
    const coach = await mk('coach@demo.pt', 'Carlos Coach', 'coach');
    const ana = await mk('ana@demo.pt', 'Ana Ribeiro', 'student');
    const rui = await mk('rui@demo.pt', 'Rui Matos', 'student');
    const sofia = await mk('sofia@demo.pt', 'Sofia Lopes', 'student');
    const tiago = await mk('tiago@demo.pt', 'Tiago Nunes', 'student');
    for (const [s, ago] of [[ana, 45], [rui, 40], [sofia, 25]] as const)
      await q(`insert into public.coach_students (coach_id, student_id, status, origin, invite_email, consent_at, created_at) values ($1,$2,'active','invite',(select email from auth.users where id=$2), now() - ($3 || ' days')::interval, now() - ($3 || ' days')::interval)`, [coach, s, ago]);
    await q(`insert into public.coach_students (coach_id, student_id, status, origin, invite_email) values ($1, $2, 'pending', 'invite', 'tiago@demo.pt')`, [coach, tiago]);

    const ex = async (name: string) => (await q<{ id: string; name: string }>(`select id, name from public.exercises where source='system' and name = $1`, [name]))[0];

    // ---------- planos
    type Def = { day: string; weekdays: number[]; items: [string, number, number, number, number][] }; // nome, séries, reps min, reps max, peso base
    const upper: Def = { day: 'Upper A', weekdays: [1, 4], items: [['Supino reto com barra', 4, 6, 8, 60], ['Remada curvada com barra', 4, 8, 10, 55], ['Press militar com barra', 3, 8, 10, 35], ['Curl com barra', 3, 10, 12, 25]] };
    const lower: Def = { day: 'Lower A', weekdays: [2, 5], items: [['Agachamento livre com barra', 4, 6, 8, 80], ['Stiff (levantamento terra romeno)', 3, 8, 10, 70], ['Leg press 45°', 3, 10, 12, 140], ['Elevação de gémeos em pé', 4, 12, 15, 50]] };
    const fullA: Def = { day: 'Full body A', weekdays: [], items: [['Agachamento livre com barra', 3, 8, 10, 60], ['Supino inclinado com halteres', 3, 8, 10, 22], ['Puxada na polia alta', 3, 10, 12, 50]] };
    const fullB: Def = { day: 'Full body B', weekdays: [], items: [['Levantamento terra', 3, 5, 6, 90], ['Press de ombros com halteres', 3, 8, 10, 18], ['Remada sentado no cabo', 3, 10, 12, 45]] };

    const buildPlan = async (studentId: string, name: string, defs: Def[], createdBy: string) => {
      const [p] = await q<{ id: string }>(`insert into public.workout_plans (student_id, created_by, name, is_active) values ($1,$2,$3,true) returning id`, [studentId, createdBy, name]);
      const days: { id: string; def: Def; exs: { peId: string; exId: string; name: string; def: Def['items'][number] }[] }[] = [];
      let pos = 0;
      for (const def of defs) {
        const [d] = await q<{ id: string }>(`insert into public.workout_days (plan_id, name, position, weekdays) values ($1,$2,$3,$4::smallint[]) returning id`, [p.id, def.day, pos++, def.weekdays]);
        const exs: (typeof days)[number]['exs'] = [];
        let ep = 0;
        for (const it of def.items) {
          const e = await ex(it[0]);
          const [pe] = await q<{ id: string }>(`insert into public.plan_exercises (plan_id, day_id, exercise_id, position, rest_seconds) values ($1,$2,$3,$4,$5) returning id`, [p.id, d.id, e.id, ep++, 90]);
          for (let s = 1; s <= it[1]; s++) await q(`insert into public.plan_sets (plan_id, plan_exercise_id, set_number, target_reps_min, target_reps_max, target_weight_kg) values ($1,$2,$3,$4,$5,$6)`, [p.id, pe.id, s, it[2], it[3], it[4]]);
          exs.push({ peId: pe.id, exId: e.id, name: e.name, def: it });
        }
        days.push({ id: d.id, def, exs });
      }
      return { id: p.id, name, days };
    };

    // template do coach
    const [tpl] = await q<{ id: string }>(`insert into public.workout_plans (student_id, created_by, name, description, is_template) values (null,$1,'Full body iniciante','Modelo de 2 dias para começar',true) returning id`, [coach]);
    const [td] = await q<{ id: string }>(`insert into public.workout_days (plan_id, name, position) values ($1,'Dia A',0) returning id`, [tpl.id]);
    const sq = await ex('Agachamento livre com barra');
    const [tpe] = await q<{ id: string }>(`insert into public.plan_exercises (plan_id, day_id, exercise_id, position) values ($1,$2,$3,0) returning id`, [tpl.id, td.id, sq.id]);
    for (let s = 1; s <= 3; s++) await q(`insert into public.plan_sets (plan_id, plan_exercise_id, set_number, target_reps_min, target_reps_max) values ($1,$2,$3,8,10)`, [tpl.id, tpe.id, s]);

    const anaPlan = await buildPlan(ana, 'Upper / Lower (coach)', [upper, lower], coach);
    const ruiPlan = await buildPlan(rui, 'Full body 3x', [fullA, fullB], coach);
    await buildPlan(sofia, 'Full body iniciante', [fullA], coach);

    // ---------- sessões históricas (cronológicas, para os PRs se formarem naturalmente)
    type Plan = Awaited<ReturnType<typeof buildPlan>>;
    let sessions = 0;
    const doSession = async (studentId: string, plan: Plan, dayIdx: number, when: Date, week: number) => {
      const day = plan.days[dayIdx];
      const [s] = await q<{ id: string }>(`insert into public.workout_sessions (student_id, plan_id, plan_day_id, plan_name, day_name, status, started_at, ended_at) values ($1,$2,$3,$4,$5,'completed',$6,$7) returning id`,
        [studentId, plan.id, day.id, plan.name, day.def.day, when, new Date(when.getTime() + 62 * 60_000)]);
      let pos = 0;
      for (const e of day.exs) {
        const [se] = await q<{ id: string }>(`insert into public.session_exercises (session_id, student_id, exercise_id, exercise_name, plan_exercise_id, position, rest_seconds) values ($1,$2,$3,$4,$5,$6,90) returning id`, [s.id, studentId, e.exId, e.name, e.peId, pos++]);
        const [, nSets, rMin, rMax, base] = e.def;
        for (let n = 1; n <= nSets; n++) {
          const weight = Math.round((base + week * 2.5) / 2.5) * 2.5;
          const reps = Math.max(rMin, rMax - (n > 2 ? 1 : 0) - (week % 2 === 0 ? 0 : 1) + (week > 3 ? 1 : 0));
          await q(`insert into public.session_sets (session_exercise_id, student_id, set_number, planned_weight_kg, planned_reps_min, planned_reps_max, weight_kg, reps, rir, completed, completed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)`,
            [se.id, studentId, n, base, rMin, rMax, weight, reps, n === nSets ? 1 : 2, when]);
        }
      }
      await q(`update public.pr_events set created_at = $2 where session_id = $1`, [s.id, new Date(when.getTime() + 62 * 60_000)]);
      sessions++;
    };
    // Ana: 6 semanas, 2x/semana (seg/ter... aproximado), último treino há 1 dia
    for (let w = 0; w < 6; w++) for (const [i, off] of [[0, 41 - w * 7], [1, 39 - w * 7]] as const) if (off >= 1) await doSession(ana, anaPlan, i, daysAgo(off), w);
    // Rui: 4 semanas, último há 9 dias (alerta)
    for (let w = 0; w < 4; w++) for (const [i, off] of [[0, 37 - w * 7], [1, 35 - w * 7]] as const) if (off >= 9) await doSession(rui, ruiPlan, i, daysAgo(off), w);
    // Sofia: sem atividade (nenhuma sessão)

    // ---------- nutrição, refeições e peso
    const goal = async (student: string, type: 'cut' | 'bulk', sex: string, age: number, h: number, w: number, kcal: number, tdee: number, adj: number, p: number, cb: number, f: number) => {
      await q(`insert into public.nutrition_profiles (student_id, sex, birth_date, height_cm, activity_level) values ($1,$2,current_date - ($3 * 365 + 90),$4,'moderate')`, [student, sex, age, h]);
      await q(`insert into public.nutrition_goals (student_id, goal_type, sex, age_years, height_cm, weight_kg, activity_level, bmr_formula, bmr, activity_factor, tdee, adjustment_pct, calories_calculated, calories_target, protein_g, carbs_g, fat_g, protein_g_per_kg, fat_g_per_kg, set_by, valid_from)
        values ($1,$2,$3,$4,$5,$6,'moderate','mifflin_st_jeor',$7,1.55,$8,$9,$10,$10,$11,$12,$13,2.0,0.9,$14,current_date - 45)`, [student, type, sex, age, h, w, Math.round(tdee / 1.55), tdee, adj, kcal, p, cb, f, coach]);
    };
    await goal(ana, 'cut', 'female', 29, 166, 68, 1770, 2080, -15, 136, 168, 61);
    await goal(rui, 'bulk', 'male', 24, 180, 74, 2900, 2640, 10, 148, 402, 67);

    const foodId = async (name: string) => (await q<{ id: string; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number }>(`select id, kcal_100g, protein_100g, carbs_100g, fat_100g from public.foods where source='system' and name=$1`, [name]))[0];
    const menu: [string, string, [string, number][]][] = [
      ['breakfast', 'Pequeno-almoço', [['Aveia (flocos)', 60], ['Leite meio-gordo', 250], ['Banana', 120]]],
      ['lunch', 'Almoço', [['Peito de frango grelhado', 150], ['Arroz branco cozido', 200], ['Brócolos cozidos', 120], ['Azeite', 10]]],
      ['snack', 'Lanche', [['Iogurte grego natural (0% gordura)', 150], ['Maçã', 180]]],
      ['dinner', 'Jantar', [['Salmão cru', 150], ['Batata-doce cozida', 200], ['Alface', 60], ['Azeite', 8]]],
    ];
    const logMeals = async (student: string, date: Date, scale: number) => {
      for (const [type, , items] of menu) {
        const [m] = await q<{ id: string }>(`insert into public.meals (student_id, log_date, meal_type) values ($1,$2,$3::public.meal_type) returning id`, [student, ymd(date), type]);
        let pos = 0;
        for (const [name, grams] of items) {
          const f = await foodId(name); const g = grams * scale; const k = g / 100;
          await q(`insert into public.meal_items (meal_id, food_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, position) values ($1,$2,$3,$4,'g',$5,$6,$7,$8,$9)`,
            [m.id, f.id, name, g, +(f.kcal_100g * k).toFixed(1), +(f.protein_100g * k).toFixed(1), +(f.carbs_100g * k).toFixed(1), +(f.fat_100g * k).toFixed(1), pos++]);
        }
      }
    };
    for (let i = 0; i < 14; i++) { if (i % 5 !== 4) await logMeals(ana, daysAgo(i), 0.9 + (i % 3) * 0.05); }
    for (let i = 0; i < 10; i++) { if (i >= 5) await logMeals(rui, daysAgo(i), 1.2); }

    for (let i = 0; i <= 42; i += 3) await q(`insert into public.body_metrics (student_id, measured_on, weight_kg) values ($1,$2,$3)`, [ana, ymd(daysAgo(i)), +(67.2 + i * 0.03 + ((i / 3) % 2) * 0.2).toFixed(1)]);
    for (let i = 8; i <= 40; i += 4) await q(`insert into public.body_metrics (student_id, measured_on, weight_kg) values ($1,$2,$3)`, [rui, ymd(daysAgo(i)), +(75.4 - i * 0.04).toFixed(1)]);
    await q(`insert into public.weight_goals (student_id, start_weight_kg, target_weight_kg, set_by, created_at) values ($1,68.5,65,$1, now() - interval '40 days')`, [ana]);

    await q(`insert into public.coach_notes (coach_id, student_id, body) values ($1,$2,'Boa adesão. Rever volume de pernas na próxima semana.')`, [coach, ana]);
    await q(`insert into public.session_comments (session_id, author_id, body) select id, $1, 'Excelente sessão, continua assim!' from public.workout_sessions where student_id = $2 order by started_at desc limit 1`, [coach, ana]);

    await c.query('commit');
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from public.pr_events`);
    console.log(`Demo criado: 1 coach, 4 alunos, ${sessions} sessões, ${n} eventos de PR. Palavra-passe: ${DEMO_PASSWORD}`);
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

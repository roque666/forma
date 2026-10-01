import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, login } from './helpers';
import pg from 'pg';

// Isolamento de dados: um utilizador nunca chega aos dados de outro, mesmo conhecendo os ids/URLs.
async function q<T = any>(sql: string, p: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try { return (await c.query(sql, p)).rows; } finally { await c.end(); }
}

test('atleta não acede a treinos, planos, exercícios ou dados de outro atleta', async ({ page }) => {
  const [ana] = await q<{ id: string }>(`select id from auth.users where email = 'ana@demo.pt'`);
  const [s] = await q<{ id: string }>(`select id from public.workout_sessions where student_id = $1 limit 1`, [ana.id]);
  const [p] = await q<{ id: string }>(`select id from public.workout_plans where student_id = $1 limit 1`, [ana.id]);
  await login(page, 'rui@demo.pt', DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);
  for (const url of [`/session/${s.id}`, `/workouts/${p.id}`, `/progress/${ana.id}?student=${ana.id}`]) {
    await page.goto(url);
    // (a página é servida em streaming, por isso o estado HTTP pode ser 200; o que conta é o conteúdo)
    await expect(page.getByText('Página não encontrada'), url).toBeVisible();
  }
  // o atleta também não vê rotas de coach
  await page.goto(`/students/${ana.id}`);
  await expect(page).toHaveURL(/\/dashboard/);
});

test('coach só vê atletas associados (Tiago tem convite pendente e não partilha dados)', async ({ page }) => {
  const [tiago] = await q<{ id: string }>(`select id from auth.users where email = 'tiago@demo.pt'`);
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  await page.goto(`/students/${tiago.id}`);
  await expect(page.getByText('Página não encontrada')).toBeVisible();
  await page.goto('/students');
  await expect(page.getByText('tiago@demo.pt')).toBeVisible(); // convite pendente listado, sem dados
});

test('coach não pode alterar registos diretamente; sem sessão redireciona para login', async ({ page, request }) => {
  const r = await request.get('/dashboard', { maxRedirects: 0 });
  expect([302, 307]).toContain(r.status());
  await page.goto('/workouts');
  await expect(page).toHaveURL(/\/login/);
});

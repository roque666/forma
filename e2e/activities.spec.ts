import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, login } from './helpers';
import pg from 'pg';

test.describe.configure({ mode: 'serial' });
const name = `Padel ${Date.now()}`;
async function q<T = any>(sql: string, p: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try { return (await c.query(sql, p)).rows; } finally { await c.end(); }
}

test('criar atividade, aparece em Hoje e no calendário, marcar feita e apagar', async ({ page }) => {
  await login(page, 'rui@demo.pt', DEMO_PASSWORD);
  await page.goto('/activities');
  // validação: sem dias
  await page.getByLabel('Nome').fill(name);
  await page.getByRole('button', { name: 'Criar atividade' }).click();
  await expect(page.getByText('Escolhe pelo menos um dia').first()).toBeVisible();
  // todos os dias, para aparecer hoje
  for (const d of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) await page.getByRole('group', { name: 'Dias da semana' }).getByText(d, { exact: true }).click();
  await page.getByLabel('Hora (opcional)').fill('20:30');
  await page.getByLabel('Duração em minutos (opcional)').fill('90');
  await page.getByRole('button', { name: 'Criar atividade' }).click();
  await expect(page.getByText('Atividade criada.')).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  // hoje (treinos)
  await page.goto('/workouts');
  await expect(page.getByText('Atividade de hoje')).toBeVisible();
  await page.getByRole('button', { name: `Marcar como feita: ${name}` }).click();
  await expect(page.getByRole('button', { name: `Desmarcar: ${name}` })).toBeVisible();
  expect((await q('select count(*)::int as n from public.activity_logs l join public.activities a on a.id = l.activity_id where a.name = $1', [name]))[0].n).toBe(1);
  // calendário
  await page.goto('/calendar');
  await expect(page.getByRole('link', { name: 'Atividades' }).first()).toBeVisible();
  await expect(page.getByText(`Atividade · 20:30 · 90 min`)).toBeVisible();
  // outro atleta não vê
  await page.goto('/activities');
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.waitForURL(/\/activities\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Apagar' }).click();
  await page.getByRole('button', { name: 'Apagar atividade?' }).click();
  await expect(page.getByText('Atividade apagada.')).toBeVisible();
  expect((await q('select count(*)::int as n from public.activities where id = $1', [id]))[0].n).toBe(0);
});

test('outro atleta não acede às atividades alheias', async ({ page }) => {
  const [ana] = await q(`select id from auth.users where email = 'ana@demo.pt'`);
  const [a] = await q(`insert into public.activities (student_id, name, weekdays) values ($1, 'Privada', '{1}') returning id`, [ana.id]);
  await login(page, 'rui@demo.pt', DEMO_PASSWORD);
  await page.goto(`/activities/${a.id}`);
  await expect(page.getByText('Página não encontrada')).toBeVisible();
  await q('delete from public.activities where id = $1', [a.id]);
});

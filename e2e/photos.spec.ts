import { expect, test, request } from '@playwright/test';
import { DEMO_PASSWORD, login, logout } from './helpers';
import pg from 'pg';

// Fotos de progresso: privadas por defeito, partilha opcional com o coach, comparador e apagar.
test.describe.configure({ mode: 'serial' });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGM8oaHBQApgIkn1qIZRDUNKAwCMLQE4ZidSiAAAAABJRU5ErkJggg==', 'base64');
async function q<T = any>(sql: string, p: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try { return (await c.query(sql, p)).rows; } finally { await c.end(); }
}
let ids: string[] = [];
let anaId = '';

test('atleta regista duas fotos (uma partilhada) e compara', async ({ page }) => {
  anaId = (await q(`select id from auth.users where email = 'ana@demo.pt'`))[0].id;
  await q('delete from public.progress_photos where student_id = $1', [anaId]);
  await login(page, 'ana@demo.pt', DEMO_PASSWORD);
  await page.goto('/photos');
  await expect(page.getByText('Ainda sem fotos')).toBeVisible();
  // sem ficheiro -> erro
  await page.getByRole('button', { name: 'Guardar foto' }).click();
  await expect(page.getByText('Escolhe ou tira uma foto.').first()).toBeVisible();
  // futuro -> erro
  await page.locator('input[type="file"]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible();
  await page.getByLabel('Data').fill('2999-01-01');
  await page.getByRole('button', { name: 'Guardar foto' }).click();
  await expect(page.getByText('A data não pode ser no futuro.').first()).toBeVisible();
  // foto antiga, partilhada
  await page.getByLabel('Data').fill('2026-06-01');
  await page.getByLabel('Peso (kg, opcional)').fill('82,5');
  await page.getByLabel(/Partilhar esta foto/).check();
  await page.getByRole('button', { name: 'Guardar foto' }).click();
  await expect(page.locator('img[src*="size=thumb"]')).toHaveCount(1);
  // foto recente, privada
  await page.locator('input[type="file"]').setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible();
  await page.getByLabel('Data').fill('2026-09-20');
  await page.getByLabel('Peso (kg, opcional)').fill('79');
  await page.getByRole('button', { name: 'Guardar foto' }).click();
  await expect(page.locator('img[src*="size=thumb"]')).toHaveCount(2);
  ids = (await q('select id from public.progress_photos where student_id = $1 order by taken_on', [anaId])).map((r) => r.id);
  expect(ids).toHaveLength(2);
  const thumb = page.locator(`img[src*="${ids[0]}?size=thumb"]`);
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  // comparar
  await page.getByRole('link', { name: 'Comparar' }).click();
  await expect(page.getByRole('img', { name: /^Antes:/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Depois:/ })).toBeVisible();
  await expect(page.getByText('-3,5')).toBeVisible();
  const r = await page.request.get(`/api/progress-photo/${ids[0]}`);
  expect(r.status()).toBe(200);
  expect(r.headers()['cache-control']).toContain('no-store');
});

test('outros atletas não acedem; o coach só vê a foto partilhada', async ({ page, baseURL }) => {
  await login(page, 'rui@demo.pt', DEMO_PASSWORD);
  for (const id of ids) {
    expect((await page.request.get(`/api/progress-photo/${id}`)).status()).toBe(404);
    await page.goto(`/photos/${id}`);
    await expect(page.getByText('Página não encontrada')).toBeVisible();
  }
  await logout(page);
  expect((await (await request.newContext({ baseURL })).get(`/api/progress-photo/${ids[0]}`)).status()).toBe(401);
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  await page.goto(`/students/${anaId}/photos`);
  await expect(page.locator('img[src*="size=thumb"]')).toHaveCount(1);
  expect((await page.request.get(`/api/progress-photo/${ids[0]}`)).status()).toBe(200); // partilhada
  expect((await page.request.get(`/api/progress-photo/${ids[1]}`)).status()).toBe(404); // privada
  // o coach não vê a página de fotos pessoais
  await page.goto('/photos');
  await expect(page).toHaveURL(/\/students/);
});

test('partilhar tudo, deixar de partilhar e apagar', async ({ page }) => {
  await login(page, 'ana@demo.pt', DEMO_PASSWORD);
  await page.goto('/photos');
  await page.getByRole('button', { name: 'Deixar de partilhar' }).click();
  await page.getByRole('button', { name: 'Deixar de partilhar tudo?' }).click();
  await expect(page.getByText('Deixaste de partilhar fotos com o teu coach.')).toBeVisible();
  expect((await q('select count(*)::int as n from public.progress_photos where shared_with_coach'))[0].n).toBe(0);
  await page.goto(`/photos/${ids[1]}`);
  await page.getByRole('button', { name: 'Apagar foto' }).click();
  await page.getByRole('button', { name: 'Apagar para sempre?' }).click();
  await expect(page.getByText('Foto apagada.')).toBeVisible();
  expect((await q('select count(*)::int as n from public.progress_photos where id = $1', [ids[1]]))[0].n).toBe(0);
});

import { expect, test, request } from '@playwright/test';
import { DEMO_PASSWORD, login, logout } from './helpers';

// Imagens e vídeo nos exercícios: base, upload próprio, vídeo e isolamento.
test.describe.configure({ mode: 'serial' });
const stamp = Date.now();
const name = `Ex Imagem ${stamp}`;
// PNG 16x16 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGM8oaHBQApgIkn1qIZRDUNKAwCMLQE4ZidSiAAAAABJRU5ErkJggg==', 'base64');
let exerciseId = '';

test('exercícios base mostram imagens (lista e detalhe)', async ({ page }) => {
  await login(page, 'ana@demo.pt', DEMO_PASSWORD);
  await page.goto('/exercises?q=supino');
  const first = page.locator('a[href^="/exercises/"] img').first();
  await expect(first).toBeVisible();
  await expect.poll(() => first.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await page.getByRole('link', { name: /Supino reto com barra/ }).click();
  await expect(page.getByText('A imagem alterna entre a posição inicial e a final.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Supino reto com barra' })).toBeVisible();
});

test('criar exercício com imagem e vídeo; rejeita ficheiro inválido', async ({ page }) => {
  await login(page, 'ana@demo.pt', DEMO_PASSWORD);
  await page.goto('/exercises/new');
  await page.getByLabel('Nome').fill(name);
  await page.getByLabel('Músculo principal').selectOption('chest');
  // ficheiro que não é imagem -> erro
  await page.locator('input[name="image"]').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('isto não é uma imagem') });
  await page.getByRole('button', { name: 'Criar exercício' }).click();
  await expect(page.getByText(/Formato de imagem não suportado|Não foi possível usar esta imagem/).first()).toBeVisible();
  // vídeo inválido (http) -> erro de validação
  await page.getByLabel('Link de vídeo (opcional)').fill('http://exemplo.com/v');
  await page.locator('input[name="image"]').setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Criar exercício' }).click();
  await expect(page.getByText(/tem de começar por https/).first()).toBeVisible();
  // tudo válido
  await page.getByLabel('Link de vídeo (opcional)').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.locator('input[name="image"]').setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible(); // imagem reduzida e pronta a enviar
  await page.getByRole('button', { name: 'Criar exercício' }).click();
  await expect(page).toHaveURL(/\/exercises\?created=1/);
  await page.getByRole('link', { name }).click();
  await page.waitForURL(/\/exercises\/[0-9a-f-]{36}$/);
  exerciseId = page.url().split('/').pop()!;
  const img = page.getByRole('img', { name });
  await expect(img).toBeVisible();
  expect(await img.getAttribute('src')).toContain(`/api/exercise-image/${exerciseId}`);
  const res = await page.request.get(`/api/exercise-image/${exerciseId}`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/jpeg'); // reduzida e convertida no browser
  await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toBeVisible();
});

test('a imagem do exercício privado não é acessível a outros', async ({ page, baseURL }) => {
  await login(page, 'rui@demo.pt', DEMO_PASSWORD);
  expect((await page.request.get(`/api/exercise-image/${exerciseId}`)).status()).toBe(404);
  await logout(page);
  const anon = await request.newContext({ baseURL });
  expect((await anon.get(`/api/exercise-image/${exerciseId}`)).status()).toBe(401);
  await anon.dispose();
});

test('coach edita imagem/vídeo de um exercício base; atleta não', async ({ page }) => {
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  await page.goto('/exercises?q=prancha');
  await page.getByRole('link', { name: /Prancha/ }).first().click();
  await page.getByLabel('Link de vídeo (opcional)').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button', { name: /Guardar/ }).first().click();
  await expect(page.getByText('Exercício atualizado.')).toBeVisible();
  await page.reload();
  await expect(page.locator('iframe[src*="youtube-nocookie.com"]')).toBeVisible();
  await page.getByLabel('Link de vídeo (opcional)').fill('');
  await page.getByRole('button', { name: /Guardar/ }).first().click();
  await expect(page.getByText('Exercício atualizado.')).toBeVisible();
  await logout(page);
  await login(page, 'ana@demo.pt', DEMO_PASSWORD);
  await page.goto('/exercises?q=prancha');
  await page.getByRole('link', { name: /Prancha/ }).first().click();
  await expect(page.getByLabel('Link de vídeo (opcional)')).toBeDisabled();
});

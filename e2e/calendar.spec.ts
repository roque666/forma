import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, login } from './helpers';

// Vários planos ativos, cada um com a sua regularidade, e o calendário.
test.describe.configure({ mode: 'serial' });
const stamp = Date.now();
const plan = `UNC ${stamp}`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => ymd(new Date(Date.now() + n * 86_400_000));

test('plano de 2 em 2 semanas convive com o plano atual e aparece no calendário', async ({ page }) => {
  await login(page, 'ana@demo.pt', DEMO_PASSWORD);
  await page.goto('/workouts/new');
  await page.getByLabel('Nome do plano').fill(plan);
  await page.getByRole('button', { name: /Criar e adicionar dias/ }).click();
  await page.getByLabel('Novo dia').fill('U1');
  for (const d of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) await page.getByRole('group', { name: 'Dias da semana' }).last().getByText(d, { exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar dia' }).click();
  await expect(page.getByRole('heading', { name: 'U1' })).toBeVisible();
  // regularidade: de 2 em 2 semanas, a começar na próxima semana
  await page.getByLabel('Regularidade').selectOption('w2');
  await page.getByLabel('Começa na semana de').fill(inDays(7));
  await page.getByRole('button', { name: /Guardar e pôr no calendário/ }).click();
  await expect(page.getByText('Calendário do plano guardado.')).toBeVisible();
  await expect(page.getByText(/No calendário · De 2 em 2 semanas/)).toBeVisible();
  // validação: fim antes do início
  await page.getByLabel('Termina em (opcional)').fill(inDays(-30));
  await page.locator('#calendario').getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('O fim tem de ser depois do início').first()).toBeVisible();
  await page.getByLabel('Termina em (opcional)').fill('');
  // os dois planos estão no calendário
  await page.goto('/workouts');
  await expect(page.getByRole('heading', { name: 'No calendário' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(plan) })).toBeVisible();
});

test('o calendário mostra o plano só nas semanas certas', async ({ page }) => {
  await login(page, 'ana@demo.pt', DEMO_PASSWORD);
  const d0 = inDays(0), d7 = inDays(7), d14 = inDays(14), d21 = inDays(21);
  await page.goto(`/calendar?m=${d7.slice(0, 7)}&d=${d7}`);
  await expect(page.getByRole('link', { name: new RegExp(plan) })).toBeVisible(); // legenda
  await expect(page.getByRole('link', { name: /U1/ }).first()).toBeVisible();     // semana do ciclo (dia selecionado)
  await page.goto(`/calendar?m=${d0.slice(0, 7)}&d=${d0}`);
  await expect(page.getByRole('link', { name: new RegExp(`${plan.replace(/\s/g, '\\s')}`) })).toBeVisible();
  await expect(page.locator('li', { hasText: 'U1' })).toHaveCount(0);              // esta semana não é do ciclo
  await page.goto(`/calendar?m=${d14.slice(0, 7)}&d=${d14}`);
  await expect(page.locator('li', { hasText: 'U1' })).toHaveCount(0);              // semana seguinte ao início: fora do ciclo
  await page.goto(`/calendar?m=${d21.slice(0, 7)}&d=${d21}`);
  await expect(page.locator('li', { hasText: 'U1' })).toHaveCount(1);              // 2 semanas depois do início, volta
});

test('tirar do calendário e voltar a pôr', async ({ page }) => {
  await login(page, 'ana@demo.pt', DEMO_PASSWORD);
  await page.goto('/workouts');
  await page.getByRole('link', { name: new RegExp(plan) }).click();
  await page.getByRole('button', { name: 'Tirar do calendário' }).click();
  await expect(page.getByRole('button', { name: 'Pôr no calendário', exact: true })).toBeVisible();
  await page.goto('/calendar');
  await expect(page.getByRole('link', { name: new RegExp(plan) })).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, login } from './helpers';

const FOODS = [
  ['aveia', 'Aveia (flocos)'], ['ovo cozido', 'Ovo cozido'], ['banana', 'Banana'], ['iogurte grego natural', 'Iogurte grego natural (0% gordura)'],
  ['frango grelhado', 'Peito de frango grelhado'], ['arroz branco cozido', 'Arroz branco cozido'], ['brocolos', 'Brócolos cozidos'], ['azeite', 'Azeite'],
  ['batata doce', 'Batata-doce cozida'],
] as const;

test('despensa → gerar → guardar → calendário → diário', async ({ page }) => {
  await login(page, 'rui@demo.pt', DEMO_PASSWORD);
  await page.goto('/nutrition/pantry');
  const search = page.getByRole('searchbox');
  for (const [term, name] of FOODS) {
    await search.fill(term);
    const add = page.getByRole('button', { name: new RegExp(`^Adicionar à despensa: ${name.replace(/[()]/g, '\\$&')}`) }).first();
    const shown = await add.waitFor({ timeout: 4000 }).then(() => true, () => false);
    if (shown) await add.click();
  }
  await expect(page.getByTestId('pantry-count')).toContainText(/Na despensa \(\d+\)/);
  await expect(page.getByRole('button', { name: 'Remover Azeite' })).toBeVisible();

  // gerar pré-visualização (dia-tipo)
  await page.getByRole('link', { name: 'Gerar refeições' }).click();
  await page.getByRole('button', { name: 'Gerar pré-visualização' }).click();
  const preview = page.getByTestId('plan-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByText('Almoço').first()).toBeVisible();
  await page.getByLabel('Nome do plano').fill('Plano e2e');
  await page.getByRole('button', { name: 'Guardar plano' }).click();
  await expect(page).toHaveURL(/\/nutrition\/plans\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: 'Plano e2e' })).toBeVisible();

  // pôr no calendário (todas as semanas)
  await page.getByRole('button', { name: 'Guardar e pôr no calendário' }).click();
  await expect(page.getByText('Calendário do plano guardado.').first()).toBeVisible();

  // aparece previsto hoje no diário e adiciona-se
  await page.goto('/nutrition');
  const planned = page.getByTestId('planned-today');
  await expect(planned).toContainText('Plano e2e');
  await planned.getByRole('button', { name: /Adicionar ao diário/ }).click();
  await expect(planned.getByRole('button', { name: /Remover do diário/ })).toBeVisible();

  // calendário de alimentação mostra o plano e o estado
  await page.goto('/nutrition/calendar');
  await expect(page.getByRole('button', { name: /Remover do diário/ })).toBeVisible();

  // desfaz e limpa
  await page.getByRole('button', { name: /Remover do diário/ }).click();
  await expect(page.getByRole('button', { name: /Adicionar ao diário/ })).toBeVisible();
  await page.locator('a[href*="/nutrition/plans/"]').first().click();
  await page.getByRole('button', { name: 'Eliminar plano' }).click();
  await page.getByRole('button', { name: 'Eliminar mesmo?' }).click();
  await expect(page).toHaveURL(/\/nutrition\/plans$/);
});

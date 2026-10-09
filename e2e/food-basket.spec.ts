import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, login } from './helpers';

test('almoço com vários alimentos de uma só vez (cesto)', async ({ page }) => {
  await login(page, 'rui@demo.pt', DEMO_PASSWORD);
  await page.goto('/nutrition/add?type=lunch');
  const bar = page.getByTestId('basket-bar');
  const search = page.getByLabel('Pesquisar alimento');
  // vários alimentos sem sair da página; a pesquisa acontece ao escrever
  for (const [term, name] of [['frango grelhado', 'Peito de frango grelhado'], ['arroz branco cozido', 'Arroz branco cozido'], ['brocolos', 'Brócolos cozidos'], ['espinafres cozidos', 'Espinafres cozidos']] as const) {
    await search.fill(term);
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
  }
  await expect(bar).toContainText('4 alimentos');
  // acertar uma quantidade
  await search.fill('frango grelhado');
  await page.getByRole('button', { name: /^Peito de frango grelhado/ }).first().click(); // abre o editor (já no cesto)
  await page.getByLabel('Quantidade de Peito de frango grelhado').fill('200');
  // remover um
  await search.fill('espinafres cozidos');
  await page.getByRole('button', { name: /^Espinafres cozidos/ }).first().click();
  await page.getByRole('button', { name: 'Remover Espinafres cozidos' }).click();
  await expect(bar).toContainText('3 alimentos');
  // quantidade inválida bloqueia
  await search.fill('arroz branco cozido');
  await page.getByRole('button', { name: /^Arroz branco cozido/ }).first().click();
  await page.getByLabel('Quantidade de Arroz branco cozido').fill('0');
  await expect(page.getByRole('button', { name: /Adicionar 3 ao diário/ })).toBeDisabled();
  await page.getByLabel('Quantidade de Arroz branco cozido').fill('150');
  await page.getByRole('button', { name: /Adicionar 3 ao diário/ }).click();
  await expect(page).toHaveURL(/\/nutrition/);
  for (const n of ['Peito de frango grelhado', 'Arroz branco cozido', 'Brócolos cozidos']) await expect(page.getByText(n, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Espinafres cozidos', { exact: true })).toHaveCount(0);
});

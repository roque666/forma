import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, login } from './helpers';

// O demo tem treinos concluídos no passado: o calendário deve mostrá-los com detalhe.
test('calendário mostra treinos feitos com volume, exercícios e séries', async ({ page }) => {
  await login(page, 'rui@demo.pt', DEMO_PASSWORD);
  await page.goto('/calendar');
  await expect(page.getByTestId('month-summary')).toBeVisible();
  const done = page.getByRole('link', { name: /Treino feito/ });
  // procura o mês mais recente com treinos feitos (até 3 meses para trás)
  for (let i = 0; i < 3 && (await done.count()) === 0; i++) await page.getByRole('link', { name: 'Mês anterior' }).click();
  await expect(done.first()).toBeVisible();
  await done.first().click();
  await expect(page.getByTestId('day-sessions')).toBeVisible();
  await expect(page.getByTestId('done-session').first()).toContainText(/kg/);
  await expect(page.getByTestId('done-session').first()).toContainText(/séries/);
  await expect(page.getByTestId('day-sessions').getByText(/kg × \d+/).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver treino completo' }).first()).toBeVisible();
});

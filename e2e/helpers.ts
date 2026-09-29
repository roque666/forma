import { expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'Demo12345678';

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/(dashboard|change-password)/);
}

export async function logout(page: Page) {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Terminar sessão' }).click();
  await expect(page).toHaveURL(/\/login/);
}

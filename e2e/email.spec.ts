import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_PASSWORD } from './helpers';

// Emails de registo: boas-vindas + confirmação (não obrigatória). Em desenvolvimento os emails vão para .outbox/mail.jsonl.
test.describe.configure({ mode: 'serial' });
const stamp = Date.now();
const email = `mail${stamp}@teste.pt`;
const outbox = () => readFileSync(join(process.cwd(), '.outbox', 'mail.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { to: string; subject: string; text: string });

test('registo envia email de boas-vindas e a conta funciona sem confirmar', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Nome').fill('Ana Teste');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /Criar conta/ }).click();
  await expect(page).toHaveURL(/\/dashboard/); // não bloqueia
  const m = outbox().filter((x) => x.to === email).pop()!;
  expect(m.subject).toMatch(/Bem-vindo/);
  expect(m.text).toMatch(/\/verify-email\?token=/);
  await page.goto('/profile');
  await expect(page.getByText('Por confirmar')).toBeVisible();
});

test('link de confirmação marca o email como confirmado; link repetido/ inválido não rebenta', async ({ page }) => {
  const link = outbox().filter((x) => x.to === email).pop()!.text.match(/https?:\/\/\S+\/verify-email\?token=\S+/)![0];
  await page.goto(new URL(link).pathname + new URL(link).search);
  await expect(page.getByText('Email confirmado. Obrigado!')).toBeVisible();
  await page.goto('/verify-email?token=invalido');
  await expect(page.getByText(/inválido ou já expirou/)).toBeVisible();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/profile');
  await expect(page.getByText('Email confirmado', { exact: true })).toBeVisible();
});

test('reenviar confirmação: limite de 5 minutos', async ({ page }) => {
  const e2 = `mail2_${stamp}@teste.pt`;
  await page.goto('/register');
  await page.getByLabel('Nome').fill('Rui Teste');
  await page.getByLabel('Email').fill(e2);
  await page.getByLabel('Palavra-passe').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /Criar conta/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Enviar email de confirmação' }).click();
  await expect(page.getByText(/Já enviámos um email há pouco/)).toBeVisible(); // o de boas-vindas acabou de sair
});

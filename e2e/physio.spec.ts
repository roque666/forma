import { expect, test, type Page } from '@playwright/test';
import { DEMO_PASSWORD, login, logout } from './helpers';

test.describe.configure({ mode: 'serial' });
const stamp = Date.now();
const physioEmail = `fisio${stamp}@teste.pt`;
const patientEmail = `pac${stamp}@teste.pt`;
const program = `Joelho ${stamp}`;

async function register(page: Page, name: string, email: string, code?: string) {
  await page.goto('/register');
  await page.getByLabel('Nome').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill(DEMO_PASSWORD);
  if (code) { await page.getByText('Sou fisioterapeuta').click(); await page.getByLabel('Código de fisioterapeuta').fill(code); }
  await page.getByRole('button', { name: /Criar conta/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test('registo de fisioterapeuta exige o código certo', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Nome').fill('Fisio Errada');
  await page.getByLabel('Email').fill(`errado${stamp}@teste.pt`);
  await page.getByLabel('Palavra-passe').fill(DEMO_PASSWORD);
  await page.getByText('Sou fisioterapeuta').click();
  await page.getByLabel('Código de fisioterapeuta').fill('errado');
  await page.getByRole('button', { name: /Criar conta/ }).click();
  await expect(page).toHaveURL(/\/register/);
  await register(page, 'Marta Fisio', physioEmail, 'codigo-fisio-teste');
  await expect(page.getByRole('heading', { name: /Olá, Marta/ })).toBeVisible();
  await expect(page.getByText('Ainda não tens pacientes')).toBeVisible();
});

test('paciente regista-se e fisio convida; o paciente aceita', async ({ page }) => {
  await register(page, 'Pedro Paciente', patientEmail);
  await logout(page);
  await login(page, physioEmail, DEMO_PASSWORD);
  await page.goto('/patients');
  await page.getByLabel('Email do paciente').fill(patientEmail);
  await page.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(page.getByText('Convite enviado.').first()).toBeVisible();
  await expect(page.getByText('Convites pendentes')).toBeVisible();
  await logout(page);
  await login(page, patientEmail, DEMO_PASSWORD);
  await page.goto('/rehab');
  await expect(page.getByText(/Marta Fisio/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Aceitar' }).click();
  await expect(page.getByText('Sem exercícios atribuídos')).toBeVisible();
});

test('fisio cria programa e adiciona exercício', async ({ page }) => {
  await login(page, physioEmail, DEMO_PASSWORD);
  await page.goto('/patients');
  await page.getByTestId('patient-card').first().click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Criar programa' }).click(); // validação
  await expect(page.getByText('Indica o nome do programa').first()).toBeVisible();
  await page.getByLabel('Nome do programa').fill(program);
  await page.getByRole('button', { name: 'Criar programa' }).click();
  await page.waitForURL(/\/programs\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Adicionar exercício' }).click();
  await page.getByRole('button', { name: /Agachamento/ }).first().click();
  await expect(page.getByTestId('rehab-item')).toHaveCount(1);
  await page.getByText('Editar prescrição').click();
  await page.getByLabel('Séries').fill('3');
  await page.getByLabel('Reps').fill('10');
  await page.getByLabel('Vezes/sem.').fill('2');
  await page.getByRole('button', { name: 'Guardar' }).first().click();
  await expect(page.getByText('3 × 10 · 2×/semana')).toBeVisible();
});

test('paciente regista o exercício e o fisio vê o progresso', async ({ page }) => {
  await login(page, patientEmail, DEMO_PASSWORD);
  await page.goto('/rehab');
  await expect(page.getByRole('region', { name: program })).toBeVisible();
  await page.getByLabel('Dor (0–10)').selectOption('4');
  await page.getByLabel('Nota (opcional)').fill('Sem problemas');
  await page.getByRole('button', { name: 'Marcar como feito' }).click();
  await expect(page.getByTestId('rehab-log')).toHaveCount(1);
  await expect(page.getByText('1/2 esta semana').first()).toBeVisible();
  // o paciente não tem acesso à área do fisio
  await page.goto('/patients');
  await expect(page).toHaveURL(/\/dashboard/);
  await logout(page);
  await login(page, physioEmail, DEMO_PASSWORD);
  await page.goto('/patients');
  await expect(page.getByText('1/2').first()).toBeVisible();
  await page.getByTestId('patient-card').first().click();
  await expect(page.getByTestId('rehab-log')).toHaveCount(1);
  await expect(page.getByText('Dor 4/10')).toBeVisible();
  await expect(page.getByText('“Sem problemas”')).toBeVisible();
});

test('terminar acompanhamento retira o acesso do fisio', async ({ page }) => {
  await login(page, patientEmail, DEMO_PASSWORD);
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Terminar acompanhamento' }).click();
  await page.getByRole('button', { name: 'Terminar acompanhamento?' }).click();
  await expect(page.getByText('O meu fisioterapeuta')).toHaveCount(0);
  await logout(page);
  await login(page, physioEmail, DEMO_PASSWORD);
  await page.goto('/patients');
  await expect(page.getByTestId('patient-card')).toHaveCount(0);
});

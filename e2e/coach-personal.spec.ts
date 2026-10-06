import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, login, logout } from './helpers';

// O coach também pode usar a app como atleta ("O meu treino"), com dados só seus.
test.describe.configure({ mode: 'serial' });
const stamp = Date.now();
const planName = `Plano Coach ${stamp}`;

test('coach alterna para "O meu treino" e usa treino, refeição e peso', async ({ page }) => {
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  await expect(page.getByRole('link', { name: 'Atletas' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'O meu treino' }).click();
  await expect(page.getByRole('button', { name: 'Voltar a coach' })).toBeVisible(); // modo já ativo
  await expect(page.getByRole('link', { name: 'Atletas' })).toHaveCount(0);
  await expect(page.getByText('O meu treino').first()).toBeVisible();

  // plano próprio
  await page.goto('/workouts/new');
  await page.getByLabel('Nome do plano').fill(planName);
  await page.getByRole('button', { name: /Criar e adicionar dias/ }).click();
  await expect(page.getByRole('heading', { name: planName })).toBeVisible();

  // peso
  await page.goto('/weight');
  await page.getByLabel('Peso (kg)').first().fill('90,5');
  await page.getByRole('button', { name: 'Registar peso' }).click();
  await expect(page.getByText('Peso registado.').first()).toBeVisible();

  // refeição
  await page.goto('/nutrition/add?type=lunch');
  await page.getByLabel('Pesquisar alimento').fill('frango');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await page.getByRole('button', { name: /Peito de frango grelhado/ }).click();
  await page.getByLabel('Quantidade').fill('150');
  await page.getByRole('button', { name: 'Adicionar ao diário' }).click();
  await expect(page).toHaveURL(/\/nutrition/);
  await expect(page.getByText('Peito de frango grelhado', { exact: true })).toBeVisible();

  // voltar a coach
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Voltar a coach' }).click();
  await expect(page.getByRole('link', { name: 'Atletas' }).first()).toBeVisible();
});

test('os dados pessoais do coach não aparecem aos atletas nem no modo coach', async ({ page }) => {
  await login(page, 'ana@demo.pt', DEMO_PASSWORD);
  await page.goto('/workouts');
  await expect(page.getByText(planName)).toHaveCount(0);
  await logout(page);
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  await page.goto('/workouts');
  await expect(page.getByText(planName)).toHaveCount(0); // modo coach não mistura planos pessoais
});

test('modo "O meu treino": todas as secções abrem e dá para treinar e definir objetivo', async ({ page }) => {
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  await page.getByRole('button', { name: 'O meu treino' }).click();
  await expect(page.getByRole('button', { name: 'Voltar a coach' })).toBeVisible(); // modo já ativo
  // treino completo: criar exercício, plano com dia, iniciar, registar série, terminar
  const ex = `Ex Coach ${stamp}`;
  await page.goto('/exercises/new');
  await page.getByLabel('Nome').fill(ex);
  await page.getByLabel('Músculo principal').selectOption('lats');
  await page.getByRole('button', { name: 'Criar exercício' }).click();
  await expect(page).toHaveURL(/\/exercises\?created=1/);
  await page.goto('/workouts/new');
  await page.getByLabel('Nome do plano').fill(`Treino ${stamp}`);
  await page.getByRole('button', { name: /Criar e adicionar dias/ }).click();
  await page.getByLabel('Novo dia').fill('Dia A');
  for (const d of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) await page.getByRole('group', { name: 'Dias da semana' }).last().getByText(d, { exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar dia' }).click();
  await page.getByRole('button', { name: 'Adicionar exercício' }).click();
  await page.getByPlaceholder('Pesquisar exercício…').fill(ex);
  await page.getByRole('button', { name: new RegExp(ex) }).click();
  await expect(page.getByText(`${ex} adicionado.`)).toBeVisible();
  await page.goto('/workouts');
  await page.getByRole('link', { name: new RegExp(`Treino ${stamp}`) }).click();
  await page.getByRole('button', { name: 'Pôr no calendário', exact: true }).click();
  await page.goto('/workouts');
  // pode haver vários planos no calendário: inicia o treino deste plano
  await page.locator('div.py-3').filter({ hasText: `Treino ${stamp}` }).getByRole('button', { name: /Iniciar treino|Repetir treino/ }).click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByLabel(`${ex} série 1 peso`).fill('30');
  await page.getByLabel(`${ex} série 1 repetições`).fill('8');
  await page.getByRole('button', { name: 'Concluir série 1' }).click();
  await page.getByRole('button', { name: /Terminar/ }).first().click();
  await page.getByRole('button', { name: 'Terminar e guardar' }).click();
  await expect(page.getByText('Duração')).toBeVisible();
  // objetivo
  await page.goto('/nutrition/goals');
  await expect(page.getByRole('radio', { name: /Cut/ })).toBeVisible();
  // todas as secções sem erro
  for (const path of ['/dashboard', '/workouts', '/exercises', '/nutrition', '/nutrition/foods', '/nutrition/stats', '/weight', '/progress', '/history', '/profile']) {
    await page.goto(path);
    await expect(page.getByText('Algo correu mal'), path).toHaveCount(0);
    await expect(page.getByText('Página não encontrada')).toHaveCount(0);
  }
  await page.goto('/history');
  await expect(page.getByRole('link', { name: /Dia A/ }).first()).toBeVisible();
});

test('liberdades do coach no modo atleta: partilhar, editar base, objetivo sem avisos', async ({ page }) => {
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  await page.getByRole('button', { name: 'O meu treino' }).click();
  await expect(page.getByRole('button', { name: 'Voltar a coach' })).toBeVisible(); // modo já ativo

  // exercício criado pelo coach fica visível aos atletas ligados
  const ex = `Ex Partilhado ${stamp}`;
  await page.goto('/exercises/new');
  await page.getByLabel('Nome').fill(ex);
  await page.getByLabel('Músculo principal').selectOption('chest');
  await page.getByRole('button', { name: 'Criar exercício' }).click();
  await expect(page).toHaveURL(/\/exercises\?created=1/);

  // partilhar um plano: como modelo e para a Ana
  await page.goto('/workouts/new');
  await page.getByLabel('Nome do plano').fill(`Partilha ${stamp}`);
  await page.getByRole('button', { name: /Criar e adicionar dias/ }).click();
  await page.getByRole('combobox', { name: 'Enviar para' }).selectOption({ index: 0 });
  await page.getByRole('button', { name: 'Partilhar cópia' }).click();
  await expect(page.getByText(/Guardado como modelo/)).toBeVisible();
  const anaOption = (await page.getByRole('combobox', { name: 'Enviar para' }).locator('option', { hasText: 'Ana' }).first().textContent())!;
  await page.getByRole('combobox', { name: 'Enviar para' }).selectOption({ label: anaOption });
  await page.getByRole('button', { name: 'Partilhar cópia' }).click();
  await expect(page.getByText(/Cópia enviada ao atleta/)).toBeVisible();

  // editar um exercício da biblioteca base
  await page.goto('/exercises');
  await page.getByRole('link', { name: /Supino/ }).first().click();
  await expect(page.getByText(/não pode ser editado/)).toHaveCount(0);
  const equip = page.getByLabel('Equipamento');
  const before = await equip.inputValue();
  await equip.fill('Teste base');
  await page.getByRole('button', { name: /Guardar/ }).first().click();
  await expect(page.getByText('Exercício atualizado.').first()).toBeVisible();
  await equip.fill(before);
  await page.getByRole('button', { name: /Guardar/ }).first().click();
  await expect(page.getByText('Exercício atualizado.').first()).toBeVisible();

  // objetivo sem aviso legal/de segurança
  await page.goto('/nutrition/goals');
  await expect(page.getByText(/não constituem aconselhamento/)).toHaveCount(0);
  await logout(page);

  // a Ana vê o plano e o exercício partilhados; não pode editar a base
  await login(page, 'ana@demo.pt', DEMO_PASSWORD);
  await page.goto('/workouts');
  await expect(page.getByText(`Partilha ${stamp}`).first()).toBeVisible();
  await page.goto(`/exercises?q=${encodeURIComponent(ex)}`);
  await expect(page.getByText(ex).first()).toBeVisible();
  await page.goto('/exercises');
  await page.getByRole('link', { name: /Supino/ }).first().click();
  await expect(page.getByText(/não pode ser editado/)).toBeVisible();
});

test('modelos do coach aparecem em "O meu treino" e podem ser usados como plano', async ({ page }) => {
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  // o modelo demo "Full body iniciante" é do coach
  await page.getByRole('button', { name: 'O meu treino' }).click();
  await expect(page.getByRole('button', { name: 'Voltar a coach' })).toBeVisible(); // modo já ativo
  await page.goto('/workouts');
  await expect(page.getByText('Os meus modelos')).toBeVisible();
  await expect(page.getByText('Full body iniciante').first()).toBeVisible();
  await page.locator('div.space-y-2', { hasText: 'Full body iniciante' }).getByRole('button', { name: 'Usar como meu plano' }).click();
  await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]{36}/);
  await expect(page.getByText(/No calendário · /)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Full body iniciante/ })).toBeVisible();
});

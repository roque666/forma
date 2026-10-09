import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, login, logout } from './helpers';

// Os 15 fluxos pedidos, de ponta a ponta, numa base de dados real (viewport mobile).
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const studentEmail = `e2e.atleta.${stamp}@teste.pt`;
const studentPass = 'Teste12345678';
const exName = `Remada E2E ${stamp}`;
const planName = `Plano E2E ${stamp}`;
const newStudentEmail = `e2e.novo.${stamp}@teste.pt`;
let tempPassword = '';

test('1. criar conta', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Nome').fill('Atleta E2E');
  await page.getByLabel('Email').fill(studentEmail);
  await page.getByLabel('Palavra-passe').fill(studentPass);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /Olá, Atleta/ })).toBeVisible();
});

test('validações: registo com dados inválidos mostra erros', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Nome').fill('X');
  await page.getByLabel('Email').fill('nao-e-email');
  await page.getByLabel('Palavra-passe').fill('curta');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText(/Mínimo 10 caracteres|Email inválido/).first()).toBeVisible();
});

test('3. criar exercício', async ({ page }) => {
  await login(page, studentEmail, studentPass);
  await page.goto('/exercises/new');
  await page.getByLabel('Nome').fill(exName);
  await page.getByLabel('Músculo principal').selectOption('lats');
  await page.locator('label', { hasText: 'Bíceps' }).click();
  await page.getByRole('button', { name: 'Criar exercício' }).click();
  await expect(page).toHaveURL(/\/exercises\?created=1/);
  await expect(page.getByText(exName)).toBeVisible();
});

test('2. criar plano (dia + exercício + séries)', async ({ page }) => {
  await login(page, studentEmail, studentPass);
  await page.goto('/workouts/new');
  await page.getByLabel('Nome do plano').fill(planName);
  await page.getByRole('button', { name: /Criar e adicionar dias/ }).click();
  await expect(page.getByRole('heading', { name: planName })).toBeVisible();
  // dia com todos os dias da semana, para haver "treino de hoje" qualquer que seja a data
  await page.getByLabel('Novo dia').fill('Dia A');
  for (const d of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) await page.getByRole('group', { name: 'Dias da semana' }).last().getByText(d, { exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar dia' }).click();
  await expect(page.getByRole('heading', { name: 'Dia A' })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar exercício' }).click();
  await page.getByPlaceholder('Pesquisar exercício…').fill(exName);
  await page.getByRole('button', { name: new RegExp(exName) }).click();
  await expect(page.getByText(`${exName} adicionado.`)).toBeVisible();
  // definir séries: 3 por defeito + 1 = 4; primeira com 20 kg
  await page.getByLabel('Série 1 peso').fill('20');
  await page.getByRole('button', { name: /^Série$/ }).click();
  await page.getByRole('button', { name: 'Guardar séries' }).click();
  await expect(page.getByText('Séries guardadas.')).toBeVisible();
  await expect(page.getByText(/4 séries/)).toBeVisible();
});

async function doSession(page: import('@playwright/test').Page, weight: string, reps: string) {
  await page.goto('/workouts');
  await expect(page.getByText(/Treino de hoje|Treino sugerido|Concluído hoje/)).toBeVisible();
  await page.getByRole('button', { name: /Iniciar treino|Repetir treino/ }).first().click(); // 4. iniciar
  await expect(page).toHaveURL(/\/session\//);
  await expect(page.getByRole('heading', { name: 'Dia A' })).toBeVisible();
  for (const n of [1, 2]) {
    await page.getByLabel(`${exName} série ${n} peso`).fill(weight);
    await page.getByLabel(`${exName} série ${n} repetições`).fill(reps);
    await page.getByRole('button', { name: `Concluir série ${n}` }).click(); // 5. registar séries
    await expect(page.getByRole('button', { name: `Desmarcar série ${n}` })).toBeVisible();
  }
}

test('4-6. iniciar treino, registar séries (com temporizador) e terminar', async ({ page }) => {
  await login(page, studentEmail, studentPass);
  await doSession(page, '20', '10');
  await expect(page.getByRole('timer')).toBeVisible(); // descanso a contar
  await page.getByRole('button', { name: /Terminar/ }).first().click();
  await page.getByRole('button', { name: 'Terminar e guardar' }).click(); // 6. terminar
  await expect(page.getByText('Duração')).toBeVisible();
  await expect(page.getByText('400', { exact: false }).first()).toBeVisible(); // 2×20×10 = 400 kg
});

test('7-8. histórico e deteção de PR (segundo treino mais pesado)', async ({ page }) => {
  await login(page, studentEmail, studentPass);
  await doSession(page, '25', '10');
  await expect(page.getByText(/Novo recorde/).first()).toBeVisible(); // toast de PR
  await page.getByRole('button', { name: /Terminar/ }).first().click();
  await page.getByRole('button', { name: 'Terminar e guardar' }).click();
  await expect(page.getByText('Recordes neste treino')).toBeVisible();
  await page.goto('/history'); // 7. consultar histórico
  await expect(page.getByRole('link', { name: /Dia A/ })).toHaveCount(2);
  await page.goto('/progress');
  await expect(page.getByText(exName).first()).toBeVisible();
  await page.getByRole('link', { name: new RegExp(exName) }).first().click();
  await expect(page.getByText('Recordes pessoais')).toBeVisible();
});

test('9. configurar objetivo CUT / BULK / MANUTENÇÃO', async ({ page }) => {
  await login(page, studentEmail, studentPass);
  await page.goto('/nutrition/goals');
  await page.getByLabel('Sexo').selectOption('male');
  await page.getByLabel('Data de nascimento').fill('1995-05-10');
  await page.getByLabel('Altura (cm)').fill('180');
  await page.getByLabel('Peso (kg)').fill('80');
  // pré-visualização em tempo real dos três cenários
  await expect(page.getByRole('radio', { name: /Cut/ })).toContainText('kcal');
  await page.getByRole('radio', { name: /Cut/ }).click();
  await expect(page.getByText(/Objetivo diário \(-15%\)/)).toBeVisible();
  await page.getByRole('radio', { name: /Bulk/ }).click();
  await expect(page.getByText(/Objetivo diário \(\+10%\)/)).toBeVisible();
  await page.getByRole('radio', { name: /Cut/ }).click();
  await page.getByRole('button', { name: 'Guardar objetivo' }).click();
  await expect(page.getByText(/Objetivo guardado: \d+ kcal/)).toBeVisible();
});

test('10-11. registar refeição e consultar calorias/macros', async ({ page }) => {
  await login(page, studentEmail, studentPass);
  await page.goto('/nutrition/add?type=lunch');
  await page.getByLabel('Pesquisar alimento').fill('frango');
  await page.getByRole('button', { name: /Peito de frango grelhado/ }).click();
  await page.getByLabel('Unidade de Peito de frango grelhado').selectOption('g');
  await page.getByLabel('Quantidade de Peito de frango grelhado').fill('200');
  await expect(page.getByTestId('basket-bar').getByText('330')).toBeVisible(); // 165 kcal/100 g × 200 g
  await page.getByRole('button', { name: /Adicionar 1 ao diário/ }).click(); // 10
  await expect(page).toHaveURL(/\/nutrition/);
  await expect(page.getByText('Peito de frango grelhado', { exact: true })).toBeVisible(); // 11
  await expect(page.getByText(/restantes/)).toBeVisible();
  await expect(page.getByText('Proteína', { exact: true }).first()).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByText('Calorias de hoje')).toBeVisible();
});

test('12. registar peso', async ({ page }) => {
  await login(page, studentEmail, studentPass);
  await page.goto('/weight');
  await page.getByLabel('Peso (kg)').first().fill('80,5');
  await page.getByRole('button', { name: 'Registar peso' }).click();
  await expect(page.getByText('Peso registado.').first()).toBeVisible();
  await expect(page.getByText('80,5 kg').first()).toBeVisible();
});

test('13. coach cria atleta (conta com palavra-passe temporária)', async ({ page }) => {
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  await page.goto('/students');
  await expect(page.getByTestId('student-card').first()).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Atleta Novo E2E');
  await page.locator('form:has-text("Criar conta do atleta") input[name="email"]').fill(newStudentEmail);
  await page.getByRole('button', { name: 'Criar conta do atleta' }).click();
  await expect(page.getByText('Confirma que o atleta autorizou')).toBeVisible(); // validação
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Criar conta do atleta' }).click();
  await expect(page.getByTestId('temp-password')).toBeVisible();
  tempPassword = (await page.getByTestId('temp-password').textContent())!.trim();
  expect(tempPassword.length).toBeGreaterThan(10);
});

test('14. coach atribui treino ao atleta; atleta vê o plano após mudar a palavra-passe', async ({ page }) => {
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  await page.goto('/students');
  await page.getByRole('link', { name: /Atleta Novo E2E/ }).click();
  await page.getByRole('navigation', { name: 'Secções do atleta' }).getByRole('link', { name: 'Treinos' }).click();
  await page.getByLabel('Atribuir modelo').selectOption({ label: 'Full body iniciante' });
  await page.getByRole('button', { name: 'Atribuir' }).click();
  await expect(page.getByText('Plano atribuído ao atleta.')).toBeVisible();
  await logout(page);
  // o atleta entra com a temporária e é obrigado a mudar
  await login(page, newStudentEmail, tempPassword);
  await expect(page).toHaveURL(/\/change-password/);
  await page.getByLabel('Palavra-passe atual (temporária)').fill(tempPassword);
  await page.getByLabel('Nova palavra-passe', { exact: true }).fill('NovaPass123456');
  await page.getByLabel('Confirmar nova palavra-passe').fill('NovaPass123456');
  await page.getByRole('button', { name: 'Guardar e continuar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/workouts');
  await expect(page.getByText('Full body iniciante').first()).toBeVisible();
});

test('15. coach consulta o progresso do atleta', async ({ page }) => {
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  await page.goto('/students');
  await page.getByRole('link', { name: /Ana Ribeiro/ }).click();
  await page.getByRole('navigation', { name: 'Secções do atleta' }).getByRole('link', { name: 'Progressão' }).click();
  await expect(page.getByText('Supino reto com barra').first()).toBeVisible();
  await page.getByRole('link', { name: /Supino reto com barra/ }).first().click();
  await expect(page.getByText('1RM estimado').first()).toBeVisible();
  await expect(page.getByText('Recordes pessoais')).toBeVisible();
  // nutrição e peso (só leitura)
  await page.goBack();
  await page.goBack();
  await page.getByRole('navigation', { name: 'Secções do atleta' }).getByRole('link', { name: 'Nutrição' }).click();
  await expect(page.getByText(/kcal/).first()).toBeVisible();
});

test('dashboard do coach mostra alertas e adesão', async ({ page }) => {
  await login(page, 'coach@demo.pt', DEMO_PASSWORD);
  await page.goto('/dashboard');
  await expect(page.getByText('Atletas ativos')).toBeVisible();
  await expect(page.getByText('Adesão aos planos')).toBeVisible();
  await expect(page.getByText('Alertas').first()).toBeVisible();
});

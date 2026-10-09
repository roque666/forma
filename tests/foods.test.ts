import { beforeAll, describe, expect, it } from 'vitest';
import { searchFoods } from '@/lib/services/nutrition';
import { as, makeUser, type TestUser } from './helpers';

const skip = process.env.SKIP_DB_TESTS === '1';
const d = skip ? describe.skip : describe;

d('alimentos: base alargada e pesquisa por palavras', () => {
  let u: TestUser;
  beforeAll(async () => { u = await makeUser('student', 'atleta-alimentos'); });
  const find = (q: string) => as(u, (db) => searchFoods(db, q)).then((r) => r.map((f) => f.name));

  it('encontra comida portuguesa', async () => {
    expect(await find('francesinha')).toContain('Francesinha');
    expect(await find('pastel de nata')).toContain('Pastel de nata');
    expect(await find('bacalhau a bras')).toContain('Bacalhau à Brás');
  });
  it('pesquisa por várias palavras, em qualquer ordem e sem acentos', async () => {
    expect(await find('frango grelhado')).toContain('Peito de frango grelhado');
    expect(await find('grelhado frango')).toContain('Peito de frango grelhado');
    expect(await find('Salmao fumado')).toContain('Salmão fumado');
  });
  it('sem resultados para palavras que não existem juntas', async () => {
    expect(await find('frango xyzabc')).toHaveLength(0);
  });
  it('vários alimentos têm porções comuns', async () => {
    const r = await as(u, (db) => searchFoods(db, 'pastel de nata'));
    expect(r[0].servings.map((s) => s.label)).toContain('1 pastel');
  });
});

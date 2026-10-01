import pg from 'pg';

const { Pool, types } = pg;

// numeric → number, bigint (count) → number, date → 'YYYY-MM-DD', timestamptz → ISO string.
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1184, (v) => new Date(v).toISOString());
types.setTypeParser(1114, (v) => new Date(v + 'Z').toISOString());

declare global {
  // eslint-disable-next-line no-var
  var __gymPool: pg.Pool | undefined;
}

function getPool(): pg.Pool {
  if (!globalThis.__gymPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL não definido');
    globalThis.__gymPool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  }
  return globalThis.__gymPool;
}

export interface Db {
  /** Devolve todas as linhas. */
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Devolve a primeira linha ou null. */
  one<T = any>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Executa e devolve o nº de linhas afetadas. */
  exec(sql: string, params?: unknown[]): Promise<number>;
}

function wrap(client: pg.PoolClient): Db {
  return {
    async query(sql, params) {
      return (await client.query(sql, params as any[])).rows;
    },
    async one(sql, params) {
      return (await client.query(sql, params as any[])).rows[0] ?? null;
    },
    async exec(sql, params) {
      return (await client.query(sql, params as any[])).rowCount ?? 0;
    },
  };
}

/**
 * Executa `fn` numa transação COMO o utilizador indicado.
 * `set local role authenticated` + `request.jwt.claim.sub` fazem com que auth.uid() e todas as
 * políticas RLS se apliquem a cada pedido — a segurança dos dados vive na base de dados.
 */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query('set local role authenticated');
    const result = await fn(wrap(client));
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Acesso privilegiado (sem RLS). SÓ para operações de servidor que não pertencem a um utilizador:
 * registo, sessões, tentativas de login, criação de contas de atletas pelo coach, seeds.
 * Nunca usar com ids vindos do cliente sem validar permissões antes.
 */
export async function withAdmin<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(wrap(client));
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await globalThis.__gymPool?.end();
  globalThis.__gymPool = undefined;
}

/** Converte erros do Postgres em mensagens seguras para mostrar ao utilizador. */
export function dbErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string; constraint?: string };
  const msg = err?.message ?? '';
  const fromRaise = err?.code && !/violates|duplicate key|invalid input|out of range|null value|permission denied/i.test(msg);
  if (fromRaise && ['P0002', '22023', '55000', '42501', '23505'].includes(err.code!)) return msg.replace(/\b(a)lunos?\b/gi, (m) => (/^A/.test(m) ? 'Atleta' : 'atleta') + (/s$/i.test(m) ? 's' : '')); // vocabulário: "atleta"
  switch (err?.code) {
    case '42501':
      return 'Não tens permissão para esta ação.';
    case '23505':
      return 'Já existe um registo igual.';
    case '23503':
      return 'O registo depende de outro que já não existe.';
    case '23514':
    case '22003':
    case '22P02':
      return 'Valor inválido.';
    case '23502':
      return 'Falta um campo obrigatório.';
    default:
      return 'Ocorreu um erro inesperado. Tenta novamente.';
  }
}

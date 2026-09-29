import { execFileSync } from 'node:child_process';
import pg from 'pg';

const BASE = process.env.TEST_ADMIN_URL ?? 'postgresql://postgres:@/postgres?host=/tmp/gymapp-pg';
const TEST_DB = 'gymapp_test';

/** Cria uma base de dados limpa para os testes de integração (migrações + seed de sistema). */
export default async function setup() {
  const needsDb = process.env.SKIP_DB_TESTS !== '1';
  if (!needsDb) return;
  const admin = new pg.Client({ connectionString: BASE });
  try {
    await admin.connect();
  } catch {
    console.warn('[tests] Sem Postgres disponível — testes de integração serão ignorados.');
    process.env.SKIP_DB_TESTS = '1';
    return;
  }
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = '${TEST_DB}'`);
  await admin.query(`drop database if exists ${TEST_DB}`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const url = BASE.replace(/\/postgres(\?|$)/, `/${TEST_DB}$1`);
  process.env.DATABASE_URL = url;
  const env = { ...process.env, DATABASE_URL: url, DB_STUB_EXTENSIONS: process.env.DB_STUB_EXTENSIONS ?? '1' };
  execFileSync('npx', ['tsx', 'scripts/migrate.ts'], { env, stdio: 'inherit' });
  execFileSync('npx', ['tsx', 'scripts/seed-system.ts'], { env, stdio: 'inherit' });
}

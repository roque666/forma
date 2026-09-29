import { execSync } from 'node:child_process';
import pg from 'pg';

/** Repõe os dados demo e limpa os limites de tentativas antes de cada execução (só desenvolvimento). */
export default async function globalSetup() {
  execSync('npx tsx scripts/seed-demo.ts', { stdio: 'inherit', env: process.env });
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('delete from private.login_attempts');
  await c.end();
}

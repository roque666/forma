/**
 * Runner de migrações.
 *   tsx scripts/migrate.ts                     aplica as migrações em falta
 *   tsx scripts/migrate.ts --reset             apaga tudo e volta a aplicar (nunca em produção)
 *   AUTH_MODE=supabase                         não aplica db/standalone (o Supabase já traz auth)
 *   DB_STUB_EXTENSIONS=1                       só para desenvolvimento/testes num Postgres sem contrib
 *                                              (simula unaccent e pg_trgm)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definido');

const reset = process.argv.includes('--reset');
const stubExt = process.env.DB_STUB_EXTENSIONS === '1';
const supabaseMode = process.env.AUTH_MODE === 'supabase';

if (reset && process.env.NODE_ENV === 'production') throw new Error('--reset recusado em produção');

const STUB_EXTENSIONS = `
create schema if not exists extensions;
do $$ begin
  if not exists (select 1 from pg_ts_dict d join pg_namespace n on n.oid = d.dictnamespace
                 where d.dictname = 'unaccent' and n.nspname = 'extensions') then
    create text search dictionary extensions.unaccent (template = pg_catalog.simple);
  end if;
end $$;
create or replace function extensions.unaccent(regdictionary, text) returns text language sql immutable as
  $$ select translate($2, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN') $$;
create or replace function extensions.similarity(text, text) returns real language sql immutable as
  $$ select case when $1 = $2 then 1.0 else 0.3 end::real $$;
`;

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (reset) {
      await client.query('drop schema if exists public cascade; drop schema if exists private cascade;');
      if (!supabaseMode) await client.query('drop schema if exists auth cascade; drop schema if exists extensions cascade;');
      await client.query('create schema public;');
      await client.query('grant usage on schema public to public;');
    }
    await client.query('create schema if not exists private');
    await client.query(
      'create table if not exists private.schema_migrations (name text primary key, applied_at timestamptz not null default now())',
    );
    const applied = new Set((await client.query('select name from private.schema_migrations')).rows.map((r) => r.name));

    const files: { name: string; path: string }[] = [];
    if (!supabaseMode) {
      const dir = join(root, 'db', 'standalone');
      for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) files.push({ name: `standalone/${f}`, path: join(dir, f) });
    }
    const dir = join(root, 'supabase', 'migrations');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) files.push({ name: f, path: join(dir, f) });

    if (stubExt) await client.query(STUB_EXTENSIONS);

    for (const f of files) {
      if (applied.has(f.name)) continue;
      let sql = readFileSync(f.path, 'utf8');
      if (stubExt) {
        sql = sql.replace(/create extension[^;]*;/gi, '');
        sql = sql.replace(/create index \w+ on public\.\w+\s+using gin \([^;]*gin_trgm_ops\);/gi, '');
      }
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into private.schema_migrations (name) values ($1)', [f.name]);
        await client.query('commit');
        console.log('aplicada  ', f.name);
      } catch (e) {
        await client.query('rollback');
        console.error('FALHOU    ', f.name, '\n', (e as Error).message);
        process.exitCode = 1;
        return;
      }
    }
    // Postgres 16+: quem cria um papel não fica com permissão de SET ROLE nele. A app precisa disso em cada pedido.
    if (!supabaseMode) {
      await client.query('grant authenticated, anon to current_user').catch((e) => console.warn('aviso: grant dos papéis falhou:', (e as Error).message));
    }
    console.log('migrações em dia');
  } finally {
    await client.end();
  }
}
main();

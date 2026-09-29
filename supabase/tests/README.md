# Testes SQL (RLS e permissões)

Corre as migrações num Postgres embebido (com stubs de `auth` e das extensões) e valida
vínculos, separação de dados, permissões coach/aluno e correções auditadas.

    pip install pgserver psycopg2-binary
    python supabase/tests/run_rls_tests.py

Nota: `unaccent` e `pg_trgm` são simuladas; valida também com `supabase db reset` (Postgres real do Supabase).

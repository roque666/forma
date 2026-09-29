import pgserver, psycopg2, re, glob, sys, os, shutil

DATA = os.environ.get('PGDATA_DIR', '/tmp/pgdata_test')
shutil.rmtree(DATA, ignore_errors=True)
srv = pgserver.get_server(DATA, cleanup_mode='delete')
conn = psycopg2.connect(srv.get_uri())
conn.autocommit = True
cur = conn.cursor()

STUB = """
create schema if not exists auth;
create schema if not exists extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
create text search dictionary extensions.unaccent (template = pg_catalog.simple);
create function extensions.unaccent(regdictionary, text) returns text language sql immutable as
 $$ select translate($2, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaaeeeeiiiiooooouuuucAAAAEEIOOOUC') $$;
create function extensions.similarity(text, text) returns real language sql immutable as $$ select 0.5::real $$;
"""
cur.execute(STUB)

MIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'migrations', '*.sql')
for f in sorted(glob.glob(MIG)):
    sql = open(f).read()
    sql = re.sub(r'create extension[^;]*;', '', sql)
    sql = re.sub(r'create index \w+ on public\.\w+\s+using gin \([^;]*gin_trgm_ops\);', '', sql)
    try:
        cur.execute(sql)
        print('OK  ', f.split('/')[-1])
    except Exception as e:
        print('FAIL', f.split('/')[-1], '\n', e)
        sys.exit(1)

cur.execute("""
grant usage on schema public, auth, extensions to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant select on auth.users to authenticated;
""")

def mk(email):
    cur.execute("insert into auth.users(email) values (%s) returning id", (email,))
    return cur.fetchone()[0]
C, C2, S1, S2 = mk('c@x.com'), mk('c2@x.com'), mk('s1@x.com'), mk('s2@x.com')
cur.execute("update public.profiles set role='coach', full_name='Coach A' where id=%s", (C,))
cur.execute("update public.profiles set role='coach', full_name='Coach B' where id=%s", (C2,))
cur.execute("update public.profiles set full_name='Aluno 1' where id=%s", (S1,))

passed = failed = 0
def as_user(uid):
    cur.execute("reset role"); cur.execute("select set_config('request.jwt.claim.sub', %s, false)", (str(uid) if uid else '',))
    cur.execute("set role authenticated")
def as_admin():
    cur.execute("reset role"); cur.execute("select set_config('request.jwt.claim.sub', '', false)")

def q(sql, args=None):
    cur.execute(sql, args)
    try: return cur.fetchall()
    except psycopg2.ProgrammingError: return None

def check(name, fn):
    global passed, failed
    try:
        r = fn()
        if r is False: raise AssertionError('condição falsa')
        passed += 1; print('  ✓', name)
    except Exception as e:
        failed += 1; print('  ✗', name, '->', repr(e)[:300])

def expect_error(sql, args=None, code=None, msg=None):
    try:
        cur.execute(sql, args)
    except psycopg2.Error as e:
        if code and e.pgcode != code: raise AssertionError(f'esperava {code}, veio {e.pgcode}: {e.pgerror}')
        if msg and msg not in (e.pgerror or ''): raise AssertionError(f'mensagem inesperada: {e.pgerror}')
        return True
    raise AssertionError('deveria ter falhado')

def rowcount(sql, args=None):
    cur.execute(sql, args); return cur.rowcount

exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cases.py')).read())
print(f'\n{passed} passaram, {failed} falharam')
sys.exit(1 if failed else 0)

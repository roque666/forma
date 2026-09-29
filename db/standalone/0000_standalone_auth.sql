-- 0000_standalone_auth.sql
-- Apenas para instalações SEM Supabase (o runner aplica-o primeiro).
-- Cria o essencial que as migrações seguintes esperam: schema auth (users + auth.uid()),
-- roles authenticated/anon e privilégios por defeito.
-- Em Supabase estes objetos já existem e este ficheiro NÃO deve ser aplicado.

create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists users_email_lower_uidx on auth.users (lower(email));

-- O utilizador autenticado do pedido atual (definido pela app em cada transação).
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;

grant usage on schema public, extensions to authenticated, anon;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated, anon;

alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

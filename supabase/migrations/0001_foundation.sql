-- 0001_foundation.sql
-- Perfis, vínculo coach/aluno e funções de permissão usadas por todas as políticas RLS.

create type public.user_role as enum ('student', 'coach');
create type public.link_status as enum ('pending', 'active', 'ended');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'student',
  full_name text not null default '',
  avatar_url text,
  timezone text not null default 'Europe/Lisbon',
  must_change_password boolean not null default false,
  onboarded_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_students (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete cascade,
  status public.link_status not null default 'pending',
  origin text not null default 'invite' check (origin in ('invite', 'coach_created')),
  invite_email text,
  consent_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- só há vínculo ativo com aluno identificado e consentimento dado
  check (status <> 'active' or (student_id is not null and consent_at is not null))
);

-- Regra de negócio: no máximo 1 coach ativo por aluno (imposta na base de dados).
create unique index one_active_coach_per_student
  on public.coach_students (student_id) where status = 'active';
create index coach_students_coach_idx on public.coach_students (coach_id, status);

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- security definer: lê coach_students sem depender das políticas RLS dessa tabela (evita recursão).
create or replace function public.is_coach_of(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_students cs
    where cs.coach_id = auth.uid()
      and cs.student_id = target
      and cs.status = 'active'
  );
$$;

create or replace function public.can_access_student(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select target = auth.uid() or public.is_coach_of(target);
$$;

-- ---------------------------------------------------------------- novo utilizador
-- O papel é SEMPRE 'student'. Nunca ler o papel de raw_user_meta_data (controlado pelo cliente).
-- Coaches são promovidos no servidor (service role) por um administrador.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Impede que um utilizador autenticado altere o próprio papel ou a origem da conta.
-- (service role tem auth.uid() nulo e pode alterar.)
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (
       new.role is distinct from old.role
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Não é permitido alterar role ou created_by' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_protect_columns before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.coach_students enable row level security;

create policy profiles_select on public.profiles
  for select using (public.can_access_student (id));

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid ()) with check (id = auth.uid ());

-- coach_students: leitura pelas duas partes. Escrita apenas no servidor (service role),
-- através de Server Actions que validam convites, consentimento e a regra de 1 coach ativo.
create policy coach_students_select on public.coach_students
  for select using (coach_id = auth.uid () or student_id = auth.uid ());

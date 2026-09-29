-- 0005_app.sql
-- Camada da aplicação: autenticação própria (schema privado), agendamento semanal dos dias de treino
-- e sistema de Personal Records (detetados na base de dados, recalculados a partir do histórico).

-- =========================================================== 1. Schema privado (nunca acessível pelo role authenticated)
create schema if not exists private;
revoke all on schema private from public;

create table private.sessions (
  token_hash text primary key,                      -- SHA-256 do token do cookie (o token em claro nunca é guardado)
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text,
  ip text
);
create index private_sessions_user_idx on private.sessions (user_id);
create index private_sessions_expiry_idx on private.sessions (expires_at);

create table private.login_attempts (
  id bigint generated always as identity primary key,
  identifier text not null,                          -- email normalizado
  ip text,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index private_login_attempts_idx on private.login_attempts (identifier, created_at desc);
create index private_login_attempts_ip_idx on private.login_attempts (ip, created_at desc);

create table private.password_resets (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index private_password_resets_user_idx on private.password_resets (user_id);

-- =========================================================== 2. Agendamento semanal dos dias de treino
-- 1 = segunda ... 7 = domingo. Vazio => o "próximo treino" segue a rotação do plano.
alter table public.workout_days
  add column weekdays smallint[] not null default '{}'
  check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]);

-- =========================================================== 3. Personal Records
create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  pr_type text not null check (pr_type in
    ('max_weight', 'est_1rm', 'max_reps', 'best_set_volume', 'session_volume', 'reps_at_weight')),
  weight_key numeric(6, 2) not null default 0,       -- só usado por reps_at_weight (o peso a que se contam as reps)
  value numeric(10, 2) not null,
  weight_kg numeric(6, 2),
  reps smallint,
  set_id uuid references public.session_sets (id) on delete set null,
  session_id uuid references public.workout_sessions (id) on delete set null,
  achieved_at timestamptz not null,
  unique (student_id, exercise_id, pr_type, weight_key)
);
create index personal_records_student_idx on public.personal_records (student_id, achieved_at desc);

-- Um evento por cada recorde ULTRAPASSADO (o primeiro registo de um exercício não é um PR).
create table public.pr_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  exercise_name text not null,
  pr_type text not null,
  weight_key numeric(6, 2) not null default 0,
  value numeric(10, 2) not null,
  previous_value numeric(10, 2) not null,
  weight_kg numeric(6, 2),
  reps smallint,
  set_id uuid references public.session_sets (id) on delete set null,
  session_id uuid references public.workout_sessions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index pr_events_student_idx on public.pr_events (student_id, created_at desc);
create index pr_events_set_idx on public.pr_events (set_id);

alter table public.personal_records enable row level security;
alter table public.pr_events enable row level security;
-- Só leitura para aluno e coach. Nenhuma política de escrita: apenas os triggers (security definer) escrevem.
create policy personal_records_select on public.personal_records
  for select using (public.can_access_student (student_id));
create policy pr_events_select on public.pr_events
  for select using (public.can_access_student (student_id));

-- Recalcula os recordes de um exercício a partir das séries concluídas (fonte de verdade = histórico).
create or replace function public.refresh_exercise_prs(p_student uuid, p_exercise uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record; o record; v_name text;
begin
  select name into v_name from public.exercises where id = p_exercise;

  create temporary table if not exists _pr_cands (
    t text, wk numeric, val numeric, set_id uuid, session_id uuid, weight numeric, reps int, at timestamptz
  ) on commit drop;
  truncate _pr_cands;

  insert into _pr_cands
  with valid as (
    select ss.id as set_id, se.session_id, ss.weight_kg::numeric as weight_kg, ss.reps::int as reps,
           coalesce(ss.completed_at, w.started_at) as at, w.status
    from public.session_sets ss
    join public.session_exercises se on se.id = ss.session_exercise_id
    join public.workout_sessions w on w.id = se.session_id
    where ss.student_id = p_student and se.exercise_id = p_exercise
      and ss.completed and ss.set_type = 'normal' and coalesce(ss.reps, 0) > 0
      and w.status <> 'discarded'
  )
  (select 'max_weight', 0::numeric, weight_kg, set_id, session_id, weight_kg, reps, at
     from valid where weight_kg > 0 order by 3 desc, 8 asc limit 1)
  union all
  (select 'est_1rm', 0::numeric, round(weight_kg * (1 + reps / 30.0), 1), set_id, session_id, weight_kg, reps, at
     from valid where weight_kg > 0 and reps between 1 and 12 order by 3 desc, 8 asc limit 1)
  union all
  (select 'max_reps', 0::numeric, reps::numeric, set_id, session_id, weight_kg, reps, at
     from valid order by 3 desc, 8 asc limit 1)
  union all
  (select 'best_set_volume', 0::numeric, weight_kg * reps, set_id, session_id, weight_kg, reps, at
     from valid where weight_kg > 0 order by 3 desc, 8 asc limit 1)
  union all
  (select 'reps_at_weight', v.weight_kg, v.reps::numeric, v.set_id, v.session_id, v.weight_kg, v.reps, v.at
     from (select distinct on (weight_kg) * from valid where weight_kg > 0
           order by weight_kg, reps desc, at asc) v)
  union all
  (select 'session_volume', 0::numeric, sum(weight_kg * reps), null::uuid, session_id, null::numeric, null::int, max(at)
     from valid where status = 'completed' and weight_kg > 0
     group by session_id order by 3 desc, 8 asc limit 1);

  for c in select * from _pr_cands loop
    select * into o from public.personal_records
      where student_id = p_student and exercise_id = p_exercise and pr_type = c.t and weight_key = c.wk;

    if not found then
      insert into public.personal_records (student_id, exercise_id, pr_type, weight_key, value, weight_kg, reps, set_id, session_id, achieved_at)
      values (p_student, p_exercise, c.t, c.wk, c.val, c.weight, c.reps, c.set_id, c.session_id, c.at);
    elsif c.val > o.value then
      update public.personal_records
         set value = c.val, weight_kg = c.weight, reps = c.reps, set_id = c.set_id, session_id = c.session_id, achieved_at = c.at
       where id = o.id;
      insert into public.pr_events (student_id, exercise_id, exercise_name, pr_type, weight_key, value, previous_value, weight_kg, reps, set_id, session_id)
      values (p_student, p_exercise, coalesce(v_name, '?'), c.t, c.wk, c.val, o.value, c.weight, c.reps, c.set_id, c.session_id);
    else
      -- igual ou inferior (séries editadas/apagadas): o histórico manda, sem evento.
      update public.personal_records
         set value = c.val, weight_kg = c.weight, reps = c.reps, set_id = c.set_id, session_id = c.session_id, achieved_at = c.at
       where id = o.id;
    end if;
  end loop;

  delete from public.personal_records pr
   where pr.student_id = p_student and pr.exercise_id = p_exercise
     and not exists (select 1 from _pr_cands x where x.t = pr.pr_type and x.wk = pr.weight_key);
end $$;
revoke execute on function public.refresh_exercise_prs (uuid, uuid) from public, authenticated, anon;

create or replace function public.trg_session_sets_prs()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_se uuid; v_st uuid; v_ex uuid;
begin
  if tg_op = 'INSERT' and not new.completed then return null; end if;
  if tg_op = 'UPDATE'
     and (new.completed, new.weight_kg, new.reps, new.set_type)
         is not distinct from (old.completed, old.weight_kg, old.reps, old.set_type) then
    return null;
  end if;
  v_se := coalesce(new.session_exercise_id, old.session_exercise_id);
  v_st := coalesce(new.student_id, old.student_id);
  select exercise_id into v_ex from public.session_exercises where id = v_se;
  if v_ex is not null then perform public.refresh_exercise_prs (v_st, v_ex); end if;
  return null;
end $$;
create trigger session_sets_prs after insert or update or delete on public.session_sets
  for each row execute function public.trg_session_sets_prs ();

-- Ao concluir/descartar uma sessão, recalcula (o volume da sessão só conta sessões concluídas).
create or replace function public.trg_session_status_prs()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct exercise_id from public.session_exercises
           where session_id = new.id and exercise_id is not null loop
    perform public.refresh_exercise_prs (new.student_id, r.exercise_id);
  end loop;
  return null;
end $$;
create trigger workout_sessions_prs after update of status on public.workout_sessions
  for each row when (old.status is distinct from new.status)
  execute function public.trg_session_status_prs ();

-- Recalcula tudo de um aluno (usado depois de apagar sessões, cujo cascade não passa pelos triggers).
create or replace function public.refresh_all_prs(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if auth.uid () is not null and auth.uid () <> p_student then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  for r in
    select distinct exercise_id from public.session_exercises se
      join public.workout_sessions w on w.id = se.session_id
      where w.student_id = p_student and se.exercise_id is not null
    union
    select distinct exercise_id from public.personal_records where student_id = p_student
  loop
    perform public.refresh_exercise_prs (p_student, r.exercise_id);
  end loop;
end $$;

-- =========================================================== 4. Visibilidade do coach para o aluno
-- O aluno pode ver o perfil básico dos seus coaches ativos (nome/foto em "criado por...", perfil, etc.).
create policy profiles_select_my_coach on public.profiles
  for select using (
    exists (
      select 1 from public.coach_students cs
      where cs.student_id = auth.uid () and cs.coach_id = profiles.id and cs.status = 'active'
    )
  );

-- =========================================================== 5. duplicate_plan passa a copiar também os dias da semana
create or replace function public.duplicate_plan(
  p_plan_id uuid,
  p_target_student uuid default null,
  p_as_template boolean default false,
  p_name text default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_src public.workout_plans;
  v_new uuid; v_day uuid; v_pe uuid;
  d record; e record;
begin
  select * into v_src from public.workout_plans where id = p_plan_id;   -- a RLS limita ao que o utilizador vê
  if not found then
    raise exception 'Plano não encontrado' using errcode = 'P0002';
  end if;

  insert into public.workout_plans (student_id, created_by, name, description, is_template, is_active)
  values (
    case when p_as_template then null else coalesce(p_target_student, v_src.student_id) end,
    auth.uid (),
    coalesce(p_name, v_src.name || ' (cópia)'),
    v_src.description,
    p_as_template,
    false
  ) returning id into v_new;

  for d in select * from public.workout_days where plan_id = p_plan_id order by position loop
    insert into public.workout_days (plan_id, name, position, weekdays)
    values (v_new, d.name, d.position, d.weekdays) returning id into v_day;
    for e in select * from public.plan_exercises where day_id = d.id order by position loop
      insert into public.plan_exercises (plan_id, day_id, exercise_id, position, rest_seconds, notes)
      values (v_new, v_day, e.exercise_id, e.position, e.rest_seconds, e.notes) returning id into v_pe;
      insert into public.plan_sets (plan_id, plan_exercise_id, set_number, set_type, target_reps_min, target_reps_max, target_weight_kg, target_rir)
      select v_new, v_pe, set_number, set_type, target_reps_min, target_reps_max, target_weight_kg, target_rir
      from public.plan_sets where plan_exercise_id = e.id;
    end loop;
  end loop;
  return v_new;
end $$;

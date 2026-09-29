-- 0003_training.sql
-- Biblioteca de exercícios, planos (plano → dias → exercícios → séries) e sessões executadas.
-- Princípio: o PLANO é o que foi planeado; a SESSÃO é uma cópia (snapshot) do que foi executado.
-- Permissões: aluno e coach (vínculo ativo) editam planos; só o aluno regista sessões.

create type public.muscle_group as enum (
  'chest', 'upper_back', 'lats', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'obliques',
  'lower_back', 'traps', 'glutes', 'quads', 'hamstrings', 'calves', 'adductors', 'full_body', 'cardio'
);
create type public.exercise_tracking as enum ('weight_reps', 'bodyweight_reps', 'duration');
create type public.session_status as enum ('in_progress', 'completed', 'discarded');

create or replace function public.is_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'coach');
$$;

-- =========================================================== exercícios
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  primary_muscle public.muscle_group not null,
  secondary_muscles public.muscle_group[] not null default '{}',
  equipment text,
  instructions text,
  tracking_type public.exercise_tracking not null default 'weight_reps',
  media_url text,                                   -- imagem/vídeo (futuro)
  source text not null default 'user' check (source in ('system', 'user', 'coach')),
  owner_id uuid references public.profiles (id) on delete cascade,
  archived_at timestamptz,                          -- exercícios com histórico são arquivados, nunca apagados
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_id is null) = (source = 'system'))
);
create trigger exercises_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();
create index exercises_owner_idx on public.exercises (owner_id) where owner_id is not null;
create index exercises_muscle_idx on public.exercises (primary_muscle);
create index exercises_name_trgm on public.exercises
  using gin (public.f_unaccent (lower(name)) extensions.gin_trgm_ops);

-- =========================================================== planos
create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles (id) on delete cascade,   -- null = modelo (template) do coach
  created_by uuid not null default auth.uid () references public.profiles (id),
  updated_by uuid references public.profiles (id),
  name text not null check (length(trim(name)) > 0),
  description text,
  is_template boolean not null default false,
  is_active boolean not null default false,          -- "plano atual" do aluno
  archived_at timestamptz,
  version integer not null default 1,                -- controlo de versão otimista (aluno e coach editam)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_template and student_id is null and not is_active) or (not is_template and student_id is not null))
);
create unique index one_active_plan_per_student on public.workout_plans (student_id)
  where is_active and archived_at is null and not is_template;
create index workout_plans_student_idx on public.workout_plans (student_id, archived_at);
create index workout_plans_template_idx on public.workout_plans (created_by) where is_template;

create or replace function public.plan_before_update()
returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_by := auth.uid ();
  new.updated_at := now();
  return new;
end $$;
create trigger workout_plans_before_update before update on public.workout_plans
  for each row execute function public.plan_before_update();

-- plan_id é replicado nas tabelas filhas com chaves compostas: a base de dados garante
-- que dia, exercício e séries pertencem sempre ao mesmo plano (e simplifica a RLS).
create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  position smallint not null default 0,
  unique (id, plan_id)
);
create index workout_days_plan_idx on public.workout_days (plan_id, position);

create table public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  day_id uuid not null,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position smallint not null default 0,
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 1800),
  notes text,
  unique (id, plan_id),
  foreign key (day_id, plan_id) references public.workout_days (id, plan_id) on delete cascade
);
create index plan_exercises_day_idx on public.plan_exercises (day_id, position);
create index plan_exercises_exercise_idx on public.plan_exercises (exercise_id);

create table public.plan_sets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  plan_exercise_id uuid not null,
  set_number smallint not null check (set_number > 0),
  set_type text not null default 'normal' check (set_type in ('normal', 'warmup')),
  target_reps_min smallint check (target_reps_min > 0),
  target_reps_max smallint check (target_reps_max > 0),
  target_weight_kg numeric(6, 2) check (target_weight_kg >= 0),
  target_rir numeric(3, 1) check (target_rir between 0 and 10),
  check (target_reps_max is null or target_reps_min is null or target_reps_max >= target_reps_min),
  foreign key (plan_exercise_id, plan_id) references public.plan_exercises (id, plan_id) on delete cascade
);
create index plan_sets_exercise_idx on public.plan_sets (plan_exercise_id, set_number);

-- Qualquer alteração a dias/exercícios/séries "toca" no plano → incrementa a versão.
create or replace function public.touch_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.workout_plans set updated_at = now() where id = coalesce(new.plan_id, old.plan_id);
  return null;
end $$;
create trigger workout_days_touch after insert or update or delete on public.workout_days
  for each row execute function public.touch_plan();
create trigger plan_exercises_touch after insert or update or delete on public.plan_exercises
  for each row execute function public.touch_plan();
create trigger plan_sets_touch after insert or update or delete on public.plan_sets
  for each row execute function public.touch_plan();

-- =========================================================== sessões executadas
-- student_id replicado + chaves compostas: mesma ideia dos planos.
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid () references public.profiles (id) on delete cascade,
  plan_id uuid references public.workout_plans (id) on delete set null,
  plan_day_id uuid references public.workout_days (id) on delete set null,
  plan_name text,                                    -- snapshots: sobrevivem a edições/remoções do plano
  day_name text,
  status public.session_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, student_id),
  check (status <> 'completed' or ended_at is not null)
);
create unique index one_session_in_progress on public.workout_sessions (student_id) where status = 'in_progress';
create index workout_sessions_student_idx on public.workout_sessions (student_id, started_at desc);
create trigger workout_sessions_updated_at before update on public.workout_sessions
  for each row execute function public.set_updated_at();

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  student_id uuid not null default auth.uid () references public.profiles (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  exercise_name text not null,                       -- snapshot
  plan_exercise_id uuid references public.plan_exercises (id) on delete set null,
  position smallint not null default 0,
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 1800),
  notes text,
  unique (id, student_id),
  foreign key (session_id, student_id) references public.workout_sessions (id, student_id) on delete cascade
);
create index session_exercises_session_idx on public.session_exercises (session_id, position);
create index session_exercises_exercise_idx on public.session_exercises (exercise_id);

create table public.session_sets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null,
  student_id uuid not null default auth.uid () references public.profiles (id) on delete cascade,
  set_number smallint not null check (set_number > 0),
  set_type text not null default 'normal' check (set_type in ('normal', 'warmup')),
  -- o que estava planeado (snapshot)
  planned_weight_kg numeric(6, 2),
  planned_reps_min smallint,
  planned_reps_max smallint,
  -- o que foi realmente executado
  weight_kg numeric(6, 2) check (weight_kg >= 0),
  reps smallint check (reps >= 0),
  rir numeric(3, 1) check (rir between 0 and 10),    -- RPE = 10 − RIR (a UI escolhe o que mostrar)
  notes text,
  completed boolean not null default false,
  completed_at timestamptz,
  foreign key (session_exercise_id, student_id) references public.session_exercises (id, student_id) on delete cascade
);
create index session_sets_exercise_idx on public.session_sets (session_exercise_id, set_number);

-- =========================================================== funções de permissão
create or replace function public.can_read_plan(p_plan_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workout_plans p
    where p.id = p_plan_id
      and case when p.is_template then p.created_by = auth.uid () else public.can_access_student (p.student_id) end
  );
$$;

create or replace function public.can_write_plan(p_plan_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workout_plans p
    where p.id = p_plan_id
      and case when p.is_template then p.created_by = auth.uid ()
               else (p.student_id = auth.uid () or public.is_coach_of (p.student_id)) end
  );
$$;

-- =========================================================== RLS
alter table public.exercises enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_days enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.plan_sets enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.session_sets enable row level security;

-- exercícios: globais + próprios + do coach do aluno + os usados em planos/sessões visíveis
create policy exercises_select on public.exercises
  for select using (
    owner_id is null
    or owner_id = auth.uid ()
    or exists (
      select 1 from public.coach_students cs
      where cs.coach_id = exercises.owner_id and cs.student_id = auth.uid () and cs.status = 'active'
    )
    or exists (select 1 from public.plan_exercises pe where pe.exercise_id = exercises.id and public.can_read_plan (pe.plan_id))
    or exists (select 1 from public.session_exercises se where se.exercise_id = exercises.id and public.can_access_student (se.student_id))
  );
create policy exercises_insert on public.exercises
  for insert with check (
    owner_id = auth.uid ()
    and (source = 'user' or (source = 'coach' and public.is_coach ()))
  );
create policy exercises_update on public.exercises
  for update using (owner_id = auth.uid ()) with check (owner_id = auth.uid ());
create policy exercises_delete on public.exercises
  for delete using (owner_id = auth.uid ());

-- planos
create policy workout_plans_select on public.workout_plans
  for select using (
    case when is_template then created_by = auth.uid () else public.can_access_student (student_id) end
  );
create policy workout_plans_insert on public.workout_plans
  for insert with check (
    created_by = auth.uid ()
    and (
      (is_template and public.is_coach ())
      or (not is_template and (student_id = auth.uid () or public.is_coach_of (student_id)))
    )
  );
create policy workout_plans_update on public.workout_plans
  for update using (
    case when is_template then created_by = auth.uid () else (student_id = auth.uid () or public.is_coach_of (student_id)) end
  ) with check (
    case when is_template then created_by = auth.uid () else (student_id = auth.uid () or public.is_coach_of (student_id)) end
  );
create policy workout_plans_delete on public.workout_plans
  for delete using (
    case when is_template then created_by = auth.uid () else (student_id = auth.uid () or public.is_coach_of (student_id)) end
  );

create policy workout_days_select on public.workout_days for select using (public.can_read_plan (plan_id));
create policy workout_days_write on public.workout_days for all
  using (public.can_write_plan (plan_id)) with check (public.can_write_plan (plan_id));
create policy plan_exercises_select on public.plan_exercises for select using (public.can_read_plan (plan_id));
create policy plan_exercises_write on public.plan_exercises for all
  using (public.can_write_plan (plan_id)) with check (public.can_write_plan (plan_id));
create policy plan_sets_select on public.plan_sets for select using (public.can_read_plan (plan_id));
create policy plan_sets_write on public.plan_sets for all
  using (public.can_write_plan (plan_id)) with check (public.can_write_plan (plan_id));

-- sessões: aluno escreve, coach só lê (correções só pelas funções explícitas de 0004)
create policy workout_sessions_select on public.workout_sessions
  for select using (public.can_access_student (student_id));
create policy workout_sessions_write on public.workout_sessions
  for all using (student_id = auth.uid ()) with check (student_id = auth.uid ());
create policy session_exercises_select on public.session_exercises
  for select using (public.can_access_student (student_id));
create policy session_exercises_write on public.session_exercises
  for all using (student_id = auth.uid ()) with check (student_id = auth.uid ());
create policy session_sets_select on public.session_sets
  for select using (public.can_access_student (student_id));
create policy session_sets_write on public.session_sets
  for all using (student_id = auth.uid ()) with check (student_id = auth.uid ());

-- =========================================================== funções de negócio (security invoker)
-- Pesquisa de exercícios sem acentos, com filtro opcional por músculo (principal ou secundário).
create or replace function public.search_exercises(
  q text default '', p_muscle public.muscle_group default null, max_results int default 30
) returns setof public.exercises
language sql stable security invoker set search_path = public, extensions as $$
  select e.*
  from public.exercises e
  where e.archived_at is null
    and public.f_unaccent (lower(e.name)) like '%' || replace(replace(public.f_unaccent (lower(q)), '%', '\%'), '_', '\_') || '%'
    and (p_muscle is null or e.primary_muscle = p_muscle or p_muscle = any (e.secondary_muscles))
  order by
    (public.f_unaccent (lower(e.name)) like replace(replace(public.f_unaccent (lower(q)), '%', '\%'), '_', '\_') || '%') desc,
    e.name
  limit least(greatest(max_results, 1), 100);
$$;

-- Copia um plano (dias → exercícios → séries). Serve para:
--   duplicar o próprio plano · atribuir um modelo a um aluno · guardar como modelo.
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
    insert into public.workout_days (plan_id, name, position) values (v_new, d.name, d.position) returning id into v_day;
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

-- Define o "plano atual" do aluno (desativa o anterior).
create or replace function public.activate_plan(p_plan_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_student uuid;
begin
  select student_id into v_student from public.workout_plans where id = p_plan_id and not is_template;
  if v_student is null then
    raise exception 'Plano não encontrado' using errcode = 'P0002';
  end if;
  update public.workout_plans set is_active = false where student_id = v_student and is_active and id <> p_plan_id;
  update public.workout_plans set is_active = true, archived_at = null where id = p_plan_id;
end $$;

-- Inicia uma sessão: copia o dia do plano (nomes, descansos, séries planeadas) para a sessão.
-- Só o próprio aluno pode iniciar sessões nos seus planos. Sem dia => treino livre.
create or replace function public.start_workout_session(p_plan_day_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_session uuid; v_se uuid; rec record;
begin
  if p_plan_day_id is null then
    insert into public.workout_sessions (student_id) values (auth.uid ()) returning id into v_session;
    return v_session;
  end if;

  insert into public.workout_sessions (student_id, plan_id, plan_day_id, plan_name, day_name)
  select auth.uid (), p.id, d.id, p.name, d.name
  from public.workout_days d join public.workout_plans p on p.id = d.plan_id
  where d.id = p_plan_day_id and p.student_id = auth.uid ()
  returning id into v_session;

  if v_session is null then
    raise exception 'Dia de treino não encontrado' using errcode = 'P0002';
  end if;

  for rec in
    select pe.id as pe_id, pe.exercise_id, pe.position as pos, pe.rest_seconds, pe.notes, e.name as ex_name
    from public.plan_exercises pe join public.exercises e on e.id = pe.exercise_id
    where pe.day_id = p_plan_day_id order by pe.position
  loop
    insert into public.session_exercises (session_id, student_id, exercise_id, exercise_name, plan_exercise_id, position, rest_seconds, notes)
    values (v_session, auth.uid (), rec.exercise_id, rec.ex_name, rec.pe_id, rec.pos, rec.rest_seconds, rec.notes)
    returning id into v_se;

    insert into public.session_sets (session_exercise_id, student_id, set_number, set_type, planned_weight_kg, planned_reps_min, planned_reps_max)
    select v_se, auth.uid (), ps.set_number, ps.set_type, ps.target_weight_kg, ps.target_reps_min, ps.target_reps_max
    from public.plan_sets ps where ps.plan_exercise_id = rec.pe_id;
  end loop;
  return v_session;
end $$;

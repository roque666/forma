-- 0002_nutrition.sql
-- Perfil nutricional, metas (com histórico), alimentos, refeições, diário e acompanhamento corporal.
-- Permissões: aluno lê/escreve os seus dados; coach (vínculo ativo) só LÊ registos e pode DEFINIR metas.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.activity_level as enum ('sedentary', 'light', 'moderate', 'very_active', 'extra_active');
create type public.nutrition_goal_type as enum ('cut', 'maintenance', 'bulk');
create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout', 'other');

-- Wrapper imutável para poder indexar pesquisas sem acentos.
create or replace function public.f_unaccent(text)
returns text language sql immutable parallel safe strict
set search_path = extensions, public as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

-- =========================================================== perfil nutricional
create table public.nutrition_profiles (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  sex text not null check (sex in ('male', 'female')),          -- usado pela fórmula BMR
  birth_date date not null,                                      -- a idade é calculada, nunca guardada
  height_cm numeric(5, 1) not null check (height_cm between 100 and 250),
  activity_level public.activity_level not null default 'moderate',
  bmr_formula text not null default 'mifflin_st_jeor' check (bmr_formula in ('mifflin_st_jeor', 'katch_mcardle')),
  kcal_tolerance_pct smallint not null default 10 check (kcal_tolerance_pct between 1 and 50),
  updated_at timestamptz not null default now()
);
create trigger nutrition_profiles_updated_at before update on public.nutrition_profiles
  for each row execute function public.set_updated_at();

-- =========================================================== metas (append-only = histórico)
create table public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  goal_type public.nutrition_goal_type not null,
  -- snapshot dos dados usados no cálculo (para o histórico continuar a fazer sentido)
  sex text not null check (sex in ('male', 'female')),
  age_years smallint not null check (age_years between 14 and 100),
  height_cm numeric(5, 1) not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 25 and 400),
  body_fat_pct numeric(4, 1) check (body_fat_pct between 2 and 70),
  activity_level public.activity_level not null,
  bmr_formula text not null check (bmr_formula in ('mifflin_st_jeor', 'katch_mcardle')),
  -- resultados
  bmr integer not null,
  activity_factor numeric(4, 3) not null,
  tdee integer not null,
  adjustment_pct numeric(4, 1) not null,            -- com sinal: CUT < 0, BULK > 0
  calories_calculated integer not null,
  calories_target integer not null check (calories_target between 800 and 10000),
  is_manual_override boolean not null default false,
  protein_g integer not null check (protein_g >= 0),
  carbs_g integer not null check (carbs_g >= 0),
  fat_g integer not null check (fat_g >= 0),
  fiber_g integer check (fiber_g >= 0),
  protein_g_per_kg numeric(3, 2),
  fat_g_per_kg numeric(3, 2),
  -- auditoria
  set_by uuid not null default auth.uid () references public.profiles (id),
  note text,
  valid_from date not null default current_date,    -- a app deve enviar a data no fuso do utilizador
  created_at timestamptz not null default now(),
  check (
    (goal_type = 'cut' and adjustment_pct <= 0)
    or (goal_type = 'maintenance' and adjustment_pct = 0)
    or (goal_type = 'bulk' and adjustment_pct >= 0)
  )
);
create index nutrition_goals_student_idx on public.nutrition_goals (student_id, valid_from desc, created_at desc);

-- Meta em vigor hoje.
create view public.current_nutrition_goal with (security_invoker = true) as
select distinct on (student_id) *
from public.nutrition_goals
where valid_from <= current_date
order by student_id, valid_from desc, created_at desc;

-- =========================================================== base de alimentos
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  brand text,
  category text,
  kcal_100g numeric(7, 2) not null check (kcal_100g between 0 and 950),
  protein_100g numeric(6, 2) not null check (protein_100g between 0 and 100),
  carbs_100g numeric(6, 2) not null check (carbs_100g between 0 and 100),
  fat_100g numeric(6, 2) not null check (fat_100g between 0 and 100),
  fiber_100g numeric(6, 2) check (fiber_100g between 0 and 100),
  density_g_per_ml numeric(5, 3) check (density_g_per_ml > 0),
  barcode text,
  -- origem: 'system' (base inicial), 'external' (API futura), 'user', 'coach'
  source text not null default 'user' check (source in ('system', 'external', 'user', 'coach')),
  external_provider text,                           -- ex.: 'openfoodfacts'
  external_id text,
  owner_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (protein_100g + carbs_100g + fat_100g <= 100.5),
  check ((owner_id is null) = (source in ('system', 'external')))
);
create trigger foods_updated_at before update on public.foods
  for each row execute function public.set_updated_at();
create unique index foods_external_uidx on public.foods (external_provider, external_id)
  where external_id is not null;
create index foods_barcode_idx on public.foods (barcode) where barcode is not null;
create index foods_owner_idx on public.foods (owner_id) where owner_id is not null;
create index foods_search_trgm on public.foods
  using gin (public.f_unaccent (lower(name || ' ' || coalesce(brand, ''))) extensions.gin_trgm_ops);

-- Equivalências (1 banana = 120 g, 1 ovo = 50 g...).
create table public.food_servings (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete cascade,
  label text not null,
  grams numeric(7, 2) not null check (grams > 0)
);
create index food_servings_food_idx on public.food_servings (food_id);

-- Pesquisa sem acentos e sem distinguir maiúsculas ("frango" encontra "Frango grelhado").
-- security invoker: respeita a RLS de quem chama.
create or replace function public.search_foods(q text, max_results int default 20)
returns setof public.foods
language sql stable security invoker set search_path = public, extensions as $$
  select f.*
  from public.foods f
  where public.f_unaccent (lower(f.name || ' ' || coalesce(f.brand, '')))
        like '%' || replace(replace(public.f_unaccent (lower(q)), '%', '\%'), '_', '\_') || '%'
  order by
    (public.f_unaccent (lower(f.name)) like replace(replace(public.f_unaccent (lower(q)), '%', '\%'), '_', '\_') || '%') desc,
    similarity(public.f_unaccent (lower(f.name)), public.f_unaccent (lower(q))) desc,
    f.name
  limit least(greatest(max_results, 1), 50);
$$;

-- =========================================================== refeições e diário
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid () references public.profiles (id) on delete cascade,
  log_date date not null,                           -- data no fuso do utilizador
  meal_type public.meal_type not null,
  name text,                                        -- nome personalizado opcional
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meals_student_date_idx on public.meals (student_id, log_date);
create trigger meals_updated_at before update on public.meals
  for each row execute function public.set_updated_at();

-- Os valores nutricionais são guardados no momento do registo (snapshot):
-- editar ou apagar um alimento no futuro não altera o histórico.
create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals (id) on delete cascade,
  food_id uuid references public.foods (id) on delete set null,
  name text not null,
  quantity numeric(8, 2) not null check (quantity > 0),
  unit text not null check (unit in ('g', 'ml', 'unit')),
  kcal numeric(8, 1) not null check (kcal >= 0),
  protein_g numeric(7, 1) not null check (protein_g >= 0),
  carbs_g numeric(7, 1) not null check (carbs_g >= 0),
  fat_g numeric(7, 1) not null check (fat_g >= 0),
  fiber_g numeric(7, 1) check (fiber_g >= 0),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index meal_items_meal_idx on public.meal_items (meal_id);

-- Refeições guardadas / favoritas (reutilizáveis noutros dias).
create table public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid () references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  default_meal_type public.meal_type,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_meals_owner_idx on public.saved_meals (owner_id, is_favorite desc, name);
create trigger saved_meals_updated_at before update on public.saved_meals
  for each row execute function public.set_updated_at();

create table public.saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  saved_meal_id uuid not null references public.saved_meals (id) on delete cascade,
  food_id uuid references public.foods (id) on delete set null,
  name text not null,
  quantity numeric(8, 2) not null check (quantity > 0),
  unit text not null check (unit in ('g', 'ml', 'unit')),
  kcal numeric(8, 1) not null check (kcal >= 0),
  protein_g numeric(7, 1) not null check (protein_g >= 0),
  carbs_g numeric(7, 1) not null check (carbs_g >= 0),
  fat_g numeric(7, 1) not null check (fat_g >= 0),
  fiber_g numeric(7, 1) check (fiber_g >= 0),
  position smallint not null default 0
);
create index saved_meal_items_idx on public.saved_meal_items (saved_meal_id);

-- ---- Funções: duplicar, guardar como favorita, reutilizar (security invoker: RLS aplica-se)
create or replace function public.duplicate_meal(
  p_meal_id uuid, p_target_date date, p_meal_type public.meal_type default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_new uuid;
begin
  insert into public.meals (student_id, log_date, meal_type, name, notes)
  select student_id, p_target_date, coalesce(p_meal_type, meal_type), name, notes
  from public.meals where id = p_meal_id and student_id = auth.uid ()
  returning id into v_new;

  if v_new is null then
    raise exception 'Refeição não encontrada' using errcode = 'P0002';
  end if;

  insert into public.meal_items (meal_id, food_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, fiber_g, position)
  select v_new, food_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, fiber_g, position
  from public.meal_items where meal_id = p_meal_id;
  return v_new;
end $$;

create or replace function public.save_meal_as_template(
  p_meal_id uuid, p_name text, p_favorite boolean default true
) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_new uuid;
begin
  insert into public.saved_meals (owner_id, name, default_meal_type, is_favorite)
  select student_id, p_name, meal_type, p_favorite
  from public.meals where id = p_meal_id and student_id = auth.uid ()
  returning id into v_new;

  if v_new is null then
    raise exception 'Refeição não encontrada' using errcode = 'P0002';
  end if;

  insert into public.saved_meal_items (saved_meal_id, food_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, fiber_g, position)
  select v_new, food_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, fiber_g, position
  from public.meal_items where meal_id = p_meal_id;
  return v_new;
end $$;

create or replace function public.apply_saved_meal(
  p_saved_id uuid, p_target_date date, p_meal_type public.meal_type default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_new uuid;
begin
  insert into public.meals (student_id, log_date, meal_type, name)
  select owner_id, p_target_date, coalesce(p_meal_type, default_meal_type, 'other'), name
  from public.saved_meals where id = p_saved_id and owner_id = auth.uid ()
  returning id into v_new;

  if v_new is null then
    raise exception 'Refeição guardada não encontrada' using errcode = 'P0002';
  end if;

  insert into public.meal_items (meal_id, food_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, fiber_g, position)
  select v_new, food_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, fiber_g, position
  from public.saved_meal_items where saved_meal_id = p_saved_id;
  return v_new;
end $$;

-- ---- Totais diários e comparação com a meta em vigor nesse dia
create view public.daily_nutrition_totals with (security_invoker = true) as
select
  m.student_id,
  m.log_date,
  count(distinct m.id) as meals_count,
  sum(i.kcal) as kcal,
  sum(i.protein_g) as protein_g,
  sum(i.carbs_g) as carbs_g,
  sum(i.fat_g) as fat_g,
  sum(i.fiber_g) as fiber_g
from public.meals m
join public.meal_items i on i.meal_id = m.id
group by m.student_id, m.log_date;

create view public.daily_nutrition_vs_goal with (security_invoker = true) as
select
  t.*,
  g.goal_type,
  g.calories_target,
  g.protein_g as protein_target_g,
  g.carbs_g as carbs_target_g,
  g.fat_g as fat_target_g
from public.daily_nutrition_totals t
left join lateral (
  select * from public.nutrition_goals g
  where g.student_id = t.student_id and g.valid_from <= t.log_date
  order by g.valid_from desc, g.created_at desc
  limit 1
) g on true;

-- =========================================================== acompanhamento corporal
create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid () references public.profiles (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 25 and 400),
  body_fat_pct numeric(4, 1) check (body_fat_pct between 2 and 70),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, measured_on)                  -- um registo por dia (a app faz upsert)
);
create trigger body_metrics_updated_at before update on public.body_metrics
  for each row execute function public.set_updated_at();

-- Peso objetivo (append-only). O peso inicial é guardado no momento em que o objetivo é definido.
create table public.weight_goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  start_weight_kg numeric(5, 2) not null check (start_weight_kg between 25 and 400),
  target_weight_kg numeric(5, 2) not null check (target_weight_kg between 25 and 400),
  target_date date,
  set_by uuid not null default auth.uid () references public.profiles (id),
  created_at timestamptz not null default now()
);
create index weight_goals_student_idx on public.weight_goals (student_id, created_at desc);

create view public.current_weight_goal with (security_invoker = true) as
select distinct on (student_id) *
from public.weight_goals
order by student_id, created_at desc;

-- =========================================================== RLS
alter table public.nutrition_profiles enable row level security;
alter table public.nutrition_goals enable row level security;
alter table public.foods enable row level security;
alter table public.food_servings enable row level security;
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.saved_meals enable row level security;
alter table public.saved_meal_items enable row level security;
alter table public.body_metrics enable row level security;
alter table public.weight_goals enable row level security;

-- nutrition_profiles: leitura aluno + coach; escrita só o aluno
create policy nutrition_profiles_select on public.nutrition_profiles
  for select using (public.can_access_student (student_id));
create policy nutrition_profiles_insert on public.nutrition_profiles
  for insert with check (student_id = auth.uid ());
create policy nutrition_profiles_update on public.nutrition_profiles
  for update using (student_id = auth.uid ()) with check (student_id = auth.uid ());

-- nutrition_goals: aluno OU coach (vínculo ativo) inserem; sem UPDATE/DELETE => histórico imutável
create policy nutrition_goals_select on public.nutrition_goals
  for select using (public.can_access_student (student_id));
create policy nutrition_goals_insert on public.nutrition_goals
  for insert with check (
    set_by = auth.uid () and (student_id = auth.uid () or public.is_coach_of (student_id))
  );

-- weight_goals: mesma lógica
create policy weight_goals_select on public.weight_goals
  for select using (public.can_access_student (student_id));
create policy weight_goals_insert on public.weight_goals
  for insert with check (
    set_by = auth.uid () and (student_id = auth.uid () or public.is_coach_of (student_id))
  );

-- foods: globais + próprios + do coach do aluno. Globais/externos só via service role.
create policy foods_select on public.foods
  for select using (
    owner_id is null
    or owner_id = auth.uid ()
    or exists (
      select 1 from public.coach_students cs
      where cs.coach_id = foods.owner_id and cs.student_id = auth.uid () and cs.status = 'active'
    )
  );
create policy foods_insert on public.foods
  for insert with check (
    owner_id = auth.uid ()
    and (
      source = 'user'
      or (source = 'coach' and exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'coach'))
    )
  );
create policy foods_update on public.foods
  for update using (owner_id = auth.uid ()) with check (owner_id = auth.uid ());
create policy foods_delete on public.foods
  for delete using (owner_id = auth.uid ());

create policy food_servings_select on public.food_servings
  for select using (exists (select 1 from public.foods f where f.id = food_id));
create policy food_servings_write on public.food_servings
  for all using (exists (select 1 from public.foods f where f.id = food_id and f.owner_id = auth.uid ()))
  with check (exists (select 1 from public.foods f where f.id = food_id and f.owner_id = auth.uid ()));

-- meals / meal_items: aluno escreve; coach só lê
create policy meals_select on public.meals
  for select using (public.can_access_student (student_id));
create policy meals_write on public.meals
  for all using (student_id = auth.uid ()) with check (student_id = auth.uid ());

create policy meal_items_select on public.meal_items
  for select using (exists (
    select 1 from public.meals m where m.id = meal_id and public.can_access_student (m.student_id)
  ));
create policy meal_items_write on public.meal_items
  for all using (exists (select 1 from public.meals m where m.id = meal_id and m.student_id = auth.uid ()))
  with check (exists (select 1 from public.meals m where m.id = meal_id and m.student_id = auth.uid ()));

-- refeições guardadas: privadas do dono
create policy saved_meals_all on public.saved_meals
  for all using (owner_id = auth.uid ()) with check (owner_id = auth.uid ());
create policy saved_meal_items_all on public.saved_meal_items
  for all using (exists (select 1 from public.saved_meals s where s.id = saved_meal_id and s.owner_id = auth.uid ()))
  with check (exists (select 1 from public.saved_meals s where s.id = saved_meal_id and s.owner_id = auth.uid ()));

-- body_metrics: aluno escreve; coach só lê
create policy body_metrics_select on public.body_metrics
  for select using (public.can_access_student (student_id));
create policy body_metrics_write on public.body_metrics
  for all using (student_id = auth.uid ()) with check (student_id = auth.uid ());

-- 0018: despensa (alimentos disponíveis em casa) e planos alimentares gerados para bater as macros diárias,
-- com dias da semana e regularidade (como os planos de treino) para o calendário da alimentação.

create table public.pantry_items (
  student_id uuid not null default auth.uid () references public.profiles (id) on delete cascade,
  food_id uuid not null references public.foods (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, food_id)
);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid () references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  -- alvo com que foi gerado (informativo)
  target_kcal numeric(7, 1), target_protein_g numeric(6, 1), target_carbs_g numeric(6, 1), target_fat_g numeric(6, 1),
  is_active boolean not null default false,          -- "no calendário"
  recur_kind text not null default 'weekly' check (recur_kind in ('weekly', 'monthly')),
  recur_every smallint not null default 1 check (recur_every between 1 and 8),
  recur_week_of_month smallint check (recur_week_of_month between 1 and 5),
  recur_anchor date,
  ends_on date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recur_kind <> 'monthly' or recur_week_of_month is not null)
);
create index meal_plans_student_idx on public.meal_plans (student_id) where archived_at is null;
create trigger meal_plans_updated_at before update on public.meal_plans for each row execute function public.set_updated_at ();

create table public.meal_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  position smallint not null default 0,
  weekdays smallint[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);
create index meal_plan_days_plan_idx on public.meal_plan_days (plan_id, position);

create table public.meal_plan_meals (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.meal_plan_days (id) on delete cascade,
  meal_type public.meal_type not null,
  position smallint not null default 0
);
create index meal_plan_meals_day_idx on public.meal_plan_meals (day_id, position);

create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meal_plan_meals (id) on delete cascade,
  food_id uuid references public.foods (id) on delete set null,
  name text not null,
  quantity numeric(8, 2) not null check (quantity > 0),
  unit text not null check (unit in ('g', 'ml', 'unit')),
  grams_per_unit numeric(7, 2),
  kcal numeric(8, 1) not null check (kcal >= 0),
  protein_g numeric(7, 1) not null check (protein_g >= 0),
  carbs_g numeric(7, 1) not null check (carbs_g >= 0),
  fat_g numeric(7, 1) not null check (fat_g >= 0),
  fiber_g numeric(7, 1) check (fiber_g >= 0),
  position smallint not null default 0
);
create index meal_plan_items_meal_idx on public.meal_plan_items (meal_id, position);

-- refeições do diário criadas a partir de um dia do plano (evita adicionar duas vezes)
alter table public.meals add column source_plan_day_id uuid references public.meal_plan_days (id) on delete set null;
create index meals_source_plan_day_idx on public.meals (source_plan_day_id) where source_plan_day_id is not null;

-- ---- RLS: o próprio escreve; o coach vê (como a nutrição)
alter table public.pantry_items enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_plan_days enable row level security;
alter table public.meal_plan_meals enable row level security;
alter table public.meal_plan_items enable row level security;

create policy pantry_select on public.pantry_items for select using (public.can_access_student (student_id));
create policy pantry_write on public.pantry_items for all using (student_id = auth.uid ()) with check (student_id = auth.uid ());

create policy meal_plans_select on public.meal_plans for select using (public.can_access_student (student_id));
create policy meal_plans_write on public.meal_plans for all using (student_id = auth.uid ()) with check (student_id = auth.uid ());

create or replace function public.owns_meal_plan(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.meal_plans p where p.id = p_id and p.student_id = auth.uid ());
$$;
create or replace function public.can_see_meal_plan(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.meal_plans p where p.id = p_id and public.can_access_student (p.student_id));
$$;

create policy meal_plan_days_select on public.meal_plan_days for select using (public.can_see_meal_plan (plan_id));
create policy meal_plan_days_write on public.meal_plan_days for all using (public.owns_meal_plan (plan_id)) with check (public.owns_meal_plan (plan_id));

create policy meal_plan_meals_select on public.meal_plan_meals for select
  using (exists (select 1 from public.meal_plan_days d where d.id = day_id and public.can_see_meal_plan (d.plan_id)));
create policy meal_plan_meals_write on public.meal_plan_meals for all
  using (exists (select 1 from public.meal_plan_days d where d.id = day_id and public.owns_meal_plan (d.plan_id)))
  with check (exists (select 1 from public.meal_plan_days d where d.id = day_id and public.owns_meal_plan (d.plan_id)));

create policy meal_plan_items_select on public.meal_plan_items for select
  using (exists (select 1 from public.meal_plan_meals m join public.meal_plan_days d on d.id = m.day_id where m.id = meal_id and public.can_see_meal_plan (d.plan_id)));
create policy meal_plan_items_write on public.meal_plan_items for all
  using (exists (select 1 from public.meal_plan_meals m join public.meal_plan_days d on d.id = m.day_id where m.id = meal_id and public.owns_meal_plan (d.plan_id)))
  with check (exists (select 1 from public.meal_plan_meals m join public.meal_plan_days d on d.id = m.day_id where m.id = meal_id and public.owns_meal_plan (d.plan_id)));

grant select, insert, update, delete on public.pantry_items, public.meal_plans, public.meal_plan_days, public.meal_plan_meals, public.meal_plan_items to authenticated;

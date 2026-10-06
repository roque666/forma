-- 0012: atividades fora dos treinos de ginásio (padel, futebol, corrida…) no calendário.
-- Só registam se foram feitas; sem séries nem cargas. Mesma regularidade dos planos.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  start_time time,
  duration_min smallint check (duration_min is null or duration_min between 5 and 600),
  notes text check (notes is null or length(notes) <= 300),
  recur_kind text not null default 'weekly' check (recur_kind in ('weekly', 'monthly')),
  recur_every smallint not null default 1 check (recur_every between 1 and 8),
  recur_week_of_month smallint check (recur_week_of_month between 1 and 5),
  recur_anchor date,
  ends_on date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (recur_kind <> 'monthly' or recur_week_of_month is not null)
);
create index activities_student_idx on public.activities (student_id) where archived_at is null;

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  done_on date not null,
  created_at timestamptz not null default now(),
  unique (activity_id, done_on)
);
create index activity_logs_student_idx on public.activity_logs (student_id, done_on);

alter table public.activities enable row level security;
alter table public.activity_logs enable row level security;

create policy activities_select on public.activities for select using (student_id = auth.uid () or public.is_coach_of (student_id));
create policy activities_write on public.activities for all using (student_id = auth.uid ()) with check (student_id = auth.uid ());
create policy activity_logs_select on public.activity_logs for select using (student_id = auth.uid () or public.is_coach_of (student_id));
-- só se regista em atividades próprias
create policy activity_logs_write on public.activity_logs for all
  using (student_id = auth.uid ())
  with check (student_id = auth.uid () and exists (select 1 from public.activities a where a.id = activity_id and a.student_id = auth.uid ()));
grant select, insert, update, delete on public.activities, public.activity_logs to authenticated;

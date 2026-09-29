-- 0004_coach.sql
-- Sistema COACH ↔ ALUNO: vínculos (preparados para vários coaches), convites, correções auditadas,
-- notas privadas, comentários, alertas configuráveis e vistas para "Meus Alunos" e para o dashboard do aluno.

-- =========================================================== 1. Vínculos: 1 coach hoje, N coaches amanhã
-- link_type 'primary' = coach principal. A regra "1 coach ativo por aluno" passa a aplicar-se SÓ ao principal.
-- Para permitir vários coaches no futuro basta ativar app_config.multi_coach_enabled (sem alterar o esquema)
-- e criar vínculos 'secondary'. As políticas RLS já usam is_coach_of(), que aceita qualquer vínculo ativo.
alter table public.coach_students
  add column link_type text not null default 'primary' check (link_type in ('primary', 'secondary'));

drop index public.one_active_coach_per_student;
create unique index one_active_primary_coach_per_student
  on public.coach_students (student_id) where status = 'active' and link_type = 'primary';
create unique index one_active_link_per_pair
  on public.coach_students (coach_id, student_id) where status = 'active';
create unique index one_pending_invite_per_email
  on public.coach_students (coach_id, lower(invite_email)) where status = 'pending' and invite_email is not null;

create table public.app_config (
  key text primary key,
  value jsonb not null
);
insert into public.app_config (key, value) values ('multi_coach_enabled', 'false'::jsonb);
alter table public.app_config enable row level security;
create policy app_config_select on public.app_config for select using (auth.uid () is not null);

create or replace function public.multi_coach_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_config where key = 'multi_coach_enabled'), false);
$$;

-- =========================================================== 2. Convites e vínculo (escrita só por estas funções)
-- Convida por email. Devolve sempre um id, exista ou não conta com esse email (sem revelar contas existentes).
-- O envio do email em si é feito pelo servidor (Supabase Auth invite) — aqui só se regista o pedido.
create or replace function public.coach_invite_student(p_email text, p_link_type text default 'primary')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_student uuid; v_id uuid;
begin
  if auth.uid () is null or not public.is_coach () then
    raise exception 'Apenas coaches podem convidar alunos' using errcode = '42501';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email inválido' using errcode = '22023';
  end if;
  if p_link_type not in ('primary', 'secondary') then
    raise exception 'Tipo de vínculo inválido' using errcode = '22023';
  end if;
  if p_link_type = 'secondary' and not public.multi_coach_enabled () then
    raise exception 'Vários coaches por aluno ainda não estão ativos' using errcode = '55000';
  end if;

  select id into v_student from auth.users where lower(email) = v_email;
  if v_student = auth.uid () then
    raise exception 'Não é possível convidar a própria conta' using errcode = '22023';
  end if;
  if v_student is not null and exists (
    select 1 from public.coach_students where coach_id = auth.uid () and student_id = v_student and status = 'active'
  ) then
    raise exception 'Este aluno já está associado a ti' using errcode = '23505';
  end if;

  insert into public.coach_students (coach_id, student_id, status, origin, invite_email, link_type)
  values (auth.uid (), v_student, 'pending', 'invite', v_email, p_link_type)
  on conflict (coach_id, lower(invite_email)) where status = 'pending' and invite_email is not null
  do update set student_id = excluded.student_id, link_type = excluded.link_type
  returning id into v_id;
  return v_id;
end $$;

-- Convites pendentes do utilizador autenticado (por conta ou por email ainda não associado).
create or replace function public.my_pending_invites()
returns table (link_id uuid, coach_id uuid, coach_name text, link_type text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select cs.id, cs.coach_id, p.full_name, cs.link_type, cs.created_at
  from public.coach_students cs
  join public.profiles p on p.id = cs.coach_id
  where cs.status = 'pending'
    and (cs.student_id = auth.uid ()
         or (cs.student_id is null and lower(cs.invite_email) = (select lower(email) from auth.users where id = auth.uid ())))
  order by cs.created_at desc;
$$;

-- O aluno aceita = consentimento explícito de partilha de dados. Só então o coach passa a ver dados.
create or replace function public.accept_coach_link(p_link_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_link public.coach_students; v_email text;
begin
  if auth.uid () is null then
    raise exception 'Sessão necessária' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid ();
  select * into v_link from public.coach_students where id = p_link_id and status = 'pending' for update;

  if not found or not (
    v_link.student_id = auth.uid () or (v_link.student_id is null and lower(v_link.invite_email) = v_email)
  ) then
    raise exception 'Convite não encontrado' using errcode = 'P0002';
  end if;

  begin
    update public.coach_students
       set student_id = auth.uid (), status = 'active', consent_at = now()
     where id = p_link_id;
  exception when unique_violation then
    raise exception 'Já tens um coach ativo. Termina o vínculo atual antes de aceitar este.' using errcode = '23505';
  end;
end $$;

-- Termina (ou recusa/cancela) um vínculo. Qualquer das partes pode fazê-lo; o efeito é imediato.
create or replace function public.end_coach_link(p_link_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select lower(email) into v_email from auth.users where id = auth.uid ();
  update public.coach_students
     set status = 'ended', ended_at = now(), ended_by = auth.uid ()
   where id = p_link_id
     and status in ('pending', 'active')
     and (coach_id = auth.uid ()
          or student_id = auth.uid ()
          or (student_id is null and lower(invite_email) = v_email));
  if not found then
    raise exception 'Vínculo não encontrado' using errcode = 'P0002';
  end if;
end $$;

-- =========================================================== 3. Definições do coach, notas e comentários
create table public.coach_settings (
  coach_id uuid primary key references public.profiles (id) on delete cascade,
  workout_alert_days smallint not null default 7 check (workout_alert_days between 1 and 90),
  meal_alert_days smallint not null default 3 check (meal_alert_days between 1 and 90),
  weigh_in_alert_days smallint not null default 14 check (weigh_in_alert_days between 1 and 90),
  inactive_days smallint not null default 14 check (inactive_days between 1 and 180),
  updated_at timestamptz not null default now()
);
create trigger coach_settings_updated_at before update on public.coach_settings
  for each row execute function public.set_updated_at();

-- Notas PRIVADAS do coach (o aluno nunca as vê). Ficam com o coach mesmo depois de terminar o vínculo.
create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid () references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coach_notes_idx on public.coach_notes (coach_id, student_id, created_at desc);
create trigger coach_notes_updated_at before update on public.coach_notes
  for each row execute function public.set_updated_at();

-- Comentários visíveis para aluno e coach numa sessão de treino.
create table public.session_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  author_id uuid not null default auth.uid () references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index session_comments_idx on public.session_comments (session_id, created_at);

alter table public.coach_settings enable row level security;
alter table public.coach_notes enable row level security;
alter table public.session_comments enable row level security;

create policy coach_settings_all on public.coach_settings
  for all using (coach_id = auth.uid ()) with check (coach_id = auth.uid () and public.is_coach ());

create policy coach_notes_select on public.coach_notes for select using (coach_id = auth.uid ());
create policy coach_notes_insert on public.coach_notes
  for insert with check (coach_id = auth.uid () and public.is_coach_of (student_id));
create policy coach_notes_update on public.coach_notes
  for update using (coach_id = auth.uid ()) with check (coach_id = auth.uid ());
create policy coach_notes_delete on public.coach_notes for delete using (coach_id = auth.uid ());

-- "exists" sobre workout_sessions respeita a RLS: só quem pode ver a sessão pode comentar/ler comentários.
create policy session_comments_select on public.session_comments
  for select using (exists (select 1 from public.workout_sessions s where s.id = session_id));
create policy session_comments_insert on public.session_comments
  for insert with check (author_id = auth.uid () and exists (select 1 from public.workout_sessions s where s.id = session_id));
create policy session_comments_update on public.session_comments
  for update using (author_id = auth.uid ()) with check (author_id = auth.uid ());
create policy session_comments_delete on public.session_comments
  for delete using (author_id = auth.uid ());

-- =========================================================== 4. Correções explícitas e auditadas
-- O coach NÃO tem permissão de escrita direta nos registos do aluno (RLS). A única via é uma
-- correção explícita: exige motivo, altera só campos permitidos, marca o registo e fica no audit trail.
alter table public.session_sets add column corrected_at timestamptz,
  add column corrected_by uuid references public.profiles (id) on delete set null;
alter table public.meal_items add column corrected_at timestamptz,
  add column corrected_by uuid references public.profiles (id) on delete set null;
alter table public.body_metrics add column corrected_at timestamptz,
  add column corrected_by uuid references public.profiles (id) on delete set null;

create table public.record_corrections (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  corrected_by uuid not null references public.profiles (id),
  table_name text not null check (table_name in ('session_sets', 'meal_items', 'body_metrics')),
  record_id uuid not null,
  old_values jsonb not null,
  new_values jsonb not null,
  reason text not null check (length(trim(reason)) >= 5),
  created_at timestamptz not null default now()
);
create index record_corrections_student_idx on public.record_corrections (student_id, created_at desc);
create index record_corrections_record_idx on public.record_corrections (table_name, record_id);
alter table public.record_corrections enable row level security;
-- Só leitura (aluno e coach). Inserções apenas pelas funções abaixo; sem UPDATE/DELETE => imutável.
create policy record_corrections_select on public.record_corrections
  for select using (public.can_access_student (student_id));

-- Impede que o aluno apague a marca de correção (o audit trail continua a existir de qualquer forma).
create or replace function public.protect_correction_columns()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.corrected_at is distinct from old.corrected_at
    or new.corrected_by is distinct from old.corrected_by
  ) then
    raise exception 'A marca de correção só pode ser definida por uma correção explícita' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger session_sets_protect_correction before update on public.session_sets
  for each row execute function public.protect_correction_columns();
create trigger meal_items_protect_correction before update on public.meal_items
  for each row execute function public.protect_correction_columns();
create trigger body_metrics_protect_correction before update on public.body_metrics
  for each row execute function public.protect_correction_columns();

create or replace function public.assert_can_correct(p_student uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid () is null or p_student is null or not public.is_coach_of (p_student) then
    raise exception 'Sem permissão para corrigir este registo' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'É obrigatório indicar o motivo da correção' using errcode = '22023';
  end if;
end $$;

create or replace function public.coach_correct_session_set(
  p_set_id uuid, p_reason text,
  p_weight_kg numeric default null, p_reps integer default null, p_rir numeric default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_student uuid; v_old jsonb; v_new jsonb;
begin
  select student_id into v_student from public.session_sets where id = p_set_id;
  perform public.assert_can_correct (v_student, p_reason);
  if p_weight_kg is null and p_reps is null and p_rir is null then
    raise exception 'Nenhuma alteração indicada' using errcode = '22023';
  end if;

  select jsonb_build_object('weight_kg', weight_kg, 'reps', reps, 'rir', rir) into v_old
    from public.session_sets where id = p_set_id;
  update public.session_sets
     set weight_kg = coalesce(p_weight_kg, weight_kg),
         reps = coalesce(p_reps, reps),
         rir = coalesce(p_rir, rir),
         corrected_at = now(), corrected_by = auth.uid ()
   where id = p_set_id
  returning jsonb_build_object('weight_kg', weight_kg, 'reps', reps, 'rir', rir) into v_new;

  insert into public.record_corrections (student_id, corrected_by, table_name, record_id, old_values, new_values, reason)
  values (v_student, auth.uid (), 'session_sets', p_set_id, v_old, v_new, trim(p_reason));
end $$;

create or replace function public.coach_correct_meal_item(
  p_item_id uuid, p_reason text,
  p_quantity numeric default null, p_kcal numeric default null,
  p_protein_g numeric default null, p_carbs_g numeric default null, p_fat_g numeric default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_student uuid; v_old jsonb; v_new jsonb;
begin
  select m.student_id into v_student
    from public.meal_items i join public.meals m on m.id = i.meal_id where i.id = p_item_id;
  perform public.assert_can_correct (v_student, p_reason);
  if num_nonnulls (p_quantity, p_kcal, p_protein_g, p_carbs_g, p_fat_g) = 0 then
    raise exception 'Nenhuma alteração indicada' using errcode = '22023';
  end if;

  select jsonb_build_object('quantity', quantity, 'kcal', kcal, 'protein_g', protein_g, 'carbs_g', carbs_g, 'fat_g', fat_g)
    into v_old from public.meal_items where id = p_item_id;
  update public.meal_items
     set quantity = coalesce(p_quantity, quantity), kcal = coalesce(p_kcal, kcal),
         protein_g = coalesce(p_protein_g, protein_g), carbs_g = coalesce(p_carbs_g, carbs_g),
         fat_g = coalesce(p_fat_g, fat_g),
         corrected_at = now(), corrected_by = auth.uid ()
   where id = p_item_id
  returning jsonb_build_object('quantity', quantity, 'kcal', kcal, 'protein_g', protein_g, 'carbs_g', carbs_g, 'fat_g', fat_g)
    into v_new;

  insert into public.record_corrections (student_id, corrected_by, table_name, record_id, old_values, new_values, reason)
  values (v_student, auth.uid (), 'meal_items', p_item_id, v_old, v_new, trim(p_reason));
end $$;

create or replace function public.coach_correct_body_metric(
  p_id uuid, p_reason text, p_weight_kg numeric default null, p_body_fat_pct numeric default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_student uuid; v_old jsonb; v_new jsonb;
begin
  select student_id into v_student from public.body_metrics where id = p_id;
  perform public.assert_can_correct (v_student, p_reason);
  if p_weight_kg is null and p_body_fat_pct is null then
    raise exception 'Nenhuma alteração indicada' using errcode = '22023';
  end if;

  select jsonb_build_object('weight_kg', weight_kg, 'body_fat_pct', body_fat_pct) into v_old
    from public.body_metrics where id = p_id;
  update public.body_metrics
     set weight_kg = coalesce(p_weight_kg, weight_kg), body_fat_pct = coalesce(p_body_fat_pct, body_fat_pct),
         corrected_at = now(), corrected_by = auth.uid ()
   where id = p_id
  returning jsonb_build_object('weight_kg', weight_kg, 'body_fat_pct', body_fat_pct) into v_new;

  insert into public.record_corrections (student_id, corrected_by, table_name, record_id, old_values, new_values, reason)
  values (v_student, auth.uid (), 'body_metrics', p_id, v_old, v_new, trim(p_reason));
end $$;

-- =========================================================== 5. Vistas para as páginas do coach
-- Sessões concluídas: histórico por treino, duração e volume (séries concluídas, sem aquecimento).
create view public.workout_session_summaries with (security_invoker = true) as
select
  w.id as session_id, w.student_id, w.plan_id, w.plan_name, w.day_name, w.status,
  w.started_at, w.ended_at,
  extract(epoch from (w.ended_at - w.started_at))::integer as duration_seconds,
  count(distinct se.id) as exercises_count,
  count(ss.id) filter (where ss.completed and ss.set_type = 'normal') as sets_completed,
  coalesce(sum(ss.weight_kg * ss.reps) filter (where ss.completed and ss.set_type = 'normal'), 0) as volume_kg
from public.workout_sessions w
left join public.session_exercises se on se.session_id = w.id
left join public.session_sets ss on ss.session_exercise_id = se.id
group by w.id;

-- Séries concluídas por exercício (base da PROGRESSÃO). 1RM estimado (Epley) só até 12 repetições.
create view public.exercise_set_history with (security_invoker = true) as
select
  ss.id as set_id, ss.student_id, se.exercise_id, se.exercise_name,
  w.id as session_id, w.started_at, ss.set_number, ss.weight_kg, ss.reps, ss.rir,
  ss.weight_kg * ss.reps as volume_kg,
  case when ss.reps between 1 and 12 and ss.weight_kg > 0
       then round(ss.weight_kg * (1 + ss.reps / 30.0), 1) end as est_1rm_kg,
  ss.corrected_at
from public.session_sets ss
join public.session_exercises se on se.id = ss.session_exercise_id
join public.workout_sessions w on w.id = se.session_id
where ss.completed and ss.set_type = 'normal' and w.status = 'completed';

-- "MEUS ALUNOS": uma linha por aluno do coach autenticado. O estado de acompanhamento é calculado
-- na aplicação (limites configuráveis em coach_settings) a partir das datas devolvidas aqui.
create view public.coach_students_overview with (security_invoker = true) as
select
  cs.id as link_id, cs.coach_id, cs.student_id, cs.status as link_status, cs.link_type, cs.origin,
  cs.invite_email, cs.created_at as linked_at, cs.consent_at,
  p.full_name, p.avatar_url,
  bm.weight_kg as current_weight_kg, bm.measured_on as last_weigh_in,
  g.goal_type, g.calories_target,
  wp.id as current_plan_id, wp.name as current_plan_name,
  ws.last_workout_at,
  ml.last_meal_date
from public.coach_students cs
left join public.profiles p on p.id = cs.student_id
left join lateral (
  select b.weight_kg, b.measured_on from public.body_metrics b
  where b.student_id = cs.student_id order by b.measured_on desc limit 1
) bm on true
left join lateral (
  select n.goal_type, n.calories_target from public.nutrition_goals n
  where n.student_id = cs.student_id and n.valid_from <= current_date
  order by n.valid_from desc, n.created_at desc limit 1
) g on true
left join lateral (
  select w.id, w.name from public.workout_plans w
  where w.student_id = cs.student_id and w.is_active and w.archived_at is null and not w.is_template
  limit 1
) wp on true
left join lateral (
  select max(coalesce(s.ended_at, s.started_at)) as last_workout_at
  from public.workout_sessions s where s.student_id = cs.student_id and s.status = 'completed'
) ws on true
left join lateral (
  select max(m.log_date) as last_meal_date from public.meals m where m.student_id = cs.student_id
) ml on true
where cs.coach_id = auth.uid () and cs.status in ('pending', 'active');

-- 0011: vários planos ativos ao mesmo tempo, cada um com a sua regularidade.
--  - "ativo" passa a significar "está no calendário"
--  - regularidade: todas as semanas / de N em N semanas / numa semana do mês
alter table public.workout_plans
  add column if not exists recur_kind text not null default 'weekly' check (recur_kind in ('weekly', 'monthly')),
  add column if not exists recur_every smallint not null default 1 check (recur_every between 1 and 8),
  add column if not exists recur_week_of_month smallint check (recur_week_of_month between 1 and 5), -- 5 = última semana
  add column if not exists recur_anchor date,   -- 1.º dia (qualquer) da semana a partir da qual o plano está em vigor
  add column if not exists ends_on date;
alter table public.workout_plans add constraint workout_plans_monthly_chk
  check (recur_kind <> 'monthly' or recur_week_of_month is not null);

drop index if exists public.one_active_plan_per_student;

update public.workout_plans set recur_anchor = date_trunc('week', current_date)::date where is_active and recur_anchor is null;

-- Põe o plano no calendário (já não desativa os outros).
create or replace function public.activate_plan(p_plan_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_student uuid;
begin
  select student_id into v_student from public.workout_plans where id = p_plan_id and not is_template;
  if v_student is null then
    raise exception 'Plano não encontrado' using errcode = 'P0002';
  end if;
  update public.workout_plans
     set is_active = true, archived_at = null, recur_anchor = coalesce(recur_anchor, date_trunc('week', current_date)::date)
   where id = p_plan_id;
end $$;

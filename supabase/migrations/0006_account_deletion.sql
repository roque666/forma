-- 0006_account_deletion.sql
-- Permite eliminar uma conta (RGPD) sem ser bloqueada por referências de autoria noutros registos.
-- Os dados dos alunos mantêm-se; apenas a "autoria" (quem definiu/criou/corrigiu) passa a nula.

alter table public.nutrition_goals alter column set_by drop not null;
alter table public.nutrition_goals drop constraint nutrition_goals_set_by_fkey,
  add constraint nutrition_goals_set_by_fkey foreign key (set_by) references public.profiles (id) on delete set null;

alter table public.weight_goals alter column set_by drop not null;
alter table public.weight_goals drop constraint weight_goals_set_by_fkey,
  add constraint weight_goals_set_by_fkey foreign key (set_by) references public.profiles (id) on delete set null;

alter table public.workout_plans alter column created_by drop not null;
alter table public.workout_plans drop constraint workout_plans_created_by_fkey,
  add constraint workout_plans_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;
alter table public.workout_plans drop constraint workout_plans_updated_by_fkey,
  add constraint workout_plans_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null;

alter table public.record_corrections alter column corrected_by drop not null;
alter table public.record_corrections drop constraint record_corrections_corrected_by_fkey,
  add constraint record_corrections_corrected_by_fkey foreign key (corrected_by) references public.profiles (id) on delete set null;

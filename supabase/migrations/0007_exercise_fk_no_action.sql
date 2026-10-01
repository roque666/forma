-- 0007: apagar uma conta não pode falhar por um exercício próprio usado nos planos da própria conta.
-- "restrict" verifica de imediato e bloqueia o cascade (utilizador -> exercício + utilizador -> plano).
-- "deferrable initially deferred" verifica só no fim da transação: passa se os planos também forem apagados, e continua a
-- bloquear se o exercício ainda for usado por planos de outras contas (evita perder dados alheios).
alter table public.plan_exercises drop constraint plan_exercises_exercise_id_fkey,
  add constraint plan_exercises_exercise_id_fkey foreign key (exercise_id) references public.exercises (id) on delete no action deferrable initially deferred;

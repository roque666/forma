-- 0008: coaches podem corrigir os exercícios e alimentos da biblioteca base (owner_id nulo).
-- Só edição (update): apagar continua reservado ao dono. Os alunos não têm este poder.
create policy exercises_update_base on public.exercises
  for update using (owner_id is null and public.is_coach ()) with check (owner_id is null and public.is_coach ());

create policy foods_update_base on public.foods
  for update using (owner_id is null and public.is_coach ()) with check (owner_id is null and public.is_coach ());

create policy food_servings_write_base on public.food_servings
  for all using (public.is_coach () and exists (select 1 from public.foods f where f.id = food_id and f.owner_id is null))
  with check (public.is_coach () and exists (select 1 from public.foods f where f.id = food_id and f.owner_id is null));

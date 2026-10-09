-- Pesquisa de alimentos por palavras: "frango grelhado" ou "grelhado frango" encontram "Peito de frango grelhado".
create or replace function public.search_foods(q text, max_results int default 20)
returns setof public.foods
language sql stable security invoker set search_path = public, extensions as $$
  with t as (
    select coalesce(array_agg(w), '{}') as words
      from unnest(regexp_split_to_array(trim(public.f_unaccent (lower(q))), '\s+')) as w
     where w <> ''
  )
  select f.*
  from public.foods f, t
  where cardinality(t.words) > 0
    and not exists (
      select 1 from unnest(t.words) as w
       where public.f_unaccent (lower(f.name || ' ' || coalesce(f.brand, '')))
             not like '%' || replace(replace(w, '%', '\%'), '_', '\_') || '%')
  order by
    (public.f_unaccent (lower(f.name)) like replace(replace(trim(public.f_unaccent (lower(q))), '%', '\%'), '_', '\_') || '%') desc,
    similarity(public.f_unaccent (lower(f.name)), public.f_unaccent (lower(q))) desc,
    f.name
  limit least(greatest(max_results, 1), 50);
$$;

-- 0009: imagens e vídeo nos exercícios.
--  - image_urls: imagens estáticas dos exercícios base (ficheiros em /public/exercises)
--  - media_url:  link de vídeo (https), usado em qualquer exercício
--  - exercise_images: 1 imagem carregada por exercício (guardada na BD, protegida por RLS)
alter table public.exercises add column if not exists image_urls text[] not null default '{}';
alter table public.exercises add constraint exercises_media_url_chk
  check (media_url is null or (media_url ~ '^https://' and length(media_url) <= 300));

create table public.exercise_images (
  exercise_id uuid primary key references public.exercises (id) on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data bytea not null check (octet_length(data) <= 1500000),
  updated_at timestamptz not null default now()
);
alter table public.exercise_images enable row level security;

-- vê a imagem quem vê o exercício (a RLS de exercises aplica-se na subconsulta)
create policy exercise_images_select on public.exercise_images
  for select using (exists (select 1 from public.exercises e where e.id = exercise_id));
-- escreve o dono do exercício; coaches também nos exercícios base
create policy exercise_images_write on public.exercise_images
  for all using (exists (select 1 from public.exercises e where e.id = exercise_id and (e.owner_id = auth.uid () or (e.owner_id is null and public.is_coach ()))))
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and (e.owner_id = auth.uid () or (e.owner_id is null and public.is_coach ()))));
grant select, insert, update, delete on public.exercise_images to authenticated;

-- URLs das imagens de um exercício: a carregada (se existir) ou as estáticas.
create or replace function public.exercise_image_urls(p_id uuid, p_static text[])
returns text[] language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select array['/api/exercise-image/' || p_id::text || '?v=' || extract(epoch from i.updated_at)::bigint::text]
       from public.exercise_images i where i.exercise_id = p_id),
    p_static)
$$;

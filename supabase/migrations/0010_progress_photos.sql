-- 0010: fotos de progresso (corpo), privadas por defeito.
--  - só o dono vê e escreve
--  - o coach ativo só vê as fotos que o atleta marcar como partilhadas (shared_with_coach)
create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  taken_on date not null,
  angle text not null default 'front' check (angle in ('front', 'side', 'back')),
  weight_kg numeric(5, 1) check (weight_kg is null or (weight_kg >= 20 and weight_kg <= 400)),
  note text check (note is null or length(note) <= 300),
  shared_with_coach boolean not null default false,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data bytea not null check (octet_length(data) <= 1500000),
  thumb bytea not null check (octet_length(thumb) <= 200000),
  created_at timestamptz not null default now()
);
create index progress_photos_student_idx on public.progress_photos (student_id, taken_on desc);
alter table public.progress_photos enable row level security;

create policy progress_photos_select on public.progress_photos for select
  using (student_id = auth.uid () or (shared_with_coach and public.is_coach_of (student_id)));
create policy progress_photos_insert on public.progress_photos for insert with check (student_id = auth.uid ());
create policy progress_photos_update on public.progress_photos for update
  using (student_id = auth.uid ()) with check (student_id = auth.uid ());
create policy progress_photos_delete on public.progress_photos for delete using (student_id = auth.uid ());
grant select, insert, update, delete on public.progress_photos to authenticated;

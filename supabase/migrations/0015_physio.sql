-- 0015: fisioterapeutas, pacientes e programas de exercícios (reabilitação).
-- ISOLAMENTO: o vínculo fisioterapeuta↔paciente vive numa tabela PRÓPRIA (physio_patients). Nunca usa coach_students,
-- porque is_coach_of() dá acesso a treinos, nutrição e peso. Um fisioterapeuta só vê programas e registos de reabilitação.

create or replace function public.is_physio()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'physio');
$$;

-- =========================================================== vínculo fisioterapeuta ↔ paciente
create table public.physio_patients (
  id uuid primary key default gen_random_uuid(),
  physio_id uuid not null references public.profiles (id) on delete cascade,
  patient_id uuid references public.profiles (id) on delete cascade,
  status public.link_status not null default 'pending',
  invite_email text,
  consent_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (status <> 'active' or (patient_id is not null and consent_at is not null))
);
create unique index physio_patient_active_uq on public.physio_patients (physio_id, patient_id) where status = 'active';
create unique index physio_invite_pending_uq on public.physio_patients (physio_id, lower(invite_email)) where status = 'pending' and invite_email is not null;
create index physio_patients_patient_idx on public.physio_patients (patient_id, status);
alter table public.physio_patients enable row level security;
create policy physio_patients_select on public.physio_patients for select using (physio_id = auth.uid () or patient_id = auth.uid ());
-- escrita só pelas funções abaixo (security definer)
grant select on public.physio_patients to authenticated;

create or replace function public.is_physio_of(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.physio_patients pp
                  where pp.physio_id = auth.uid () and pp.patient_id = target and pp.status = 'active')
     and public.is_physio ();
$$;

create or replace function public.physio_invite_patient(p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_patient uuid; v_id uuid;
begin
  if auth.uid () is null or not public.is_physio () then
    raise exception 'Apenas fisioterapeutas podem convidar pacientes' using errcode = '42501';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email inválido' using errcode = '22023';
  end if;
  select id into v_patient from auth.users where lower(email) = v_email;
  if v_patient = auth.uid () then
    raise exception 'Não é possível convidar a própria conta' using errcode = '22023';
  end if;
  if v_patient is not null and exists (select 1 from public.physio_patients where physio_id = auth.uid () and patient_id = v_patient and status = 'active') then
    raise exception 'Este paciente já está associado a ti' using errcode = '23505';
  end if;
  insert into public.physio_patients (physio_id, patient_id, status, invite_email)
  values (auth.uid (), v_patient, 'pending', v_email)
  on conflict (physio_id, lower(invite_email)) where status = 'pending' and invite_email is not null
  do update set patient_id = excluded.patient_id
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.my_pending_physio_invites()
returns table (link_id uuid, physio_id uuid, physio_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select pp.id, pp.physio_id, p.full_name, pp.created_at
  from public.physio_patients pp join public.profiles p on p.id = pp.physio_id
  where pp.status = 'pending'
    and (pp.patient_id = auth.uid ()
         or (pp.patient_id is null and lower(pp.invite_email) = (select lower(email) from auth.users where id = auth.uid ())))
  order by pp.created_at desc;
$$;

-- Aceitar = consentimento: a partir daqui o fisioterapeuta vê os programas e registos de reabilitação (e mais nada).
create or replace function public.accept_physio_link(p_link_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_link public.physio_patients; v_email text;
begin
  if auth.uid () is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid ();
  select * into v_link from public.physio_patients where id = p_link_id and status = 'pending' for update;
  if not found or not (v_link.patient_id = auth.uid () or (v_link.patient_id is null and lower(v_link.invite_email) = v_email)) then
    raise exception 'Convite não encontrado' using errcode = 'P0002';
  end if;
  begin
    update public.physio_patients set patient_id = auth.uid (), status = 'active', consent_at = now () where id = p_link_id;
  exception when unique_violation then
    raise exception 'Já estás associado a este fisioterapeuta.' using errcode = '23505';
  end;
end $$;

create or replace function public.end_physio_link(p_link_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select lower(email) into v_email from auth.users where id = auth.uid ();
  update public.physio_patients set status = 'ended', ended_at = now (), ended_by = auth.uid ()
   where id = p_link_id and status in ('pending', 'active')
     and (physio_id = auth.uid () or patient_id = auth.uid () or (patient_id is null and lower(invite_email) = v_email));
  if not found then raise exception 'Vínculo não encontrado' using errcode = 'P0002'; end if;
end $$;

grant execute on function public.physio_invite_patient(text), public.my_pending_physio_invites(),
  public.accept_physio_link(uuid), public.end_physio_link(uuid) to authenticated;

-- perfis: o fisioterapeuta vê o nome dos seus pacientes (e o convite pendente); o paciente vê o nome do fisioterapeuta.
create policy profiles_select_physio on public.profiles for select using (
  exists (select 1 from public.physio_patients pp
           where pp.status in ('pending', 'active')
             and ((pp.physio_id = auth.uid () and pp.patient_id = profiles.id)
               or (pp.patient_id = auth.uid () and pp.physio_id = profiles.id))));

-- =========================================================== programas de exercícios
create table public.rehab_programs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  physio_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  notes text check (notes is null or length(notes) <= 1000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger rehab_programs_updated_at before update on public.rehab_programs for each row execute function public.set_updated_at ();
create index rehab_programs_patient_idx on public.rehab_programs (patient_id) where archived_at is null;
create index rehab_programs_physio_idx on public.rehab_programs (physio_id, patient_id);

create table public.rehab_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.rehab_programs (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete no action deferrable initially deferred,
  position integer not null default 0,
  sets smallint check (sets is null or sets between 1 and 20),
  reps smallint check (reps is null or reps between 1 and 200),
  hold_seconds smallint check (hold_seconds is null or hold_seconds between 1 and 600),
  weekly_target smallint not null default 3 check (weekly_target between 1 and 21),
  notes text check (notes is null or length(notes) <= 300)
);
create index rehab_items_program_idx on public.rehab_items (program_id, position);
create index rehab_items_exercise_idx on public.rehab_items (exercise_id);

create table public.rehab_logs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.rehab_items (id) on delete cascade,
  program_id uuid not null references public.rehab_programs (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  done_on date not null,
  done_at timestamptz not null default now(),
  pain smallint check (pain is null or pain between 0 and 10),
  note text check (note is null or length(note) <= 300)
);
create index rehab_logs_patient_idx on public.rehab_logs (patient_id, done_on);
create index rehab_logs_item_idx on public.rehab_logs (item_id, done_on);
create index rehab_logs_program_idx on public.rehab_logs (program_id, done_on);

create or replace function public.can_read_rehab_program(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rehab_programs p
                  where p.id = p_id and (p.patient_id = auth.uid () or (p.physio_id = auth.uid () and public.is_physio_of (p.patient_id))));
$$;
create or replace function public.can_write_rehab_program(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rehab_programs p where p.id = p_id and p.physio_id = auth.uid () and public.is_physio_of (p.patient_id));
$$;

alter table public.rehab_programs enable row level security;
alter table public.rehab_items enable row level security;
alter table public.rehab_logs enable row level security;

create policy rehab_programs_select on public.rehab_programs for select using (public.can_read_rehab_program (id));
create policy rehab_programs_insert on public.rehab_programs for insert
  with check (physio_id = auth.uid () and public.is_physio_of (patient_id));
create policy rehab_programs_update on public.rehab_programs for update
  using (public.can_write_rehab_program (id)) with check (physio_id = auth.uid () and public.is_physio_of (patient_id));
create policy rehab_programs_delete on public.rehab_programs for delete using (public.can_write_rehab_program (id));

create policy rehab_items_select on public.rehab_items for select using (public.can_read_rehab_program (program_id));
create policy rehab_items_write on public.rehab_items for all
  using (public.can_write_rehab_program (program_id)) with check (public.can_write_rehab_program (program_id));

create policy rehab_logs_select on public.rehab_logs for select using (patient_id = auth.uid () or public.can_read_rehab_program (program_id));
create policy rehab_logs_insert on public.rehab_logs for insert with check (
  patient_id = auth.uid ()
  and exists (select 1 from public.rehab_items i join public.rehab_programs p on p.id = i.program_id
               where i.id = item_id and p.id = program_id and p.patient_id = auth.uid () and p.archived_at is null));
create policy rehab_logs_delete on public.rehab_logs for delete using (patient_id = auth.uid ());
grant select, insert, update, delete on public.rehab_programs, public.rehab_items to authenticated;
grant select, insert, delete on public.rehab_logs to authenticated;

-- =========================================================== exercícios do fisioterapeuta
alter table public.exercises drop constraint if exists exercises_source_check;
alter table public.exercises add constraint exercises_source_check check (source in ('system', 'user', 'coach', 'physio'));
drop policy exercises_insert on public.exercises;
create policy exercises_insert on public.exercises for insert with check (
  owner_id = auth.uid ()
  and (source = 'user' or (source = 'coach' and public.is_coach ()) or (source = 'physio' and public.is_physio ())));
-- o paciente (e o fisioterapeuta) veem os exercícios incluídos num programa que podem ler
create policy exercises_select_rehab on public.exercises for select using (
  exists (select 1 from public.rehab_items ri where ri.exercise_id = exercises.id and public.can_read_rehab_program (ri.program_id)));

-- 0013: confirmação de email (não obrigatória). Contas funcionam sem confirmar; o perfil mostra o estado.
alter table public.profiles add column if not exists email_verified_at timestamptz;

create table private.email_verifications (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index private_email_verifications_user_idx on private.email_verifications (user_id, created_at desc);

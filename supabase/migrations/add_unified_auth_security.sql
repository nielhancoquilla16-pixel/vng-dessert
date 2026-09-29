alter table if exists public.profiles
  add column if not exists email_verified boolean not null default false,
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verification_sent_at timestamptz,
  add column if not exists email_verification_expires_at timestamptz,
  add column if not exists email_verification_attempts integer not null default 0,
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists last_login_at timestamptz;

update public.profiles
set email_verified = true,
    email_verified_at = coalesce(email_verified_at, created_at)
where role in ('admin', 'staff')
  and email_verified = false;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  action text not null,
  target_id uuid,
  target_type text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_actor_id_idx
on public.audit_logs (actor_id);

create index if not exists audit_logs_action_idx
on public.audit_logs (action);

create index if not exists audit_logs_created_at_idx
on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read"
on public.audit_logs
for select
to authenticated
using (public.get_my_role() = 'admin');

-- Run before deploying Super Admin handover. The oldest existing admin starts
-- as Super Admin. Reapplying this migration preserves an existing handover.
begin;

alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

alter table public.profiles drop constraint if exists profiles_super_admin_role_check;
alter table public.profiles add constraint profiles_super_admin_role_check
  check (not is_super_admin or role = 'admin');

create unique index if not exists profiles_one_super_admin_idx
  on public.profiles (is_super_admin) where is_super_admin;

-- Serialize initialization with account creation and ownership transfer.
select pg_advisory_xact_lock(651904203);
update public.profiles set is_super_admin = true
where id = (select id from public.profiles where role = 'admin'
  order by created_at, id limit 1)
and not exists (select 1 from public.profiles where is_super_admin);

-- A fresh installation acquires its first Super Admin when its first admin
-- profile is created; customer and staff accounts never receive this flag.
create or replace function public.initialize_super_admin()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  if new.role = 'admin' then
    perform pg_advisory_xact_lock(651904203);
    new.is_super_admin := not exists (
      select 1 from public.profiles where is_super_admin and id <> new.id
    );
  else
    new.is_super_admin := false;
  end if;
  return new;
end;
$$;
drop trigger if exists initialize_super_admin on public.profiles;
create trigger initialize_super_admin before insert on public.profiles
  for each row execute function public.initialize_super_admin();

-- Also protects an auth.users cascade and requests that were opened before
-- ownership changed. The current Super Admin must hand over before deletion.
create or replace function public.protect_super_admin_deletion()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  if old.is_super_admin then
    raise exception 'SUPER_ADMIN_PROTECTED';
  end if;
  return old;
end;
$$;
drop trigger if exists protect_super_admin_deletion on public.profiles;
create trigger protect_super_admin_deletion before delete on public.profiles
  for each row execute function public.protect_super_admin_deletion();

-- The backend supplies the authenticated actor. Both flags change in one
-- transaction, and concurrent/stale requests recheck ownership under a lock.
create or replace function public.transfer_super_admin(p_actor_id uuid, p_target_id uuid)
returns uuid language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(651904203);
  perform id from public.profiles
    where id = p_actor_id and role = 'admin' and is_super_admin for update;
  if not found then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  if p_target_id is null or p_target_id = p_actor_id then
    raise exception 'SUPER_ADMIN_TARGET_INVALID';
  end if;
  perform id from public.profiles
    where id = p_target_id and role = 'admin' for update;
  if not found then raise exception 'SUPER_ADMIN_TARGET_INVALID'; end if;

  update public.profiles set is_super_admin = false where id = p_actor_id;
  update public.profiles set is_super_admin = true where id = p_target_id;
  return p_target_id;
end;
$$;

-- Profiles and ownership are written only through the authenticated backend.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke all on function public.initialize_super_admin() from public, anon, authenticated;
revoke all on function public.protect_super_admin_deletion() from public, anon, authenticated;
revoke all on function public.transfer_super_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_super_admin(uuid, uuid) to service_role;

commit;

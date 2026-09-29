-- POS cash tendering and customer saved delivery addresses.

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Home' check (label in ('Home', 'Work', 'Other')),
  recipient_name text not null,
  phone_number text not null,
  street_address text,
  barangay text,
  city text,
  province text,
  region text,
  postal_code text,
  formatted_address text not null,
  place_id text,
  latitude numeric(12, 8),
  longitude numeric(12, 8),
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_addresses_user_id_idx
  on public.customer_addresses (user_id, updated_at desc);

create unique index if not exists customer_addresses_one_default_per_user_idx
  on public.customer_addresses (user_id)
  where is_default;

-- Preserve existing profile addresses as a starting default address where possible.
insert into public.customer_addresses (
  user_id,
  label,
  recipient_name,
  phone_number,
  formatted_address,
  is_default
)
select
  profiles.id,
  'Home',
  coalesce(nullif(trim(profiles.full_name), ''), nullif(trim(profiles.username), ''), 'Customer'),
  coalesce(nullif(trim(profiles.phone_number), ''), ''),
  trim(profiles.address),
  true
from public.profiles
where nullif(trim(profiles.address), '') is not null
  and not exists (
    select 1
    from public.customer_addresses
    where customer_addresses.user_id = profiles.id
  );

alter table if exists public.orders
  add column if not exists delivery_address_id uuid references public.customer_addresses(id) on delete set null,
  add column if not exists cash_received numeric(12, 2),
  add column if not exists change_amount numeric(12, 2);

alter table if exists public.orders drop constraint if exists orders_cash_received_check;
alter table if exists public.orders
  add constraint orders_cash_received_check
  check (cash_received is null or cash_received >= 0);

alter table if exists public.orders drop constraint if exists orders_change_amount_check;
alter table if exists public.orders
  add constraint orders_change_amount_check
  check (change_amount is null or change_amount >= 0);

create index if not exists orders_delivery_address_id_idx
  on public.orders (delivery_address_id);

alter table if exists public.payment_checkouts
  add column if not exists delivery_address_id uuid references public.customer_addresses(id) on delete set null;

create index if not exists payment_checkouts_delivery_address_id_idx
  on public.payment_checkouts (delivery_address_id);

drop trigger if exists set_customer_addresses_updated_at on public.customer_addresses;
create trigger set_customer_addresses_updated_at
before update on public.customer_addresses
for each row execute function public.set_updated_at();

alter table public.customer_addresses enable row level security;

drop policy if exists "customer_addresses_select_own_or_staff" on public.customer_addresses;
create policy "customer_addresses_select_own_or_staff"
on public.customer_addresses
for select
to authenticated
using (user_id = auth.uid() or public.get_my_role() in ('admin', 'staff'));

drop policy if exists "customer_addresses_insert_own" on public.customer_addresses;
create policy "customer_addresses_insert_own"
on public.customer_addresses
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "customer_addresses_update_own" on public.customer_addresses;
create policy "customer_addresses_update_own"
on public.customer_addresses
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "customer_addresses_delete_own" on public.customer_addresses;
create policy "customer_addresses_delete_own"
on public.customer_addresses
for delete
to authenticated
using (user_id = auth.uid());

alter table public.customer_addresses replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_addresses'
  ) then
    alter publication supabase_realtime add table public.customer_addresses;
  end if;
end $$;

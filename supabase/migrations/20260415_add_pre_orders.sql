create table if not exists public.pre_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  customer_name text not null,
  phone_number text not null,
  address text not null,
  quantity integer not null check (quantity > 0),
  preferred_order_date date not null,
  preferred_order_time time not null,
  pickup_date date,
  pickup_time time,
  scheduled_date date not null,
  scheduled_time time not null,
  delivery_method text not null default 'cod' check (delivery_method in ('cod', 'pickup')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'rejected')),
  rejection_reason text,
  notifications jsonb not null default '[]'::jsonb,
  status_timestamps jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.pre_orders
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists customer_name text not null default '',
  add column if not exists phone_number text not null default '',
  add column if not exists address text not null default '',
  add column if not exists quantity integer not null default 1,
  add column if not exists preferred_order_date date,
  add column if not exists preferred_order_time time,
  add column if not exists pickup_date date,
  add column if not exists pickup_time time,
  add column if not exists scheduled_date date,
  add column if not exists scheduled_time time,
  add column if not exists delivery_method text not null default 'cod',
  add column if not exists status text not null default 'pending',
  add column if not exists rejection_reason text,
  add column if not exists notifications jsonb not null default '[]'::jsonb,
  add column if not exists status_timestamps jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.pre_orders drop constraint if exists pre_orders_quantity_check;
alter table if exists public.pre_orders
  add constraint pre_orders_quantity_check
  check (quantity > 0);

alter table if exists public.pre_orders drop constraint if exists pre_orders_delivery_method_check;
alter table if exists public.pre_orders
  add constraint pre_orders_delivery_method_check
  check (delivery_method in ('cod', 'pickup'));

alter table if exists public.pre_orders drop constraint if exists pre_orders_status_check;
alter table if exists public.pre_orders
  add constraint pre_orders_status_check
  check (status in ('pending', 'confirmed', 'completed', 'rejected'));

create index if not exists pre_orders_schedule_idx
on public.pre_orders (scheduled_date, scheduled_time);

create index if not exists pre_orders_status_idx
on public.pre_orders (status);

drop trigger if exists set_pre_orders_updated_at on public.pre_orders;
create trigger set_pre_orders_updated_at
before update on public.pre_orders
for each row
execute function public.set_updated_at();

alter table public.pre_orders enable row level security;

drop policy if exists "pre_orders_customer_insert" on public.pre_orders;
create policy "pre_orders_customer_insert"
on public.pre_orders
for insert
to authenticated
with check (
  user_id = auth.uid()
);

drop policy if exists "pre_orders_select_own_or_staff" on public.pre_orders;
create policy "pre_orders_select_own_or_staff"
on public.pre_orders
for select
to authenticated
using (
  user_id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
);

drop policy if exists "pre_orders_staff_update" on public.pre_orders;
create policy "pre_orders_staff_update"
on public.pre_orders
for update
to authenticated
using (public.get_my_role() in ('admin', 'staff'))
with check (public.get_my_role() in ('admin', 'staff'));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pre_orders'
  ) then
    alter publication supabase_realtime add table public.pre_orders;
  end if;
end
$$;

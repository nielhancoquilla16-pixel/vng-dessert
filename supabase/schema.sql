create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.get_my_role()
returns text
language sql
stable
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  email text,
  full_name text,
  role text not null default 'customern' check (role in ('customer', 'admin', 'staff')),
  address text,
  phone_number text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null,
  stock_quantity integer not null default 0,
  unit text not null,
  status text not null default 'in stock' check (status in ('in stock', 'low stock', 'out of stock')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  category text not null,
  stock_quantity integer not null default 0,
  availability text not null default 'available' check (availability in ('available', 'out of stock', 'hidden')),
  image_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_code text,
  customer_name text,
  phone_number text,
  address text,
  delivery_method text not null default 'pickup' check (delivery_method in ('delivery', 'pickup')),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'gcash')),
  total_price numeric(10, 2) not null default 0 check (total_price >= 0),
  order_status text not null default 'pending' check (order_status in ('pending', 'confirmed', 'preparing', 'ready', 'processing', 'completed', 'received', 'delivered', 'cancelled')),
  qr_claimed_at timestamptz,
  ready_notified_at timestamptz,
  ready_notification_message text,
  receipt_image_url text,
  receipt_received_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payment_checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'paymongo' check (provider in ('paymongo')),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'expired', 'cancelled', 'fulfilled')),
  payment_method text not null default 'online' check (payment_method in ('gcash', 'online')),
  reference_number text not null unique,
  checkout_session_id text unique,
  checkout_url text,
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  currency text not null default 'PHP',
  customer_name text,
  customer_email text,
  phone_number text,
  address text,
  delivery_method text not null default 'pickup' check (delivery_method in ('delivery', 'pickup')),
  delivery_distance_km numeric(10, 2),
  line_items jsonb not null default '[]'::jsonb,
  payment_intent_id text,
  payment_id text,
  failure_reason text,
  order_id uuid references public.orders(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_issue_reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null,
  issue_type text not null default 'damage',
  description text not null,
  evidence_image_url text not null,
  detection_date timestamptz not null default timezone('utc', now()),
  review_status text not null default 'under_review' check (review_status in ('under_review', 'approved', 'rejected')),
  review_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  price numeric(10, 2) not null check (price >= 0)
);

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unique (cart_id, product_id)
);

alter table if exists public.profiles
  add column if not exists username text,
  add column if not exists email text;

alter table if exists public.products
  add column if not exists stock_quantity integer not null default 0;

alter table if exists public.orders
  add column if not exists customer_name text,
  add column if not exists phone_number text,
  add column if not exists address text,
  add column if not exists order_code text,
  add column if not exists delivery_method text not null default 'pickup',
  add column if not exists payment_method text not null default 'cash',
  add column if not exists qr_claimed_at timestamptz,
  add column if not exists ready_notified_at timestamptz,
  add column if not exists ready_notification_message text,
  add column if not exists receipt_image_url text,
  add column if not exists receipt_received_at timestamptz,
  add column if not exists review_status text not null default 'none',
  add column if not exists review_reason text,
  add column if not exists review_status_updated_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists delivery_distance_km numeric(10, 2),
  add column if not exists contains_leche_flan boolean not null default false,
  add column if not exists inventory_deducted_at timestamptz,
  add column if not exists notifications jsonb not null default '[]'::jsonb,
  add column if not exists status_timestamps jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.payment_checkouts
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists phone_number text,
  add column if not exists address text,
  add column if not exists delivery_method text not null default 'pickup',
  add column if not exists payment_method text not null default 'online',
  add column if not exists delivery_distance_km numeric(10, 2),
  add column if not exists line_items jsonb not null default '[]'::jsonb,
  add column if not exists payment_intent_id text,
  add column if not exists payment_id text,
  add column if not exists failure_reason text,
  add column if not exists order_id uuid references public.orders(id) on delete set null,
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.order_issue_reports
  add column if not exists customer_name text not null default 'Customer',
  add column if not exists issue_type text not null default 'damage',
  add column if not exists description text not null default '',
  add column if not exists evidence_image_url text not null default '',
  add column if not exists detection_date timestamptz not null default timezone('utc', now()),
  add column if not exists review_status text not null default 'under_review',
  add column if not exists review_reason text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists profiles_username_unique_idx
on public.profiles (lower(username))
where username is not null;

create unique index if not exists profiles_email_unique_idx
on public.profiles (lower(email))
where email is not null;

alter table if exists public.profiles drop constraint if exists profiles_role_check;
alter table if exists public.profiles
  add constraint profiles_role_check
  check (role in ('customer', 'admin', 'staff'));

alter table if exists public.inventory drop constraint if exists inventory_status_check;
alter table if exists public.inventory
  add constraint inventory_status_check
  check (status in ('in stock', 'low stock', 'out of stock'));

alter table if exists public.products drop constraint if exists products_availability_check;
alter table if exists public.products
  add constraint products_availability_check
  check (availability in ('available', 'out of stock', 'hidden'));

alter table if exists public.orders drop constraint if exists orders_order_status_check;
alter table if exists public.orders
  add constraint orders_order_status_check
  check (order_status in ('pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed', 'cancelled', 'refunded'));

alter table if exists public.orders drop constraint if exists orders_review_status_check;
alter table if exists public.orders
  add constraint orders_review_status_check
  check (review_status in ('none', 'under_review', 'approved', 'rejected'));

alter table if exists public.orders drop constraint if exists orders_delivery_method_check;
alter table if exists public.orders
  add constraint orders_delivery_method_check
  check (delivery_method in ('delivery', 'pickup'));

alter table if exists public.orders drop constraint if exists orders_payment_method_check;
alter table if exists public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('cash', 'gcash', 'online'));

create unique index if not exists orders_order_code_unique_idx
on public.orders (order_code)
where order_code is not null;

alter table if exists public.payment_checkouts drop constraint if exists payment_checkouts_provider_check;
alter table if exists public.payment_checkouts
  add constraint payment_checkouts_provider_check
  check (provider in ('paymongo'));

alter table if exists public.payment_checkouts drop constraint if exists payment_checkouts_status_check;
alter table if exists public.payment_checkouts
  add constraint payment_checkouts_status_check
  check (status in ('created', 'paid', 'failed', 'expired', 'cancelled', 'fulfilled'));

alter table if exists public.payment_checkouts drop constraint if exists payment_checkouts_delivery_method_check;
alter table if exists public.payment_checkouts
  add constraint payment_checkouts_delivery_method_check
  check (delivery_method in ('delivery', 'pickup'));

alter table if exists public.payment_checkouts drop constraint if exists payment_checkouts_payment_method_check;
alter table if exists public.payment_checkouts
  add constraint payment_checkouts_payment_method_check
  check (payment_method in ('gcash', 'online'));

drop trigger if exists set_inventory_updated_at on public.inventory;
create trigger set_inventory_updated_at
before update on public.inventory
for each row
execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

drop trigger if exists set_payment_checkouts_updated_at on public.payment_checkouts;
create trigger set_payment_checkouts_updated_at
before update on public.payment_checkouts
for each row
execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

drop trigger if exists set_order_issue_reports_updated_at on public.order_issue_reports;
create trigger set_order_issue_reports_updated_at
before update on public.order_issue_reports
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.inventory enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.payment_checkouts enable row level security;
alter table public.order_issue_reports enable row level security;
alter table public.order_items enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

drop policy if exists "profiles_select_self_or_staff" on public.profiles;
create policy "profiles_select_self_or_staff"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
);

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.get_my_role() = 'admin'
)
with check (
  id = auth.uid()
  or public.get_my_role() = 'admin'
);

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
on public.products
for select
to anon, authenticated
using (availability <> 'hidden');

drop policy if exists "products_admin_manage" on public.products;
create policy "products_admin_manage"
on public.products
for all
to authenticated
using (public.get_my_role() = 'admin')
with check (public.get_my_role() = 'admin');

drop policy if exists "inventory_staff_manage" on public.inventory;
create policy "inventory_staff_manage"
on public.inventory
for all
to authenticated
using (public.get_my_role() in ('admin', 'staff'))
with check (public.get_my_role() in ('admin', 'staff'));

drop policy if exists "orders_customer_insert" on public.orders;
create policy "orders_customer_insert"
on public.orders
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
);

drop policy if exists "orders_select_own_or_staff" on public.orders;
create policy "orders_select_own_or_staff"
on public.orders
for select
to authenticated
using (
  user_id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
);

drop policy if exists "orders_staff_update" on public.orders;
create policy "orders_staff_update"
on public.orders
for update
to authenticated
using (public.get_my_role() in ('admin', 'staff'))
with check (public.get_my_role() in ('admin', 'staff'));

drop policy if exists "payment_checkouts_select_own_or_staff" on public.payment_checkouts;
create policy "payment_checkouts_select_own_or_staff"
on public.payment_checkouts
for select
to authenticated
using (
  user_id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
);

drop policy if exists "payment_checkouts_insert_own_or_staff" on public.payment_checkouts;
create policy "payment_checkouts_insert_own_or_staff"
on public.payment_checkouts
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
);

drop policy if exists "payment_checkouts_update_own_or_staff" on public.payment_checkouts;
create policy "payment_checkouts_update_own_or_staff"
on public.payment_checkouts
for update
to authenticated
using (
  user_id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
)
with check (
  user_id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
);

drop policy if exists "order_issue_reports_select_own_or_staff" on public.order_issue_reports;
create policy "order_issue_reports_select_own_or_staff"
on public.order_issue_reports
for select
to authenticated
using (
  user_id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
);

drop policy if exists "order_issue_reports_insert_own_or_staff" on public.order_issue_reports;
create policy "order_issue_reports_insert_own_or_staff"
on public.order_issue_reports
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
);

drop policy if exists "order_issue_reports_update_staff" on public.order_issue_reports;
create policy "order_issue_reports_update_staff"
on public.order_issue_reports
for update
to authenticated
using (public.get_my_role() in ('admin', 'staff'))
with check (public.get_my_role() in ('admin', 'staff'));

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_issue_reports'
  ) then
    alter publication supabase_realtime add table public.order_issue_reports;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory'
  ) then
    alter publication supabase_realtime add table public.inventory;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payment_checkouts'
  ) then
    alter publication supabase_realtime add table public.payment_checkouts;
  end if;
end
$$;

drop policy if exists "order_items_select_own_or_staff" on public.order_items;
create policy "order_items_select_own_or_staff"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and (
        orders.user_id = auth.uid()
        or public.get_my_role() in ('admin', 'staff')
      )
  )
);

drop policy if exists "order_items_insert_own_or_staff" on public.order_items;
create policy "order_items_insert_own_or_staff"
on public.order_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and (
        orders.user_id = auth.uid()
        or public.get_my_role() in ('admin', 'staff')
      )
  )
);

drop policy if exists "carts_manage_own" on public.carts;
create policy "carts_manage_own"
on public.carts
for all
to authenticated
using (
  user_id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
)
with check (
  user_id = auth.uid()
  or public.get_my_role() in ('admin', 'staff')
);

drop policy if exists "cart_items_manage_own" on public.cart_items;
create policy "cart_items_manage_own"
on public.cart_items
for all
to authenticated
using (
  exists (
    select 1
    from public.carts
    where carts.id = cart_items.cart_id
      and (
        carts.user_id = auth.uid()
        or public.get_my_role() in ('admin', 'staff')
      )
  )
)
with check (
  exists (
    select 1
    from public.carts
    where carts.id = cart_items.cart_id
      and (
        carts.user_id = auth.uid()
        or public.get_my_role() in ('admin', 'staff')
      )
  )
);

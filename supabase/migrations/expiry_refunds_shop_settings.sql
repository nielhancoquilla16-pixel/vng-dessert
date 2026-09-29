alter table if exists public.products
  alter column stock_quantity type numeric(12, 4) using stock_quantity::numeric,
  add column if not exists expiration_at timestamptz;

alter table if exists public.inventory
  alter column stock_quantity type numeric(12, 4) using stock_quantity::numeric,
  add column if not exists expiration_at timestamptz;

update public.products
set expiration_at = (expiration_date::timestamp + time '23:59:00') at time zone 'Asia/Manila'
where expiration_at is null and expiration_date is not null;

update public.inventory
set expiration_at = (expiration_date::timestamp + time '23:59:00') at time zone 'Asia/Manila'
where expiration_at is null and expiration_date is not null;

alter table if exists public.products drop constraint if exists products_availability_check;
alter table if exists public.products
  add constraint products_availability_check
  check (availability in ('available', 'out of stock', 'hidden', 'expired'));

create index if not exists products_expiration_at_idx on public.products (expiration_at);
create index if not exists inventory_expiration_at_idx on public.inventory (expiration_at);

create table if not exists public.shop_settings (
  id integer primary key check (id = 1),
  shop_name text not null default 'V&G Leche Flan',
  address text not null,
  phone_number text,
  opening_time time not null default time '08:00:00',
  closing_time time not null default time '20:00:00',
  preorder_time_slots jsonb not null default '[]'::jsonb,
  latitude numeric(12, 8),
  longitude numeric(12, 8),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint shop_settings_operating_hours_check check (opening_time <> closing_time)
);

insert into public.shop_settings (id, address)
values (1, 'Monark Subdivision, Las Pinas, Philippines')
on conflict (id) do nothing;

create table if not exists public.return_refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null default 'refund' check (request_type in ('return', 'refund')),
  reason text not null,
  customer_message text,
  evidence_image_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'processing', 'refunded', 'completed', 'rejected')),
  rejection_reason text,
  status_history jsonb not null default '[]'::jsonb,
  approved_at timestamptz,
  processing_at timestamptz,
  refunded_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.return_refund_requests
  add column if not exists evidence_image_url text;

alter table if exists public.orders
  add column if not exists return_refund_status text not null default 'none',
  add column if not exists return_refund_request_id uuid references public.return_refund_requests(id) on delete set null;

alter table if exists public.orders drop constraint if exists orders_return_refund_status_check;
alter table if exists public.orders
  add constraint orders_return_refund_status_check
  check (return_refund_status in ('none', 'pending', 'approved', 'processing', 'refunded', 'completed', 'rejected'));

create index if not exists return_refund_requests_order_id_idx on public.return_refund_requests (order_id);
create index if not exists return_refund_requests_status_idx on public.return_refund_requests (status, created_at desc);

drop trigger if exists set_shop_settings_updated_at on public.shop_settings;
create trigger set_shop_settings_updated_at
before update on public.shop_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_return_refund_requests_updated_at on public.return_refund_requests;
create trigger set_return_refund_requests_updated_at
before update on public.return_refund_requests
for each row execute function public.set_updated_at();

alter table public.shop_settings enable row level security;
alter table public.return_refund_requests enable row level security;

drop policy if exists "shop_settings_public_read" on public.shop_settings;
create policy "shop_settings_public_read" on public.shop_settings for select to anon, authenticated using (true);
drop policy if exists "shop_settings_admin_update" on public.shop_settings;
create policy "shop_settings_admin_update" on public.shop_settings for update to authenticated using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
drop policy if exists "shop_settings_admin_insert" on public.shop_settings;
create policy "shop_settings_admin_insert" on public.shop_settings for insert to authenticated with check (public.get_my_role() = 'admin');

drop policy if exists "return_refund_requests_select_own_or_staff" on public.return_refund_requests;
create policy "return_refund_requests_select_own_or_staff" on public.return_refund_requests for select to authenticated using (user_id = auth.uid() or public.get_my_role() in ('admin', 'staff'));
drop policy if exists "return_refund_requests_insert_own" on public.return_refund_requests;
create policy "return_refund_requests_insert_own" on public.return_refund_requests for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "return_refund_requests_update_staff" on public.return_refund_requests;
create policy "return_refund_requests_update_staff" on public.return_refund_requests for update to authenticated using (public.get_my_role() in ('admin', 'staff')) with check (public.get_my_role() in ('admin', 'staff'));

alter table public.shop_settings replica identity full;
alter table public.return_refund_requests replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shop_settings'
  ) then
    alter publication supabase_realtime add table public.shop_settings;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'return_refund_requests'
  ) then
    alter publication supabase_realtime add table public.return_refund_requests;
  end if;
end $$;

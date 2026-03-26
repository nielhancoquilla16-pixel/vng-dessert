alter table if exists public.orders
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
  add column if not exists delivery_distance_km numeric(10, 2);

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

alter table if exists public.orders drop constraint if exists orders_order_status_check;
alter table if exists public.orders
  add constraint orders_order_status_check
  check (order_status in ('pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed', 'cancelled', 'refunded'));

alter table if exists public.orders drop constraint if exists orders_review_status_check;
alter table if exists public.orders
  add constraint orders_review_status_check
  check (review_status in ('none', 'under_review', 'approved', 'rejected'));

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

alter table public.order_issue_reports enable row level security;

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

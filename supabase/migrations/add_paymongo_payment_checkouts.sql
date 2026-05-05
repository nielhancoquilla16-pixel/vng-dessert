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
  line_items jsonb not null default '[]'::jsonb,
  payment_intent_id text,
  payment_id text,
  failure_reason text,
  order_id uuid references public.orders(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.orders drop constraint if exists orders_payment_method_check;
alter table if exists public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('cash', 'gcash', 'online'));

drop trigger if exists set_payment_checkouts_updated_at on public.payment_checkouts;
create trigger set_payment_checkouts_updated_at
before update on public.payment_checkouts
for each row
execute function public.set_updated_at();

alter table public.payment_checkouts enable row level security;

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

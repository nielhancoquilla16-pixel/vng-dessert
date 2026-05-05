create table if not exists public.sales_reports (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  report_date date not null,
  report_month date not null,
  payment_type text not null default 'cash' check (payment_type in ('cash', 'gcash', 'online', 'card', 'other')),
  total_quantity integer not null default 0 check (total_quantity >= 0),
  total_sales numeric(10, 2) not null default 0 check (total_sales >= 0),
  submitted_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sales_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.sales_reports(id) on delete cascade,
  item_name text not null,
  quantity integer not null default 0 check (quantity > 0),
  total_sales numeric(10, 2) not null default 0 check (total_sales >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.sales_reports
  add column if not exists staff_id uuid references public.profiles(id) on delete cascade,
  add column if not exists report_date date,
  add column if not exists report_month date,
  add column if not exists payment_type text not null default 'cash',
  add column if not exists total_quantity integer not null default 0,
  add column if not exists total_sales numeric(10, 2) not null default 0,
  add column if not exists submitted_at timestamptz not null default timezone('utc', now()),
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.sales_report_items
  add column if not exists report_id uuid references public.sales_reports(id) on delete cascade,
  add column if not exists item_name text not null default '',
  add column if not exists quantity integer not null default 0,
  add column if not exists total_sales numeric(10, 2) not null default 0,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.sales_reports drop constraint if exists sales_reports_payment_type_check;
alter table if exists public.sales_reports
  add constraint sales_reports_payment_type_check
  check (payment_type in ('cash', 'gcash', 'online', 'card', 'other'));

alter table if exists public.sales_reports drop constraint if exists sales_reports_total_quantity_check;
alter table if exists public.sales_reports
  add constraint sales_reports_total_quantity_check
  check (total_quantity >= 0);

alter table if exists public.sales_reports drop constraint if exists sales_reports_total_sales_check;
alter table if exists public.sales_reports
  add constraint sales_reports_total_sales_check
  check (total_sales >= 0);

alter table if exists public.sales_report_items drop constraint if exists sales_report_items_quantity_check;
alter table if exists public.sales_report_items
  add constraint sales_report_items_quantity_check
  check (quantity > 0);

alter table if exists public.sales_report_items drop constraint if exists sales_report_items_total_sales_check;
alter table if exists public.sales_report_items
  add constraint sales_report_items_total_sales_check
  check (total_sales >= 0);

create index if not exists sales_reports_staff_id_idx
on public.sales_reports (staff_id);

create index if not exists sales_reports_report_month_idx
on public.sales_reports (report_month);

create index if not exists sales_reports_report_date_idx
on public.sales_reports (report_date);

create index if not exists sales_report_items_report_id_idx
on public.sales_report_items (report_id);

drop trigger if exists set_sales_reports_updated_at on public.sales_reports;
create trigger set_sales_reports_updated_at
before update on public.sales_reports
for each row
execute function public.set_updated_at();

drop trigger if exists set_sales_report_items_updated_at on public.sales_report_items;
create trigger set_sales_report_items_updated_at
before update on public.sales_report_items
for each row
execute function public.set_updated_at();

alter table public.sales_reports enable row level security;
alter table public.sales_report_items enable row level security;

drop policy if exists "sales_reports_select_own_or_admin" on public.sales_reports;
create policy "sales_reports_select_own_or_admin"
on public.sales_reports
for select
to authenticated
using (
  staff_id = auth.uid()
  or public.get_my_role() = 'admin'
);

drop policy if exists "sales_reports_insert_own_or_admin" on public.sales_reports;
create policy "sales_reports_insert_own_or_admin"
on public.sales_reports
for insert
to authenticated
with check (
  staff_id = auth.uid()
  or public.get_my_role() = 'admin'
);

drop policy if exists "sales_reports_update_own_or_admin" on public.sales_reports;
create policy "sales_reports_update_own_or_admin"
on public.sales_reports
for update
to authenticated
using (
  staff_id = auth.uid()
  or public.get_my_role() = 'admin'
)
with check (
  staff_id = auth.uid()
  or public.get_my_role() = 'admin'
);

drop policy if exists "sales_report_items_select_parent_owner_or_admin" on public.sales_report_items;
create policy "sales_report_items_select_parent_owner_or_admin"
on public.sales_report_items
for select
to authenticated
using (
  exists (
    select 1
    from public.sales_reports
    where sales_reports.id = sales_report_items.report_id
      and (
        sales_reports.staff_id = auth.uid()
        or public.get_my_role() = 'admin'
      )
  )
);

drop policy if exists "sales_report_items_insert_parent_owner_or_admin" on public.sales_report_items;
create policy "sales_report_items_insert_parent_owner_or_admin"
on public.sales_report_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.sales_reports
    where sales_reports.id = sales_report_items.report_id
      and (
        sales_reports.staff_id = auth.uid()
        or public.get_my_role() = 'admin'
      )
  )
);

drop policy if exists "sales_report_items_update_parent_owner_or_admin" on public.sales_report_items;
create policy "sales_report_items_update_parent_owner_or_admin"
on public.sales_report_items
for update
to authenticated
using (
  exists (
    select 1
    from public.sales_reports
    where sales_reports.id = sales_report_items.report_id
      and (
        sales_reports.staff_id = auth.uid()
        or public.get_my_role() = 'admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.sales_reports
    where sales_reports.id = sales_report_items.report_id
      and (
        sales_reports.staff_id = auth.uid()
        or public.get_my_role() = 'admin'
      )
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sales_reports'
  ) then
    alter publication supabase_realtime add table public.sales_reports;
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
      and tablename = 'sales_report_items'
  ) then
    alter publication supabase_realtime add table public.sales_report_items;
  end if;
end
$$;

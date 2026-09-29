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

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  email text,
  full_name text,
  role text not null default 'customer' check (role in ('customer', 'admin', 'staff')),
  address text,
  phone_number text,
  terms_accepted boolean not null default false,
  terms_accepted_at timestamptz,
  terms_version text,
  email_verified boolean not null default false,
  email_verified_at timestamptz,
  email_verification_sent_at timestamptz,
  email_verification_expires_at timestamptz,
  email_verification_attempts integer not null default 0,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.get_my_role()
returns text
language sql
stable
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null,
  product_name text not null,
  batch_id text not null,
  stock_quantity integer not null default 0,
  unit text not null,
  status text not null default 'no date' check (status in ('fresh', 'expiring soon', 'expired', 'no date')),
  date_created date,
  expiration_date date,
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
  date_created date,
  expiration_date date,
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
  delivery_distance_km numeric(10, 2),
  delivery_recipient_name text,
  delivery_contact_number text,
  delivery_street_address text,
  delivery_barangay text,
  delivery_city text,
  delivery_province text,
  delivery_postal_code text,
  delivery_formatted_address text,
  delivery_place_id text,
  delivery_latitude numeric(12, 8),
  delivery_longitude numeric(12, 8),
  delivery_instructions text,
  lalamove_order_id text,
  lalamove_quotation_id text,
  lalamove_status text,
  lalamove_share_link text,
  lalamove_driver_id text,
  lalamove_driver_info jsonb not null default '{}'::jsonb,
  lalamove_price_breakdown jsonb,
  lalamove_distance_meters integer,
  lalamove_estimated_delivery_at timestamptz,
  lalamove_booked_at timestamptz,
  lalamove_last_synced_at timestamptz,
  lalamove_booking_error text,
  lalamove_metadata jsonb not null default '{}'::jsonb,
  qr_claimed_at timestamptz,
  ready_notified_at timestamptz,
  ready_notification_message text,
  receipt_image_url text,
  receipt_received_at timestamptz,
  verification_required boolean not null default true,
  qr_token text,
  qr_generated_at timestamptz,
  qr_expires_at timestamptz,
  qr_used_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  verification_method text check (verification_method in ('qr', 'order_id', 'manual')),
  created_at timestamptz not null default timezone('utc', now())
);

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
  delivery_recipient_name text,
  delivery_contact_number text,
  delivery_street_address text,
  delivery_barangay text,
  delivery_city text,
  delivery_province text,
  delivery_postal_code text,
  delivery_formatted_address text,
  delivery_place_id text,
  delivery_latitude numeric(12, 8),
  delivery_longitude numeric(12, 8),
  line_items jsonb not null default '[]'::jsonb,
  payment_intent_id text,
  payment_id text,
  failure_reason text,
  order_id uuid references public.orders(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.site_content (
  id integer primary key,
  src text not null,
  title text not null,
  text text,
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

create table if not exists public.product_recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  output_unit text not null default 'pcs',
  output_label text not null default 'pcs',
  accent text not null default '#f97316',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.product_recipes(id) on delete cascade,
  ingredient_name text not null,
  quantity numeric(12, 4) not null default 0 check (quantity > 0),
  unit text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
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

alter table if exists public.profiles
  add column if not exists username text,
  add column if not exists email text,
  add column if not exists terms_accepted boolean not null default false,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists email_verified boolean not null default false,
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verification_sent_at timestamptz,
  add column if not exists email_verification_expires_at timestamptz,
  add column if not exists email_verification_attempts integer not null default 0,
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists last_login_at timestamptz;

alter table if exists public.products
  add column if not exists stock_quantity integer not null default 0;

alter table if exists public.products
  add column if not exists date_created date,
  add column if not exists expiration_date date;

alter table if exists public.inventory
  add column if not exists product_name text,
  add column if not exists batch_id text,
  add column if not exists date_created date,
  add column if not exists expiration_date date;

alter table if exists public.inventory
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists image_url text,
  add column if not exists category text;

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
  add column if not exists delivery_recipient_name text,
  add column if not exists delivery_contact_number text,
  add column if not exists delivery_street_address text,
  add column if not exists delivery_barangay text,
  add column if not exists delivery_city text,
  add column if not exists delivery_province text,
  add column if not exists delivery_postal_code text,
  add column if not exists delivery_formatted_address text,
  add column if not exists delivery_place_id text,
  add column if not exists delivery_latitude numeric(12, 8),
  add column if not exists delivery_longitude numeric(12, 8),
  add column if not exists delivery_instructions text,
  add column if not exists contains_leche_flan boolean not null default false,
  add column if not exists inventory_deducted_at timestamptz,
  add column if not exists lalamove_order_id text,
  add column if not exists lalamove_quotation_id text,
  add column if not exists lalamove_status text,
  add column if not exists lalamove_share_link text,
  add column if not exists lalamove_driver_id text,
  add column if not exists lalamove_driver_info jsonb not null default '{}'::jsonb,
  add column if not exists lalamove_price_breakdown jsonb,
  add column if not exists lalamove_distance_meters integer,
  add column if not exists lalamove_estimated_delivery_at timestamptz,
  add column if not exists lalamove_booked_at timestamptz,
  add column if not exists lalamove_last_synced_at timestamptz,
  add column if not exists lalamove_booking_error text,
  add column if not exists lalamove_metadata jsonb not null default '{}'::jsonb,
  add column if not exists verification_required boolean not null default true,
  add column if not exists qr_token text,
  add column if not exists qr_generated_at timestamptz,
  add column if not exists qr_expires_at timestamptz,
  add column if not exists qr_used_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verification_method text,
  add column if not exists notifications jsonb not null default '[]'::jsonb,
  add column if not exists status_timestamps jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

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

alter table if exists public.payment_checkouts
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists phone_number text,
  add column if not exists address text,
  add column if not exists delivery_method text not null default 'pickup',
  add column if not exists payment_method text not null default 'online',
  add column if not exists delivery_distance_km numeric(10, 2),
  add column if not exists delivery_recipient_name text,
  add column if not exists delivery_contact_number text,
  add column if not exists delivery_street_address text,
  add column if not exists delivery_barangay text,
  add column if not exists delivery_city text,
  add column if not exists delivery_province text,
  add column if not exists delivery_postal_code text,
  add column if not exists delivery_formatted_address text,
  add column if not exists delivery_place_id text,
  add column if not exists delivery_latitude numeric(12, 8),
  add column if not exists delivery_longitude numeric(12, 8),
  add column if not exists line_items jsonb not null default '[]'::jsonb,
  add column if not exists payment_intent_id text,
  add column if not exists payment_id text,
  add column if not exists failure_reason text,
  add column if not exists order_id uuid references public.orders(id) on delete set null,
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.site_content
  add column if not exists src text not null default '',
  add column if not exists title text not null default '',
  add column if not exists text text,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
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

alter table if exists public.product_recipes
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists output_unit text not null default 'pcs',
  add column if not exists output_label text not null default 'pcs',
  add column if not exists accent text not null default '#f97316',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.product_recipe_items
  add column if not exists recipe_id uuid references public.product_recipes(id) on delete cascade,
  add column if not exists ingredient_name text not null default '',
  add column if not exists quantity numeric(12, 4) not null default 0,
  add column if not exists unit text not null default 'pcs',
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists profiles_username_unique_idx
on public.profiles (lower(username))
where username is not null;

create unique index if not exists profiles_email_unique_idx
on public.profiles (lower(email))
where email is not null;

create index if not exists profiles_locked_until_idx
on public.profiles (locked_until);

create index if not exists audit_logs_actor_id_idx
on public.audit_logs (actor_id);

create index if not exists audit_logs_action_idx
on public.audit_logs (action);

create index if not exists audit_logs_created_at_idx
on public.audit_logs (created_at desc);

create unique index if not exists inventory_batch_id_unique_idx
on public.inventory (lower(batch_id));

create index if not exists inventory_expiration_date_idx
on public.inventory (expiration_date);

create index if not exists inventory_product_name_idx
on public.inventory (lower(product_name));

create index if not exists inventory_product_id_idx
on public.inventory (product_id);

create index if not exists sales_reports_staff_id_idx
on public.sales_reports (staff_id);

create index if not exists sales_reports_report_month_idx
on public.sales_reports (report_month);

create index if not exists sales_reports_report_date_idx
on public.sales_reports (report_date);

create index if not exists sales_report_items_report_id_idx
on public.sales_report_items (report_id);

create unique index if not exists product_recipes_product_id_unique_idx
on public.product_recipes (product_id);

create index if not exists product_recipe_items_recipe_id_idx
on public.product_recipe_items (recipe_id);

create index if not exists product_recipe_items_recipe_sort_order_idx
on public.product_recipe_items (recipe_id, sort_order);

create unique index if not exists product_recipe_items_recipe_ingredient_unique_idx
on public.product_recipe_items (recipe_id, lower(ingredient_name));

alter table if exists public.profiles drop constraint if exists profiles_role_check;
alter table if exists public.profiles
  add constraint profiles_role_check
  check (role in ('customer', 'admin', 'staff'));

update public.profiles
set email_verified = true,
    email_verified_at = coalesce(email_verified_at, created_at)
where role in ('admin', 'staff')
  and email_verified = false;

alter table if exists public.inventory drop constraint if exists inventory_status_check;
alter table if exists public.inventory
  add constraint inventory_status_check
  check (status in ('fresh', 'expiring soon', 'expired', 'no date'));

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

alter table if exists public.orders drop constraint if exists orders_verification_method_check;
alter table if exists public.orders
  add constraint orders_verification_method_check
  check (
    verification_method is null
    or verification_method in ('qr', 'order_id', 'manual')
  );

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

alter table if exists public.product_recipe_items drop constraint if exists product_recipe_items_quantity_check;
alter table if exists public.product_recipe_items
  add constraint product_recipe_items_quantity_check
  check (quantity > 0);

create unique index if not exists orders_order_code_unique_idx
on public.orders (order_code)
where order_code is not null;

create unique index if not exists orders_qr_token_unique_idx
on public.orders (qr_token)
where qr_token is not null;

create unique index if not exists orders_lalamove_order_id_unique_idx
on public.orders (lalamove_order_id)
where lalamove_order_id is not null;

create index if not exists orders_qr_used_at_idx
on public.orders (qr_used_at);

create index if not exists orders_lalamove_status_idx
on public.orders (lalamove_status)
where lalamove_status is not null;

create index if not exists pre_orders_schedule_idx
on public.pre_orders (scheduled_date, scheduled_time);

create index if not exists pre_orders_status_idx
on public.pre_orders (status);

create index if not exists site_content_updated_at_idx
on public.site_content (updated_at);

create or replace function public.build_product_inventory_batch_id(target_product_id uuid)
returns text
language sql
immutable
as $$
  select case
    when target_product_id is null then 'TRAY-UNASSIGNED'
    else 'TRAY-' || upper(substr(replace(target_product_id::text, '-', ''), 1, 8))
  end
$$;

create or replace function public.get_inventory_batch_status_sql(
  target_date_created date,
  target_expiration_date date,
  warning_days integer default 5
)
returns text
language plpgsql
stable
as $$
declare
  safe_warning_days integer := greatest(1, least(30, coalesce(warning_days, 5)));
  days_until_expiry integer;
begin
  if target_date_created is null or target_expiration_date is null then
    return 'no date';
  end if;

  days_until_expiry := target_expiration_date - current_date;

  if days_until_expiry < 0 then
    return 'expired';
  end if;

  if days_until_expiry <= safe_warning_days then
    return 'expiring soon';
  end if;

  return 'fresh';
end;
$$;

create or replace function public.sync_inventory_from_product(target_product_id uuid)
returns void
language plpgsql
as $$
declare
  product_row public.products%rowtype;
  selected_inventory_id uuid;
  canonical_batch_id text;
  effective_date_created date;
  effective_expiration_date date;
  effective_unit text;
begin
  select *
  into product_row
  from public.products
  where id = target_product_id;

  if not found then
    return;
  end if;

  canonical_batch_id := public.build_product_inventory_batch_id(product_row.id);

  select inv.id,
         coalesce(inv.date_created, product_row.date_created, product_row.created_at::date, current_date),
         coalesce(inv.expiration_date, product_row.expiration_date),
         coalesce(nullif(trim(inv.unit), ''), 'pcs')
  into selected_inventory_id, effective_date_created, effective_expiration_date, effective_unit
  from public.inventory inv
  where inv.product_id = product_row.id
     or (
       upper(coalesce(inv.batch_id, '')) not like 'ING-%'
       and lower(trim(coalesce(inv.product_name, inv.ingredient_name, ''))) = lower(trim(product_row.product_name))
     )
  order by case
      when upper(coalesce(inv.batch_id, '')) = upper(canonical_batch_id) then 0
      else 1
    end,
    inv.updated_at desc nulls last,
    inv.created_at desc nulls last
  limit 1;

  effective_date_created := coalesce(product_row.date_created, effective_date_created, product_row.created_at::date, current_date);
  effective_expiration_date := coalesce(product_row.expiration_date, effective_expiration_date);
  effective_unit := coalesce(nullif(trim(effective_unit), ''), 'pcs');

  if selected_inventory_id is null then
    insert into public.inventory (
      product_id,
      ingredient_name,
      product_name,
      batch_id,
      stock_quantity,
      unit,
      status,
      date_created,
      expiration_date,
      image_url,
      category
    )
    values (
      product_row.id,
      product_row.product_name,
      product_row.product_name,
      canonical_batch_id,
      greatest(0, coalesce(product_row.stock_quantity, 0)),
      effective_unit,
      public.get_inventory_batch_status_sql(effective_date_created, effective_expiration_date),
      effective_date_created,
      effective_expiration_date,
      product_row.image_url,
      product_row.category
    );

    select id
    into selected_inventory_id
    from public.inventory
    where lower(batch_id) = lower(canonical_batch_id)
    limit 1;
  else
    update public.inventory
    set product_id = product_row.id,
        ingredient_name = product_row.product_name,
        product_name = product_row.product_name,
        batch_id = canonical_batch_id,
        stock_quantity = greatest(0, coalesce(product_row.stock_quantity, 0)),
        unit = effective_unit,
        status = public.get_inventory_batch_status_sql(effective_date_created, effective_expiration_date),
        date_created = effective_date_created,
        expiration_date = effective_expiration_date,
        image_url = product_row.image_url,
        category = product_row.category
    where id = selected_inventory_id;
  end if;

  delete from public.inventory inv
  where inv.id <> selected_inventory_id
    and (
      inv.product_id = product_row.id
      or (
        upper(coalesce(inv.batch_id, '')) not like 'ING-%'
        and lower(trim(coalesce(inv.product_name, inv.ingredient_name, ''))) = lower(trim(product_row.product_name))
      )
    );
end;
$$;

create or replace function public.sync_product_from_inventory(
  explicit_product_id uuid default null,
  explicit_product_name text default null
)
returns void
language plpgsql
as $$
declare
  product_row public.products%rowtype;
  next_stock integer := 0;
begin
  if explicit_product_id is not null then
    select *
    into product_row
    from public.products
    where id = explicit_product_id;
  elsif coalesce(trim(explicit_product_name), '') <> '' then
    select *
    into product_row
    from public.products
    where lower(trim(product_name)) = lower(trim(explicit_product_name))
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1;
  end if;

  if not found then
    return;
  end if;

  update public.inventory inv
  set product_id = product_row.id,
      ingredient_name = product_row.product_name,
      product_name = product_row.product_name,
      image_url = coalesce(product_row.image_url, inv.image_url),
      category = coalesce(product_row.category, inv.category)
  where inv.product_id = product_row.id
     or (
       inv.product_id is null
       and upper(coalesce(inv.batch_id, '')) not like 'ING-%'
       and lower(trim(coalesce(inv.product_name, inv.ingredient_name, ''))) = lower(trim(product_row.product_name))
     );

  select coalesce(sum(greatest(inv.stock_quantity, 0)), 0)::integer
  into next_stock
  from public.inventory inv
  where inv.product_id = product_row.id
     or (
       upper(coalesce(inv.batch_id, '')) not like 'ING-%'
       and lower(trim(coalesce(inv.product_name, inv.ingredient_name, ''))) = lower(trim(product_row.product_name))
     );

  update public.products
  set stock_quantity = next_stock,
      availability = case
        when availability = 'hidden' then 'hidden'
        when next_stock <= 0 then 'out of stock'
        else 'available'
      end
  where id = product_row.id;
end;
$$;

create or replace function public.handle_products_inventory_sync()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    delete from public.inventory inv
    where inv.product_id = old.id
       or (
         upper(coalesce(inv.batch_id, '')) not like 'ING-%'
         and lower(trim(coalesce(inv.product_name, inv.ingredient_name, ''))) = lower(trim(old.product_name))
       );
    return old;
  end if;

  perform public.sync_inventory_from_product(new.id);
  return new;
end;
$$;

create or replace function public.handle_inventory_product_sync()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    perform public.sync_product_from_inventory(old.product_id, old.product_name);
    return old;
  end if;

  perform public.sync_product_from_inventory(new.product_id, new.product_name);
  return new;
end;
$$;

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

drop trigger if exists sync_inventory_from_products_trigger on public.products;
create trigger sync_inventory_from_products_trigger
after insert or update or delete on public.products
for each row
execute function public.handle_products_inventory_sync();

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

drop trigger if exists set_pre_orders_updated_at on public.pre_orders;
create trigger set_pre_orders_updated_at
before update on public.pre_orders
for each row
execute function public.set_updated_at();

drop trigger if exists set_order_issue_reports_updated_at on public.order_issue_reports;
create trigger set_order_issue_reports_updated_at
before update on public.order_issue_reports
for each row
execute function public.set_updated_at();

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

drop trigger if exists set_product_recipes_updated_at on public.product_recipes;
create trigger set_product_recipes_updated_at
before update on public.product_recipes
for each row
execute function public.set_updated_at();

drop trigger if exists set_product_recipe_items_updated_at on public.product_recipe_items;
create trigger set_product_recipe_items_updated_at
before update on public.product_recipe_items
for each row
execute function public.set_updated_at();

alter table public.site_content replica identity full;

drop trigger if exists set_site_content_updated_at on public.site_content;
create trigger set_site_content_updated_at
before update on public.site_content
for each row
execute function public.set_updated_at();

drop trigger if exists sync_product_from_inventory_trigger on public.inventory;
create trigger sync_product_from_inventory_trigger
after insert or update or delete on public.inventory
for each row
execute function public.handle_inventory_product_sync();

alter table public.profiles enable row level security;
alter table public.inventory enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.pre_orders enable row level security;
alter table public.payment_checkouts enable row level security;
alter table public.site_content enable row level security;
alter table public.order_issue_reports enable row level security;
alter table public.sales_reports enable row level security;
alter table public.sales_report_items enable row level security;
alter table public.product_recipes enable row level security;
alter table public.product_recipe_items enable row level security;
alter table public.order_items enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.audit_logs enable row level security;

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

drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read"
on public.audit_logs
for select
to authenticated
using (public.get_my_role() = 'admin');

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

drop policy if exists "site_content_select_public" on public.site_content;
create policy "site_content_select_public"
on public.site_content
for select
to anon, authenticated
using (true);

drop policy if exists "site_content_insert_admin_staff" on public.site_content;
create policy "site_content_insert_admin_staff"
on public.site_content
for insert
to authenticated
with check (public.get_my_role() in ('admin', 'staff'));

drop policy if exists "site_content_update_admin_staff" on public.site_content;
create policy "site_content_update_admin_staff"
on public.site_content
for update
to authenticated
using (public.get_my_role() in ('admin', 'staff'))
with check (public.get_my_role() in ('admin', 'staff'));

drop policy if exists "site_content_delete_admin_staff" on public.site_content;
create policy "site_content_delete_admin_staff"
on public.site_content
for delete
to authenticated
using (public.get_my_role() in ('admin', 'staff'));

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

drop policy if exists "product_recipes_select_staff" on public.product_recipes;
create policy "product_recipes_select_staff"
on public.product_recipes
for select
to authenticated
using (public.get_my_role() in ('admin', 'staff'));

drop policy if exists "product_recipe_items_select_staff" on public.product_recipe_items;
create policy "product_recipe_items_select_staff"
on public.product_recipe_items
for select
to authenticated
using (public.get_my_role() in ('admin', 'staff'));

do $$
declare
  recipe_row record;
  current_recipe_id uuid;
begin
  for recipe_row in
    select
      p.id as product_id,
      seed.product_key,
      seed.output_unit,
      seed.output_label,
      seed.accent
    from public.products p
    join (
      values
        ('lecheflan', 'pcs', 'pcs (round mold)', '#f59e0b'),
        ('ubehalayaflan', 'pcs', 'pcs (round mold)', '#8b5cf6'),
        ('crinkles', 'pcs', 'pcs', '#6b4f3b'),
        ('doublechocoinverse', 'pcs', 'pcs (8x3 pan)', '#7c2d12'),
        ('cheesyensaymada', 'pcs', 'pcs', '#facc15'),
        ('mangograhamfloat', 'pcs', 'pcs (small tub)', '#fb923c'),
        ('cookiesandcreamiceboxcake', 'pcs', 'pcs (small tub)', '#64748b')
    ) as seed(product_key, output_unit, output_label, accent)
      on regexp_replace(lower(coalesce(p.product_name, '')), '[^a-z0-9]+', '', 'g') = seed.product_key
  loop
    insert into public.product_recipes (
      product_id,
      output_unit,
      output_label,
      accent
    )
    values (
      recipe_row.product_id,
      recipe_row.output_unit,
      recipe_row.output_label,
      recipe_row.accent
    )
    on conflict (product_id) do update
    set output_unit = excluded.output_unit,
        output_label = excluded.output_label,
        accent = excluded.accent
    returning id into current_recipe_id;

    delete from public.product_recipe_items
    where recipe_id = current_recipe_id;

    insert into public.product_recipe_items (
      recipe_id,
      ingredient_name,
      quantity,
      unit,
      sort_order
    )
    select
      current_recipe_id,
      item.ingredient_name,
      item.quantity,
      item.unit,
      item.sort_order
    from (
      values
        ('lecheflan', 0, 'Egg', 6::numeric, 'pcs'),
        ('lecheflan', 1, 'Condensed Milk (390g)', 0.3333::numeric, 'cans'),
        ('lecheflan', 2, 'Evaporated Milk (370ml)', 0.3333::numeric, 'cans'),
        ('lecheflan', 3, 'All-Purpose Cream (250ml)', 0.25::numeric, 'packs'),
        ('lecheflan', 4, 'Sugar', 2::numeric, 'tbsp'),
        ('lecheflan', 5, 'Vanilla Extract', 0.125::numeric, 'tsp'),
        ('ubehalayaflan', 0, 'Egg', 6::numeric, 'pcs'),
        ('ubehalayaflan', 1, 'Condensed Milk (390g)', 0.3333::numeric, 'cans'),
        ('ubehalayaflan', 2, 'Evaporated Milk (370ml)', 0.3333::numeric, 'cans'),
        ('ubehalayaflan', 3, 'All-Purpose Cream (250ml)', 0.25::numeric, 'packs'),
        ('ubehalayaflan', 4, 'Ube Halaya', 0.5::numeric, 'cups'),
        ('ubehalayaflan', 5, 'Sugar', 2::numeric, 'tbsp'),
        ('ubehalayaflan', 6, 'Vanilla Extract', 0.125::numeric, 'tsp'),
        ('crinkles', 0, 'All-Purpose Flour', 0.18::numeric, 'cups'),
        ('crinkles', 1, 'Cocoa Powder', 0.08::numeric, 'cups'),
        ('crinkles', 2, 'Sugar', 0.08::numeric, 'cups'),
        ('crinkles', 3, 'Butter', 0.04::numeric, 'cups'),
        ('crinkles', 4, 'Egg', 0.12::numeric, 'pcs'),
        ('crinkles', 5, 'Vanilla Extract', 0.03::numeric, 'tsp'),
        ('doublechocoinverse', 0, 'All-Purpose Flour', 0.22::numeric, 'cups'),
        ('doublechocoinverse', 1, 'Cocoa Powder', 0.09::numeric, 'cups'),
        ('doublechocoinverse', 2, 'Chocolate Chips', 0.08::numeric, 'cups'),
        ('doublechocoinverse', 3, 'Butter', 0.05::numeric, 'cups'),
        ('doublechocoinverse', 4, 'Milk', 0.05::numeric, 'cups'),
        ('doublechocoinverse', 5, 'Egg', 0.15::numeric, 'pcs'),
        ('cheesyensaymada', 0, 'All-Purpose Flour', 0.2::numeric, 'cups'),
        ('cheesyensaymada', 1, 'Milk', 0.08::numeric, 'cups'),
        ('cheesyensaymada', 2, 'Butter', 0.04::numeric, 'cups'),
        ('cheesyensaymada', 3, 'Sugar', 0.04::numeric, 'cups'),
        ('cheesyensaymada', 4, 'Condensed Milk (390g)', 0.05::numeric, 'cans'),
        ('cheesyensaymada', 5, 'Vanilla Extract', 0.02::numeric, 'tsp'),
        ('mangograhamfloat', 0, 'Crushed Graham', 0.18::numeric, 'cups'),
        ('mangograhamfloat', 1, 'All-Purpose Cream (250ml)', 0.18::numeric, 'packs'),
        ('mangograhamfloat', 2, 'Condensed Milk (390g)', 0.08::numeric, 'cans'),
        ('mangograhamfloat', 3, 'Milk', 0.04::numeric, 'cups'),
        ('mangograhamfloat', 4, 'Sugar', 0.01::numeric, 'cups'),
        ('cookiesandcreamiceboxcake', 0, 'Crushed Graham', 0.16::numeric, 'cups'),
        ('cookiesandcreamiceboxcake', 1, 'All-Purpose Cream (250ml)', 0.2::numeric, 'packs'),
        ('cookiesandcreamiceboxcake', 2, 'Condensed Milk (390g)', 0.08::numeric, 'cans'),
        ('cookiesandcreamiceboxcake', 3, 'Chocolate Chips', 0.08::numeric, 'cups'),
        ('cookiesandcreamiceboxcake', 4, 'Milk', 0.05::numeric, 'cups')
    ) as item(product_key, sort_order, ingredient_name, quantity, unit)
    where item.product_key = recipe_row.product_key;
  end loop;
end
$$;

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
      and tablename = 'pre_orders'
  ) then
    alter publication supabase_realtime add table public.pre_orders;
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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'product_recipes'
  ) then
    alter publication supabase_realtime add table public.product_recipes;
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
      and tablename = 'product_recipe_items'
  ) then
    alter publication supabase_realtime add table public.product_recipe_items;
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

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'site_content'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'site_content'
  ) then
    alter publication supabase_realtime add table public.site_content;
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

-- Timestamp expiry, configurable shop settings, and synchronized return/refund requests.
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

-- Order-specific QR feedback workflow.
alter table if exists public.orders
  add column if not exists feedback_token text,
  add column if not exists feedback_token_generated_at timestamptz;

create unique index if not exists orders_feedback_token_unique_idx
on public.orders (feedback_token)
where feedback_token is not null;

create table if not exists public.order_feedback (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  product_rating integer,
  service_rating integer,
  fulfillment_rating integer,
  comment text,
  customer_name text,
  customer_id uuid references public.profiles(id) on delete set null,
  is_anonymous boolean not null default true,
  status text not null default 'new' check (status in ('new', 'viewed', 'acknowledged')),
  invalid_reason text,
  purchased_items jsonb not null default '[]'::jsonb,
  transaction_at timestamptz,
  submitted_at timestamptz not null default timezone('utc', now()),
  viewed_at timestamptz,
  viewed_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (product_rating is null or product_rating between 1 and 5),
  check (service_rating is null or service_rating between 1 and 5),
  check (fulfillment_rating is null or fulfillment_rating between 1 and 5)
);

create index if not exists order_feedback_order_id_idx on public.order_feedback (order_id);
create index if not exists order_feedback_submitted_at_idx on public.order_feedback (submitted_at desc);
create index if not exists order_feedback_rating_idx on public.order_feedback (rating);
create index if not exists order_feedback_status_submitted_at_idx on public.order_feedback (status, submitted_at desc);

create or replace function public.touch_order_feedback_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_order_feedback_updated_at on public.order_feedback;
create trigger set_order_feedback_updated_at
before update on public.order_feedback
for each row execute function public.touch_order_feedback_updated_at();

create or replace function public.prevent_duplicate_order_feedback()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.order_id::text));

  if exists (
    select 1 from public.order_feedback where order_id = new.order_id and id <> new.id
  ) then
    raise exception 'Feedback has already been submitted for this order.' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_order_feedback on public.order_feedback;
create trigger prevent_duplicate_order_feedback
before insert on public.order_feedback
for each row execute function public.prevent_duplicate_order_feedback();

alter table public.order_feedback replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_feedback'
  ) then
    alter publication supabase_realtime add table public.order_feedback;
  end if;
end $$;

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

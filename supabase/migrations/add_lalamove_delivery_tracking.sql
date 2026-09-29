alter table if exists public.orders
  add column if not exists delivery_latitude numeric(12, 8),
  add column if not exists delivery_longitude numeric(12, 8),
  add column if not exists delivery_instructions text,
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
  add column if not exists lalamove_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists orders_lalamove_order_id_unique_idx
on public.orders (lalamove_order_id)
where lalamove_order_id is not null;

create index if not exists orders_lalamove_status_idx
on public.orders (lalamove_status)
where lalamove_status is not null;

alter table public.orders
  add column if not exists qr_expires_at timestamptz;

update public.orders
set qr_expires_at = coalesce(qr_generated_at, created_at, now()) + interval '6 minutes'
where qr_token is not null
  and qr_expires_at is null;

update public.orders
set qr_expires_at = null
where qr_token is null
  and qr_expires_at is not null;

create index if not exists orders_qr_expires_at_idx
on public.orders (qr_expires_at)
where qr_expires_at is not null;

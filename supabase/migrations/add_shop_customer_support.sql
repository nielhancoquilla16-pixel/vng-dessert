-- Public, optional information for customer support. Never copy private profiles.
-- The empty default intentionally makes no claims about owners or offers.
alter table if exists public.shop_settings
  add column if not exists customer_support jsonb not null default '{}'::jsonb;

comment on column public.shop_settings.customer_support is
  'Published customer support text: owner, supplier, email, services, physicalStore, discounts, promotions. Empty values are unavailable; offer text does not change checkout totals.';

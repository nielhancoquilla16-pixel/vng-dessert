alter table if exists public.orders
  add column if not exists delivery_recipient_name text,
  add column if not exists delivery_contact_number text,
  add column if not exists delivery_street_address text,
  add column if not exists delivery_barangay text,
  add column if not exists delivery_city text,
  add column if not exists delivery_province text,
  add column if not exists delivery_postal_code text,
  add column if not exists delivery_formatted_address text,
  add column if not exists delivery_place_id text;

alter table if exists public.payment_checkouts
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
  add column if not exists delivery_longitude numeric(12, 8);

alter table if exists public.inventory
  add column if not exists product_name text,
  add column if not exists batch_id text,
  add column if not exists date_created date,
  add column if not exists expiration_date date;

update public.inventory
set product_name = coalesce(nullif(product_name, ''), ingredient_name, 'Unlabeled Batch')
where product_name is null or product_name = '';

update public.inventory
set batch_id = coalesce(nullif(batch_id, ''), 'LEGACY-' || upper(substr(replace(id::text, '-', ''), 1, 8)))
where batch_id is null or batch_id = '';

update public.inventory
set date_created = coalesce(date_created, created_at::date, current_date)
where date_created is null;

update public.inventory
set ingredient_name = coalesce(nullif(ingredient_name, ''), product_name, 'Unlabeled Batch')
where ingredient_name is null or ingredient_name = '';

alter table if exists public.inventory drop constraint if exists inventory_status_check;

alter table if exists public.inventory
  alter column status set default 'no date';

update public.inventory
set status = case
  when date_created is null or expiration_date is null then 'no date'
  when expiration_date < current_date then 'expired'
  when expiration_date <= current_date + 5 then 'expiring soon'
  else 'fresh'
end;

alter table if exists public.inventory
  alter column product_name set not null;

alter table if exists public.inventory
  alter column batch_id set not null;

drop index if exists public.inventory_batch_id_unique_idx;
create unique index if not exists inventory_batch_id_unique_idx
on public.inventory (lower(batch_id));

create index if not exists inventory_expiration_date_idx
on public.inventory (expiration_date);

create index if not exists inventory_product_name_idx
on public.inventory (lower(product_name));

alter table if exists public.inventory drop constraint if exists inventory_status_check;
alter table if exists public.inventory
  add constraint inventory_status_check
  check (status in ('fresh', 'expiring soon', 'expired', 'no date'));

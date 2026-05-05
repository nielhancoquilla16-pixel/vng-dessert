-- Bidirectional sync between products and finished-product inventory batches.
-- This makes product stock the source of truth when editing Products,
-- while inventory adjustments still recalculate product stock automatically.

alter table if exists public.products
  add column if not exists date_created date,
  add column if not exists expiration_date date;

alter table if exists public.inventory
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists image_url text,
  add column if not exists category text;

create index if not exists inventory_product_id_idx
on public.inventory (product_id);

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

drop trigger if exists sync_inventory_from_products_trigger on public.products;
create trigger sync_inventory_from_products_trigger
after insert or update or delete on public.products
for each row
execute function public.handle_products_inventory_sync();

drop trigger if exists sync_product_from_inventory_trigger on public.inventory;
create trigger sync_product_from_inventory_trigger
after insert or update or delete on public.inventory
for each row
execute function public.handle_inventory_product_sync();

-- One-time cleanup to normalize existing rows after the trigger is installed.
do $$
declare
  product_row record;
begin
  for product_row in
    select id
    from public.products
  loop
    perform public.sync_inventory_from_product(product_row.id);
  end loop;
end;
$$;

-- Saved quantity offers and private admin financial data.
begin;

-- Role checks must bypass profile RLS to avoid recursive policy evaluation.
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

alter table public.products add column if not exists discount_enabled boolean;
alter table public.products add column if not exists discount_tiers jsonb not null default '[]'::jsonb;
-- NULL preserves existing flyer offers until an administrator saves this product.
alter table public.products drop constraint if exists products_discount_tiers_shape;
alter table public.products add constraint products_discount_tiers_shape
  check (jsonb_typeof(discount_tiers) = 'array' and jsonb_array_length(discount_tiers) <= 10);

create table if not exists public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  cost_price numeric(10,2) not null check (cost_price >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_item_costs (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  unit_cost numeric(10,2) not null check (unit_cost >= 0),
  captured_at timestamptz not null default now()
);

alter table public.product_costs enable row level security;
alter table public.order_item_costs enable row level security;
revoke all on public.product_costs, public.order_item_costs from anon, authenticated;
grant select on public.product_costs, public.order_item_costs to authenticated;
grant all on public.product_costs, public.order_item_costs to service_role;

drop policy if exists admin_cost_access on public.product_costs;
create policy admin_cost_access on public.product_costs for select to authenticated
  using (public.get_my_role() = 'admin');
drop policy if exists admin_sale_cost_access on public.order_item_costs;
create policy admin_sale_cost_access on public.order_item_costs for select to authenticated
  using (public.get_my_role() = 'admin');

drop trigger if exists product_costs_updated_at on public.product_costs;
create trigger product_costs_updated_at before update on public.product_costs
  for each row execute function public.set_updated_at();

-- Capture the cost at purchase, including POS and online payment fulfillment.
-- Price or quantity changes retain that cost; replacing the product captures its cost.
create or replace function public.capture_order_item_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if new.product_id is not distinct from old.product_id then return new; end if;
    delete from public.order_item_costs where order_item_id = new.id;
  end if;
  insert into public.order_item_costs (order_item_id, unit_cost)
    select new.id, cost_price from public.product_costs where product_id = new.product_id
    on conflict (order_item_id) do nothing;
  return new;
end;
$$;
revoke all on function public.capture_order_item_cost() from public, anon, authenticated;
drop trigger if exists order_item_cost_snapshot on public.order_items;
create trigger order_item_cost_snapshot after insert or update of product_id on public.order_items
  for each row execute function public.capture_order_item_cost();

-- Historical items intentionally have no snapshot: past cost cannot be inferred.
commit;


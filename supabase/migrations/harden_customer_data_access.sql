-- Security permissions only: no tables, columns, customer records, or workflows
-- are added/removed. Browser writes go through the existing validated API.
begin;

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = auth.uid()
$$;

-- Prevent profile self-updates from changing role, verification, lockouts or
-- terms flags. The Express service role performs validated writes for all roles.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.orders, public.order_items,
  public.pre_orders, public.payment_checkouts, public.carts, public.cart_items,
  public.customer_addresses, public.order_issue_reports, public.return_refund_requests
  from anon, authenticated;

-- Realtime and REST both expose complete database rows. Customers use the
-- projected public API; internal rows remain accessible to authorized staff.
drop policy if exists products_customer_boundary on public.products;
create policy products_customer_boundary on public.products as restrictive
for select to anon, authenticated using (public.get_my_role() in ('admin', 'staff'));
drop policy if exists shop_settings_customer_boundary on public.shop_settings;
create policy shop_settings_customer_boundary on public.shop_settings as restrictive
for select to anon, authenticated using (public.get_my_role() in ('admin', 'staff'));

-- Do not allow a profile flag, forged user metadata or a direct Auth signup
-- without an application profile to grant access to protected data.
create or replace function public.is_verified_app_user()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and (p.role in ('admin', 'staff') or (p.role = 'customer' and u.email_confirmed_at is not null))
  )
$$;

do $$
declare protected_table text;
begin
  foreach protected_table in array array[
    'profiles', 'inventory', 'orders', 'order_items', 'pre_orders',
    'payment_checkouts', 'carts', 'cart_items', 'customer_addresses',
    'order_issue_reports', 'return_refund_requests', 'sales_reports',
    'sales_report_items', 'product_recipes', 'product_recipe_items', 'audit_logs'
  ] loop
    execute format('drop policy if exists verified_app_account_boundary on public.%I', protected_table);
    execute format('create policy verified_app_account_boundary on public.%I as restrictive for all to authenticated using (public.is_verified_app_user()) with check (public.is_verified_app_user())', protected_table);
  end loop;
  foreach protected_table in array array[
    'inventory', 'sales_reports', 'sales_report_items', 'product_recipes', 'product_recipe_items'
  ] loop
    execute format('drop policy if exists staff_data_boundary on public.%I', protected_table);
    execute format('create policy staff_data_boundary on public.%I as restrictive for all to anon, authenticated using (public.get_my_role() in (''admin'', ''staff'')) with check (public.get_my_role() in (''admin'', ''staff''))', protected_table);
  end loop;
end $$;

commit;

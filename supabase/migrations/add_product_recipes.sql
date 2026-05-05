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

create unique index if not exists product_recipes_product_id_unique_idx
on public.product_recipes (product_id);

create index if not exists product_recipe_items_recipe_id_idx
on public.product_recipe_items (recipe_id);

create index if not exists product_recipe_items_recipe_sort_order_idx
on public.product_recipe_items (recipe_id, sort_order);

create unique index if not exists product_recipe_items_recipe_ingredient_unique_idx
on public.product_recipe_items (recipe_id, lower(ingredient_name));

alter table if exists public.product_recipe_items drop constraint if exists product_recipe_items_quantity_check;
alter table if exists public.product_recipe_items
  add constraint product_recipe_items_quantity_check
  check (quantity > 0);

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

alter table public.product_recipes enable row level security;
alter table public.product_recipe_items enable row level security;

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

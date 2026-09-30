-- Add estimated starter recipes for catalog products that do not yet have a
-- saved recipe. Existing recipes are deliberately left untouched. These
-- quantities are estimates and should be calibrated against the shop's batches.

alter table public.product_recipes
  add column if not exists is_estimate boolean not null default false;

do $$
declare
  recipe_row record;
  current_recipe_id uuid;
begin
  for recipe_row in
    select p.id as product_id, seed.product_key, seed.output_unit,
      seed.output_label, seed.accent
    from public.products p
    join (
      values
        ('lecheflan', 'pcs', 'pcs (round mold)', '#f59e0b'),
        ('doublechocoinverse', 'pcs', 'pcs (8x3 pan)', '#7c2d12'),
        ('mangograhamfloat', 'pcs', 'pcs (small tub)', '#fb923c'),
        ('ubecringkles', 'pcs', 'pcs', '#8b5cf6'),
        ('redvelvetcringkles', 'pcs', 'pcs', '#ef4444'),
        ('chocolatecringkles', 'pcs', 'pcs', '#78350f'),
        ('grahamdelechechocomousse', 'pcs', 'pcs (small tub)', '#7c2d12'),
        ('grahamdelecheubehalaya', 'pcs', 'pcs (small tub)', '#8b5cf6'),
        ('realubehalaya', 'pcs', 'pcs (tub)', '#8b5cf6'),
        ('lecheflancakeube', 'pcs', 'pcs (cake mold)', '#8b5cf6'),
        ('lecheflancakechoco', 'pcs', 'pcs (cake mold)', '#7c2d12'),
        ('grahamdeleche', 'pcs', 'pcs (small tub)', '#d97706'),
        ('ubeflan', 'pcs', 'pcs (round mold)', '#8b5cf6'),
        ('chococaramelbars', 'pcs', 'pcs', '#b45309'),
        ('chocorevelbars', 'pcs', 'pcs', '#78350f')
    ) as seed(product_key, output_unit, output_label, accent)
      on regexp_replace(lower(coalesce(p.product_name, '')), '[^a-z0-9]+', '', 'g') = seed.product_key
  loop
    current_recipe_id := null;

    insert into public.product_recipes (
      product_id, output_unit, output_label, accent, is_estimate
    )
    values (
      recipe_row.product_id, recipe_row.output_unit, recipe_row.output_label,
      recipe_row.accent, true
    )
    on conflict (product_id) do nothing
    returning id into current_recipe_id;

    -- Preserve any recipe an admin already configured for this product.
    if current_recipe_id is null then
      continue;
    end if;

    insert into public.product_recipe_items (
      recipe_id, ingredient_name, quantity, unit, sort_order
    )
    select current_recipe_id, item.ingredient_name, item.quantity, item.unit, item.sort_order
    from (
      values
        ('lecheflan', 0, 'Egg', 6::numeric, 'pcs'),
        ('lecheflan', 1, 'Condensed Milk (390g)', 0.3333::numeric, 'cans'),
        ('lecheflan', 2, 'Evaporated Milk (370ml)', 0.3333::numeric, 'cans'),
        ('lecheflan', 3, 'All-Purpose Cream (250ml)', 0.25::numeric, 'packs'),
        ('lecheflan', 4, 'Sugar', 2::numeric, 'tbsp'),
        ('lecheflan', 5, 'Vanilla Extract', 0.125::numeric, 'tsp'),
        ('doublechocoinverse', 0, 'All-Purpose Flour', 0.22::numeric, 'cups'),
        ('doublechocoinverse', 1, 'Cocoa Powder', 0.09::numeric, 'cups'),
        ('doublechocoinverse', 2, 'Chocolate Chips', 0.08::numeric, 'cups'),
        ('doublechocoinverse', 3, 'Butter', 0.05::numeric, 'cups'),
        ('doublechocoinverse', 4, 'Milk', 0.05::numeric, 'cups'),
        ('doublechocoinverse', 5, 'Egg', 0.15::numeric, 'pcs'),
        ('mangograhamfloat', 0, 'Crushed Graham', 0.18::numeric, 'cups'),
        ('mangograhamfloat', 1, 'All-Purpose Cream (250ml)', 0.18::numeric, 'packs'),
        ('mangograhamfloat', 2, 'Condensed Milk (390g)', 0.08::numeric, 'cans'),
        ('mangograhamfloat', 3, 'Milk', 0.04::numeric, 'cups'),
        ('mangograhamfloat', 4, 'Sugar', 0.01::numeric, 'cups'),
        ('mangograhamfloat', 5, 'Mango', 0.5::numeric, 'pcs'),
        ('ubecringkles', 0, 'All-Purpose Flour', 0.18::numeric, 'cups'),
        ('ubecringkles', 1, 'Sugar', 0.08::numeric, 'cups'),
        ('ubecringkles', 2, 'Butter', 0.04::numeric, 'cups'),
        ('ubecringkles', 3, 'Egg', 0.12::numeric, 'pcs'),
        ('ubecringkles', 4, 'Ube Halaya', 0.06::numeric, 'cups'),
        ('ubecringkles', 5, 'Vanilla Extract', 0.03::numeric, 'tsp'),
        ('redvelvetcringkles', 0, 'All-Purpose Flour', 0.18::numeric, 'cups'),
        ('redvelvetcringkles', 1, 'Cocoa Powder', 0.02::numeric, 'cups'),
        ('redvelvetcringkles', 2, 'Sugar', 0.1::numeric, 'cups'),
        ('redvelvetcringkles', 3, 'Butter', 0.04::numeric, 'cups'),
        ('redvelvetcringkles', 4, 'Egg', 0.12::numeric, 'pcs'),
        ('redvelvetcringkles', 5, 'Cream Cheese', 0.04::numeric, 'cups'),
        ('redvelvetcringkles', 6, 'Red Food Coloring', 0.01::numeric, 'tsp'),
        ('redvelvetcringkles', 7, 'Vanilla Extract', 0.03::numeric, 'tsp'),
        ('chocolatecringkles', 0, 'All-Purpose Flour', 0.18::numeric, 'cups'),
        ('chocolatecringkles', 1, 'Cocoa Powder', 0.08::numeric, 'cups'),
        ('chocolatecringkles', 2, 'Chocolate Chips', 0.04::numeric, 'cups'),
        ('chocolatecringkles', 3, 'Sugar', 0.08::numeric, 'cups'),
        ('chocolatecringkles', 4, 'Butter', 0.04::numeric, 'cups'),
        ('chocolatecringkles', 5, 'Egg', 0.12::numeric, 'pcs'),
        ('chocolatecringkles', 6, 'Vanilla Extract', 0.03::numeric, 'tsp'),
        ('grahamdelechechocomousse', 0, 'Crushed Graham', 0.12::numeric, 'cups'),
        ('grahamdelechechocomousse', 1, 'All-Purpose Cream (250ml)', 0.16::numeric, 'packs'),
        ('grahamdelechechocomousse', 2, 'Condensed Milk (390g)', 0.06::numeric, 'cans'),
        ('grahamdelechechocomousse', 3, 'Chocolate Chips', 0.05::numeric, 'cups'),
        ('grahamdelechechocomousse', 4, 'Cocoa Powder', 0.02::numeric, 'cups'),
        ('grahamdelechechocomousse', 5, 'Milk', 0.03::numeric, 'cups'),
        ('grahamdelecheubehalaya', 0, 'Crushed Graham', 0.12::numeric, 'cups'),
        ('grahamdelecheubehalaya', 1, 'All-Purpose Cream (250ml)', 0.16::numeric, 'packs'),
        ('grahamdelecheubehalaya', 2, 'Condensed Milk (390g)', 0.06::numeric, 'cans'),
        ('grahamdelecheubehalaya', 3, 'Ube Halaya', 0.08::numeric, 'cups'),
        ('grahamdelecheubehalaya', 4, 'Milk', 0.03::numeric, 'cups'),
        ('realubehalaya', 0, 'Purple Yam', 1::numeric, 'cups'),
        ('realubehalaya', 1, 'Coconut Milk', 0.15::numeric, 'cups'),
        ('realubehalaya', 2, 'Condensed Milk (390g)', 0.06::numeric, 'cans'),
        ('realubehalaya', 3, 'Sugar', 0.08::numeric, 'cups'),
        ('realubehalaya', 4, 'Butter', 0.03::numeric, 'cups'),
        ('lecheflancakeube', 0, 'Egg', 6::numeric, 'pcs'),
        ('lecheflancakeube', 1, 'Condensed Milk (390g)', 0.3333::numeric, 'cans'),
        ('lecheflancakeube', 2, 'Evaporated Milk (370ml)', 0.3333::numeric, 'cans'),
        ('lecheflancakeube', 3, 'All-Purpose Cream (250ml)', 0.25::numeric, 'packs'),
        ('lecheflancakeube', 4, 'Ube Halaya', 0.5::numeric, 'cups'),
        ('lecheflancakeube', 5, 'Sugar', 2::numeric, 'tbsp'),
        ('lecheflancakeube', 6, 'Vanilla Extract', 0.125::numeric, 'tsp'),
        ('lecheflancakechoco', 0, 'Egg', 6::numeric, 'pcs'),
        ('lecheflancakechoco', 1, 'Condensed Milk (390g)', 0.3333::numeric, 'cans'),
        ('lecheflancakechoco', 2, 'Evaporated Milk (370ml)', 0.3333::numeric, 'cans'),
        ('lecheflancakechoco', 3, 'All-Purpose Cream (250ml)', 0.25::numeric, 'packs'),
        ('lecheflancakechoco', 4, 'Cocoa Powder', 0.04::numeric, 'cups'),
        ('lecheflancakechoco', 5, 'Chocolate Chips', 0.06::numeric, 'cups'),
        ('lecheflancakechoco', 6, 'Sugar', 2::numeric, 'tbsp'),
        ('lecheflancakechoco', 7, 'Vanilla Extract', 0.125::numeric, 'tsp'),
        ('grahamdeleche', 0, 'Crushed Graham', 0.15::numeric, 'cups'),
        ('grahamdeleche', 1, 'All-Purpose Cream (250ml)', 0.18::numeric, 'packs'),
        ('grahamdeleche', 2, 'Condensed Milk (390g)', 0.08::numeric, 'cans'),
        ('grahamdeleche', 3, 'Evaporated Milk (370ml)', 0.04::numeric, 'cans'),
        ('grahamdeleche', 4, 'Vanilla Extract', 0.02::numeric, 'tsp'),
        ('ubeflan', 0, 'Egg', 6::numeric, 'pcs'),
        ('ubeflan', 1, 'Condensed Milk (390g)', 0.3333::numeric, 'cans'),
        ('ubeflan', 2, 'Evaporated Milk (370ml)', 0.3333::numeric, 'cans'),
        ('ubeflan', 3, 'All-Purpose Cream (250ml)', 0.25::numeric, 'packs'),
        ('ubeflan', 4, 'Ube Halaya', 0.5::numeric, 'cups'),
        ('ubeflan', 5, 'Sugar', 2::numeric, 'tbsp'),
        ('ubeflan', 6, 'Vanilla Extract', 0.125::numeric, 'tsp'),
        ('chococaramelbars', 0, 'All-Purpose Flour', 0.15::numeric, 'cups'),
        ('chococaramelbars', 1, 'Cocoa Powder', 0.04::numeric, 'cups'),
        ('chococaramelbars', 2, 'Chocolate Chips', 0.06::numeric, 'cups'),
        ('chococaramelbars', 3, 'Condensed Milk (390g)', 0.04::numeric, 'cans'),
        ('chococaramelbars', 4, 'Butter', 0.05::numeric, 'cups'),
        ('chococaramelbars', 5, 'Sugar', 0.06::numeric, 'cups'),
        ('chococaramelbars', 6, 'Egg', 0.08::numeric, 'pcs'),
        ('chocorevelbars', 0, 'All-Purpose Flour', 0.16::numeric, 'cups'),
        ('chocorevelbars', 1, 'Cocoa Powder', 0.04::numeric, 'cups'),
        ('chocorevelbars', 2, 'Chocolate Chips', 0.06::numeric, 'cups'),
        ('chocorevelbars', 3, 'Condensed Milk (390g)', 0.03::numeric, 'cans'),
        ('chocorevelbars', 4, 'Butter', 0.05::numeric, 'cups'),
        ('chocorevelbars', 5, 'Sugar', 0.07::numeric, 'cups'),
        ('chocorevelbars', 6, 'Egg', 0.1::numeric, 'pcs'),
        ('chocorevelbars', 7, 'Vanilla Extract', 0.02::numeric, 'tsp')
    ) as item(product_key, sort_order, ingredient_name, quantity, unit)
    where item.product_key = recipe_row.product_key;
  end loop;
end
$$;

-- The earlier starter formula for Mango Graham Float omitted its fruit.
-- Add Mango only when the existing recipe is still the original five-item seed.
do $$
declare
  mango_recipe_id uuid;
begin
  select recipe.id into mango_recipe_id
  from public.product_recipes recipe
  join public.products product on product.id = recipe.product_id
  where regexp_replace(lower(coalesce(product.product_name, '')), '[^a-z0-9]+', '', 'g') = 'mangograhamfloat';

  if mango_recipe_id is not null
    and not exists (
      select 1 from public.product_recipe_items item
      where item.recipe_id = mango_recipe_id and lower(item.ingredient_name) = 'mango'
    )
    and (
      select count(*) from public.product_recipe_items item
      where item.recipe_id = mango_recipe_id
        and (
          (lower(item.ingredient_name) = 'crushed graham' and item.quantity = 0.18 and item.unit = 'cups')
          or (lower(item.ingredient_name) = 'all-purpose cream (250ml)' and item.quantity = 0.18 and item.unit = 'packs')
          or (lower(item.ingredient_name) = 'condensed milk (390g)' and item.quantity = 0.08 and item.unit = 'cans')
          or (lower(item.ingredient_name) = 'milk' and item.quantity = 0.04 and item.unit = 'cups')
          or (lower(item.ingredient_name) = 'sugar' and item.quantity = 0.01 and item.unit = 'cups')
        )
    ) = 5
    and (
      select count(*) from public.product_recipe_items item
      where item.recipe_id = mango_recipe_id
    ) = 5
  then
    insert into public.product_recipe_items (recipe_id, ingredient_name, quantity, unit, sort_order)
    values (mango_recipe_id, 'Mango', 0.5, 'pcs', 5);

    update public.product_recipes
    set is_estimate = true,
        output_label = 'pcs (small tub)'
    where id = mango_recipe_id;
  end if;
end
$$;

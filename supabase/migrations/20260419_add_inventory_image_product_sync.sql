-- Add image_url, product_id, and category columns to inventory table
-- This enables full synchronization between products and inventory

alter table public.inventory
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists image_url text,
  add column if not exists category text;

-- Backfill by matching product names (handles most cases)
update public.inventory inv
set 
  product_id = prod.id,
  image_url = prod.image_url,
  category = prod.category
from public.products prod
where lower(trim(coalesce(inv.product_name, ''))) = lower(trim(prod.product_name))
  and inv.product_id is null;

-- For remaining items, try ingredient_name as fallback
update public.inventory inv
set 
  product_id = prod.id,
  image_url = prod.image_url,
  category = prod.category
from public.products prod
where lower(trim(coalesce(inv.ingredient_name, ''))) = lower(trim(prod.product_name))
  and inv.product_id is null;

-- Create index for product_id lookups
create index if not exists inventory_product_id_idx on public.inventory (product_id);

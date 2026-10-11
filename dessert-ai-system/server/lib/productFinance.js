import { getProductDiscountConfig, validateDiscountTiers, validateProductPrice, validateProductQuantity } from '../../shared/productPricing.js';

export const validateProductPricingPayload = (body, existing = {}) => {
  const updates = {};
  try {
    if ('price' in body) updates.price = validateProductPrice(body.price, 'Selling price');
    if ('stock_quantity' in body || 'stockQuantity' in body) {
      updates.stock_quantity = validateProductQuantity(body.stock_quantity ?? body.stockQuantity);
    }
    const hasEnabled = 'discount_enabled' in body || 'discountEnabled' in body;
    const hasTiers = 'discount_tiers' in body || 'discountTiers' in body;
    if (hasEnabled || hasTiers || ('price' in body && existing.discount_enabled === true)) {
      const enabled = hasEnabled ? body.discount_enabled ?? body.discountEnabled : existing.discount_enabled ?? false;
      if (typeof enabled !== 'boolean') throw new Error('Enable Discount must be true or false.');
      const tiers = hasTiers ? body.discount_tiers ?? body.discountTiers : existing.discount_tiers ?? [];
      if (!Array.isArray(tiers)) throw new Error('Discount tiers must be a list.');
      updates.discount_enabled = enabled;
      updates.discount_tiers = enabled ? validateDiscountTiers(tiers, updates.price ?? Number(existing.price)) : [];
    }
    if ('cost_price' in body || 'costPrice' in body) {
      const costPrice = 'cost_price' in body ? body.cost_price : body.costPrice;
      updates.cost_price = costPrice === null ? null : validateProductPrice(costPrice, 'Cost price');
    }
    return updates;
  } catch (error) {
    error.status = 400;
    error.publicMessage = error.message;
    throw error;
  }
};

export const getPublicDiscountFields = (product) => {
  const { enabled, tiers } = getProductDiscountConfig(product);
  return { discountEnabled: enabled, discountTiers: tiers };
};

export const hydrateAdminProductCosts = async (supabase, products, role) => {
  if (role !== 'admin' || products.length === 0) return products;
  const { data, error } = await supabase.from('product_costs').select('product_id, cost_price').in('product_id', products.map(p => p.id));
  if (error) throw error;
  const costs = new Map((data || []).map(row => [row.product_id, Number(row.cost_price)]));
  return products.map(product => ({ ...product, costPrice: costs.get(product.id) ?? null }));
};

export const saveProductCost = async (supabase, productId, costPrice) => {
  if (costPrice === undefined) return;
  const { error } = costPrice === null
    ? await supabase.from('product_costs').delete().eq('product_id', productId)
    : await supabase.from('product_costs').upsert({ product_id: productId, cost_price: costPrice }, { onConflict: 'product_id' });
  if (error) throw error;
};

// Missing historical costs remain unknown. Do not substitute today's cost or zero.
export const estimateSaleProfit = (items, snapshots) => {
  const costs = new Map(snapshots.map(row => [row.order_item_id, Number(row.unit_cost)]));
  let grossProfit = 0;
  let uncostedQuantity = 0;
  for (const item of items) {
    const quantity = Number(item.quantity) || 0;
    if (!costs.has(item.id)) uncostedQuantity += quantity;
    else grossProfit += (Number(item.price) - costs.get(item.id)) * quantity;
  }
  return { estimatedGrossProfit: Math.round(grossProfit * 100) / 100, uncostedQuantity };
};

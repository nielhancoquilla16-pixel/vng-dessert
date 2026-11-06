import { getSupabaseAdmin } from './supabaseAdmin.js';
import { mapShopSettings } from './shopSettings.js';
import { normalizeExpiryAt } from './expiry.js';
import { DELIVERY_FEE } from './orderUtils.js';
import { getPayMongoStatusPayload } from './paymongo.js';
import { availableAiProducts } from './aiProducts.js';
import { publicAiText } from './aiSafety.js';
import { getProductPricing } from '../../shared/productPricing.js';

const productSupportFields = 'id, product_name, description, category, price, discount_enabled, discount_tiers, stock_quantity, availability, expiration_at, expiration_date';
const shopSupportFields = 'shop_name, address, phone_number, opening_time, closing_time';
const loadPublicShopSettings = async (supabase, signal) => {
  const result = await supabase.from('shop_settings').select(`${shopSupportFields}, customer_support`).eq('id', 1).maybeSingle().abortSignal(signal);
  // Keep installations without the optional support field working.
  if (['42703', 'PGRST204'].includes(result.error?.code) && /customer_support/i.test(result.error?.message || '')) {
    return supabase.from('shop_settings').select(shopSupportFields).eq('id', 1).maybeSingle().abortSignal(signal);
  }
  return result;
};

// Read only public shop and catalog facts, never private profiles, orders or recipes.
const mapPublicProduct = (row) => {
  const price = row.price == null || row.price === '' || !Number.isFinite(Number(row.price)) || Number(row.price) < 0 ? null : Number(row.price);
  return {
    id: row.id, name: publicAiText(row.product_name), description: publicAiText(row.description), category: publicAiText(row.category),
    price,
    // Unconfigured legacy flyer rows can disagree with the saved price. Do not
    // silently promise a price different from checkout, or invent a promotion.
    priceConfirmed: price != null && (row.discount_enabled != null || getProductPricing(row).regularPrice === price),
    discountEnabled: row.discount_enabled === true,
    discountTiers: row.discount_enabled === true && Array.isArray(row.discount_tiers) ? row.discount_tiers
      .filter((tier) => tier && ['number', 'string'].includes(typeof tier.price) && String(tier.price).trim() !== '').map((tier) => ({
      minQuantity: Number(tier?.minQuantity ?? tier?.min_quantity), price: Number(tier?.price),
    })).filter((tier) => Number.isSafeInteger(tier.minQuantity) && tier.minQuantity >= 2 && Number.isFinite(tier.price) && tier.price >= 0 && price != null && tier.price <= price).slice(0, 10) : [],
    stock: Math.max(0, Number(row.stock_quantity) || 0), availability: row.availability,
    expirationAt: normalizeExpiryAt({ expirationAt: row.expiration_at, expirationDate: row.expiration_date }) || (row.expiration_at ? 'invalid' : null),
    expirationDate: row.expiration_date || null,
  };
};

const loadCatalog = async (supabase, { now, productIds, lookupProductId, lookupName, signal }) => {
  const rows = [];
  const pageSize = 500;
  // Pagination avoids the old alphabetical 200-row cutoff. Eligibility is
  // filtered before pagination, and only customer product columns are selected.
  for (let page = 0; page < 20; page += 1) {
    let query = supabase.from('products').select(productSupportFields)
      .eq('availability', 'available').gt('stock_quantity', 0)
      .or(`expiration_at.is.null,expiration_at.gt.${now.toISOString()}`)
      .order('id');
    if (productIds?.length) query = query.in('id', productIds);
    const result = await query.range(page * pageSize, (page + 1) * pageSize - 1).abortSignal(signal);
    if (result.error) return { ...result, data: null };
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < pageSize) {
      let unavailable = [];
      if (lookupName || lookupProductId) {
        let lookup = supabase.from('products').select('id, product_name, availability')
          .in('availability', ['out of stock', 'expired']);
        lookup = lookupProductId ? lookup.eq('id', lookupProductId) : lookup.ilike('product_name', lookupName);
        const found = await lookup.limit(5).abortSignal(signal);
        if (!found.error) unavailable = (found.data || []).map((row) => ({ id: row.id, name: publicAiText(row.product_name), availability: 'unavailable' })).filter((row) => row.name);
      }
      return { data: rows, unavailable, complete: true };
    }
  }
  return { data: rows, unavailable: [], complete: false };
};

export const loadSupportKnowledge = async ({ getSupabase = getSupabaseAdmin, now = new Date(), includeProducts = true, includeShop = true, productIds, lookupProductId, lookupName } = {}) => {
  const payment = getPayMongoStatusPayload();
  const knowledge = {
    shop: null, products: [], unavailableProducts: [], productsLoaded: false, productsComplete: false,
    deliveryFee: DELIVERY_FEE,
    onlinePaymentConfigured: payment.configured,
    paymentMethods: payment.paymentMethodTypes,
  };
  let supabase;
  try { supabase = getSupabase(); } catch { return knowledge; }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  let settings, catalog;
  try {
    [settings, catalog] = await Promise.allSettled([
      includeShop ? loadPublicShopSettings(supabase, controller.signal) : null,
      includeProducts ? loadCatalog(supabase, { now, productIds, lookupProductId, lookupName, signal: controller.signal }) : null,
    ]);
  } finally { clearTimeout(timeout); }
  if (settings.status === 'fulfilled' && settings.value && !settings.value.error && settings.value.data) {
    const row = settings.value.data;
    const mapped = mapShopSettings(row);
    knowledge.shop = {
      shopName: publicAiText(row.shop_name),
      openingTime: mapped.openingTime,
      closingTime: mapped.closingTime,
      customerSupport: Object.fromEntries(Object.entries(mapped.customerSupport || {})
        .filter(([key, value]) => key !== 'supplier' && publicAiText(value))
        .map(([key, value]) => [key, publicAiText(value)])),
      // Missing fields must not silently turn into environment/demo defaults.
      address: publicAiText(row.address),
      phoneNumber: publicAiText(row.phone_number),
    };
  }
  const catalogResult = catalog.status === 'fulfilled' ? catalog.value : null;
  if (catalogResult && !catalogResult.error && Array.isArray(catalogResult.data)) {
    knowledge.productsLoaded = true;
    knowledge.products = availableAiProducts(catalogResult.data.map(mapPublicProduct), now);
    knowledge.unavailableProducts = catalogResult.unavailable || [];
    knowledge.productsComplete = catalogResult.complete === true;
  }
  return knowledge;
};

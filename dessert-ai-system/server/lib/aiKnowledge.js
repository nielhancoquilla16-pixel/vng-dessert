import { getSupabaseAdmin } from './supabaseAdmin.js';
import { mapShopSettings } from './shopSettings.js';
import { normalizeExpiryAt } from './expiry.js';
import { DELIVERY_FEE } from './orderUtils.js';
import { getPayMongoStatusPayload } from './paymongo.js';
import { availableAiProducts } from './aiProducts.js';
import { publicAiText } from './aiSafety.js';
import { getProductPricing } from '../../shared/productPricing.js';

const productSupportFields = 'id, product_name, description, price, discount_enabled, discount_tiers, stock_quantity, availability, expiration_at, expiration_date';
const shopSupportFields = 'shop_name, address, phone_number, opening_time, closing_time';
const loadPublicShopSettings = async (supabase) => {
  const result = await supabase.from('shop_settings').select(`${shopSupportFields}, customer_support`).eq('id', 1).maybeSingle();
  // Keep installations without the optional support field working.
  if (['42703', 'PGRST204'].includes(result.error?.code) && /customer_support/i.test(result.error?.message || '')) {
    return supabase.from('shop_settings').select(shopSupportFields).eq('id', 1).maybeSingle();
  }
  return result;
};

// Read only public shop and catalog facts, never private profiles, orders or recipes.
export const loadSupportKnowledge = async ({ getSupabase = getSupabaseAdmin, now = new Date() } = {}) => {
  const payment = getPayMongoStatusPayload();
  const knowledge = {
    shop: null, products: [], productsLoaded: false,
    deliveryFee: DELIVERY_FEE,
    onlinePaymentConfigured: payment.configured,
    paymentMethods: payment.paymentMethodTypes,
  };
  let supabase;
  try { supabase = getSupabase(); } catch { return knowledge; }
  const [settings, catalog] = await Promise.allSettled([
    loadPublicShopSettings(supabase),
    supabase.from('products')
      .select(productSupportFields)
      .eq('availability', 'available').order('product_name').limit(200),
  ]);
  if (settings.status === 'fulfilled' && !settings.value.error && settings.value.data) {
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
    knowledge.products = availableAiProducts(catalogResult.data.map((row) => ({
      id: row.id,
      name: publicAiText(row.product_name),
      description: publicAiText(row.description),
      price: row.price == null || row.price === '' || !Number.isFinite(Number(row.price)) ? null : getProductPricing(row).regularPrice,
      stock: Math.max(0, Number(row.stock_quantity) || 0),
      availability: row.availability,
      expirationAt: normalizeExpiryAt({ expirationAt: row.expiration_at, expirationDate: row.expiration_date }),
    })), now);
  }
  return knowledge;
};

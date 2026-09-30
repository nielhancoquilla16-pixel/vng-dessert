import { getSupabaseAdmin } from './supabaseAdmin.js';
import { mapShopSettings } from './shopSettings.js';
import { normalizeExpiryAt } from './expiry.js';
import { DELIVERY_FEE } from './orderUtils.js';
import { getPayMongoStatusPayload } from './paymongo.js';

const productSupportFields = 'id, product_name, description, price, stock_quantity, availability, expiration_at, expiration_date';

// Read only public shop and catalog facts, never private profiles, orders or recipes.
export const loadSupportKnowledge = async ({ getSupabase = getSupabaseAdmin } = {}) => {
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
    supabase.from('shop_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('products')
      .select(productSupportFields)
      .neq('availability', 'hidden').order('product_name').limit(200),
  ]);
  if (settings.status === 'fulfilled' && !settings.value.error && settings.value.data) {
    const row = settings.value.data;
    knowledge.shop = {
      ...mapShopSettings(row),
      // Missing fields must not silently turn into environment/demo defaults.
      address: typeof row.address === 'string' ? row.address.trim() : '',
      phoneNumber: typeof row.phone_number === 'string' ? row.phone_number.trim() : '',
    };
  }
  const catalogResult = catalog.status === 'fulfilled' ? catalog.value : null;
  if (catalogResult && !catalogResult.error && Array.isArray(catalogResult.data)) {
    knowledge.productsLoaded = true;
    knowledge.products = catalogResult.data.filter((row) => row.availability !== 'hidden').map((row) => ({
      id: row.id,
      name: String(row.product_name || '').trim(),
      description: String(row.description || '').trim(),
      price: row.price == null || row.price === '' || !Number.isFinite(Number(row.price)) ? null : Number(row.price),
      stock: Math.max(0, Number(row.stock_quantity) || 0),
      availability: row.availability,
      expirationAt: normalizeExpiryAt({ expirationAt: row.expiration_at, expirationDate: row.expiration_date }),
    })).filter((product) => product.name);
  }
  return knowledge;
};

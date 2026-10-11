// Real order and payment handlers; no real orders, payments or database writes.
import test, { mock, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from '../../dessert-ai-system/node_modules/express/index.js';
import * as realSupabase from '../../dessert-ai-system/server/lib/supabaseAdmin.js';
import * as realPayMongo from '../../dessert-ai-system/server/lib/paymongo.js';
import * as realShopSettings from '../../dessert-ai-system/server/lib/shopSettings.js';
import { createPurchaseFixture } from '../shop-hours/purchase-fixture.mjs';

const { rows, database } = createPurchaseFixture();
rows.payment_checkouts = [];
const client = { ...database, from: table => {
  const query = database.from(table);
  query.ilike = (column, pattern) => {
    const prefix = pattern.replace(/%$/, '').toLowerCase();
    query.filters.push(row => String(row[column] || '').toLowerCase().startsWith(prefix));
    return query;
  };
  return query;
} };
let checkoutRequest;
mock.module('../../dessert-ai-system/server/lib/supabaseAdmin.js', {
  namedExports: { ...realSupabase, getSupabaseAdmin: () => client, hasSupabaseAdminConfig: () => true },
});
mock.module('../../dessert-ai-system/server/lib/shopSettings.js', {
  namedExports: { ...realShopSettings, assertShopOpen: async () => ({ isOpen: true }) },
});
mock.module('../../dessert-ai-system/server/lib/paymongo.js', { namedExports: {
  ...realPayMongo, isPayMongoConfigured: () => true,
  createPayMongoCheckoutSession: async request => {
    checkoutRequest = request;
    return { id: 'isolated-checkout', attributes: { checkout_url: 'https://example.test/checkout' } };
  },
} });
const [{ default: orders }, { default: payments }] = await Promise.all([
  import('../../dessert-ai-system/server/routes/orders.js'), import('../../dessert-ai-system/server/routes/payments.js'),
]);
const app = express();
app.use(express.json());
app.use('/api/orders', orders);
app.use('/api/payments', payments);
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
let server;
let origin;
before(async () => {
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => {
  rows.products[0] = { ...rows.products[0], product_name: 'Lecheflan', price: 90, stock_quantity: 200, availability: 'available' };
  delete rows.products[0].discount_enabled;
  delete rows.products[0].discount_tiers;
  rows.orders.length = 0; rows.order_items.length = 0; rows.payment_checkouts.length = 0;
  checkoutRequest = null;
});
const post = async (endpoint, body, role = 'admin') => {
  const response = await fetch(origin + endpoint, { method: 'POST', headers: {
    'Content-Type': 'application/json', Authorization: `Bearer test-${role}`,
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
for (const [quantity, price, enabled] of [[4, 140, true], [5, 125, true], [10, 115, true], [10, 140, false]]) {
  test(`saved tiers apply to POS and payment checkout: ${quantity} packs, discount ${enabled}`, async () => {
    Object.assign(rows.products[0], { price: 140, discount_enabled: enabled,
      discount_tiers: [{ minQuantity: 5, price: 125 }, { minQuantity: 10, price: 115 }] });
    const order = await post('/api/orders', { items: [{ product_id: 'available', quantity, price: 1 }],
      delivery_method: 'pickup', payment_method: 'cash', cash_received: 2000, order_status: 'preparing' });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    assert.equal(order.body.lineItems[0].price, price);
    assert.equal(rows.order_items[0].price, price);
    const checkout = await post('/api/payments/checkout-sessions', {
      lineItems: [{ productId: 'available', quantity, price: 1 }], deliveryMethod: 'pickup', phoneNumber: '09123456789',
    }, 'customer');
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
    assert.equal(checkoutRequest.lineItems[0].amount, price);
    assert.equal(rows.payment_checkouts[0].amount, price * quantity);
  });
}


const confirmedProducts = [
  ['Lecheflan', 90, 77, 90], ['Moist Crinkles Trio big 4pcs', 75, 63, 75],
  ['Moist Crinkles Choco big 6pcs', 85, 65, 80], ['Mango Graham Tiramusu (500ml Tub)', 145, 130, 130],
  ['PREMIUM CRINKLE BITES red velvet (450g)', 120, 105, 120], ['PREMIUM Brownles overload', 110, 98, 110],
  ['Leche Flan Cake (Ube 450g)', 100, 95, 100],
];
for (const [name, regular, wholesale, legacyPrice] of confirmedProducts) {
for (const quantity of [1, 4, 5, 6]) {
  const price = quantity < 5 ? regular : wholesale;
  const total = price * quantity;
  test(`POS ${name}: ${quantity} packs use ${price} each and persist subtotal ${total}`, async () => {
    rows.products[0].product_name = name;
    rows.products[0].price = legacyPrice;
    const result = await post('/api/orders', { items: [{ product_id: 'available', quantity, price: 1 }],
      delivery_method: 'pickup', payment_method: 'cash', cash_received: 1000, order_status: 'preparing' });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(rows.orders[0].total_price, total);
    assert.equal(rows.order_items[0].price, price);
    assert.equal(result.body.totalAmount, total);
    assert.equal(result.body.changeAmount, 1000 - total);
    assert.equal(result.body.lineItems[0].lineTotal, total);
  });
  test(`online ${name}: ${quantity} packs charge ${price} each and save ${total}`, async () => {
    rows.products[0].product_name = name;
    rows.products[0].price = legacyPrice;
    const result = await post('/api/payments/checkout-sessions', {
      lineItems: [{ productId: 'available', quantity, price: 1 }], deliveryMethod: 'pickup', phoneNumber: '09123456789',
    }, 'customer');
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(checkoutRequest.lineItems[0].amount, price);
    assert.equal(checkoutRequest.lineItems[0].quantity, quantity);
    assert.equal(rows.payment_checkouts[0].amount, total);
    assert.equal(rows.payment_checkouts[0].line_items[0].price, price);
  });
}
}

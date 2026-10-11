// node --experimental-test-module-mocks --test tests/payments/checkout-status.test.mjs
import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from '../../dessert-ai-system/node_modules/express/index.js';
import * as realSupabase from '../../dessert-ai-system/server/lib/supabaseAdmin.js';
import * as realPayMongo from '../../dessert-ai-system/server/lib/paymongo.js';
import { createPurchaseFixture } from '../shop-hours/purchase-fixture.mjs';

const paymentTime = '2026-10-06T06:10:33.000Z';
const reference = 'PM-TEST-CHECKOUT';
const { database, rows } = createPurchaseFixture();
rows.payment_checkouts = [];
let providerSession;
let checkoutWrites;
let exceptions;
const client = {
  ...database,
  from(table) {
    const query = database.from(table);
    query.ilike = (column, pattern) => {
      const prefix = pattern.replace(/%$/, '').toLowerCase();
      query.filters.push(row => String(row[column] || '').toLowerCase().startsWith(prefix));
      return query;
    };
    const update = query.update.bind(query);
    query.update = (patch) => {
      if (table === 'payment_checkouts') {
        checkoutWrites.push(structuredClone(patch));
        // Model the real PostgreSQL timestamp boundary that rejected the
        // provider's raw Unix seconds in the reported production request.
        if (patch.paid_at != null && (typeof patch.paid_at !== 'string'
          || !/^\d{4}-\d{2}-\d{2}T/.test(patch.paid_at)
          || !Number.isFinite(Date.parse(patch.paid_at)))) {
          throw Object.assign(new Error('date/time field value out of range'), { code: '22008' });
        }
      }
      return update(patch);
    };
    return query;
  },
};
mock.module('../../dessert-ai-system/server/lib/supabaseAdmin.js', {
  namedExports: { ...realSupabase, getSupabaseAdmin: () => client },
});
mock.module('../../dessert-ai-system/server/lib/paymongo.js', {
  namedExports: {
    ...realPayMongo,
    isPayMongoConfigured: () => true,
    retrievePayMongoCheckoutSession: async () => structuredClone(providerSession),
  },
});
const { default: paymentsRouter } = await import('../../dessert-ai-system/server/routes/payments.js');
const app = express();
app.use(express.json({ verify: (req, res, buffer) => { req.rawBody = buffer.toString('utf8'); } }));
app.use('/api/payments', paymentsRouter);
app.use((error, req, res, next) => {
  exceptions.push(error);
  res.status(error.status || 500).json({ error: 'Payment status request failed.' });
});
let server;
let origin;
before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
  Object.assign(rows.products[0], { product_name: 'Fresh Leche Flan', price: 100.5, stock_quantity: 8 });
  checkoutWrites = [];
  exceptions = [];
  rows.payment_checkouts = [{
    id: 'checkout-1', user_id: 'test-customer', provider: 'paymongo', reference_number: reference,
    checkout_session_id: 'cs_test_fixture', checkout_url: 'https://checkout.paymongo.com/test-fixture',
    status: 'created', order_id: 'order-1', paid_at: null, amount: 100.5, payment_method: 'online',
    delivery_method: 'pickup', line_items: [{ product_id: 'available', quantity: 1, price: 100.5 }],
  }];
  rows.orders = [{
    id: 'order-1', user_id: 'test-customer', order_code: 'VNG-TEST', customer_name: 'Test Customer',
    payment_method: 'online', delivery_method: 'pickup', order_status: 'pending', total_price: 100.5,
    notifications: [], status_timestamps: { pending: '2026-10-06T06:09:00.000Z' },
  }];
  rows.order_items = [{ id: 'item-1', order_id: 'order-1', product_id: 'available', quantity: 1, price: 100.5 }];
  providerSession = {
    id: 'cs_test_fixture', attributes: {
      status: 'active', reference_number: reference,
      payment_intent: { id: 'pi_test_fixture', attributes: { status: 'succeeded' } },
      payments: [{ id: 'pay_test_fixture', attributes: { status: 'paid', paid_at: 1791267033, created_at: 1791266973 } }],
    },
  };
});
const loadCheckout = async (token = 'test-customer') => {
  const response = await fetch(`${origin}/api/payments/checkouts/${reference}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.json() };
};

test('legacy paid checkout keeps its charged prices when current wholesale pricing differs', async () => {
  rows.products[0].product_name = 'Lecheflan';
  rows.products[0].price = 90;
  rows.payment_checkouts[0].order_id = null;
  rows.payment_checkouts[0].amount = 450;
  rows.payment_checkouts[0].line_items = [{ product_id: 'available', quantity: 5, price: 90 }];
  rows.orders.length = 0;
  rows.order_items.length = 0;
  const result = await loadCheckout();
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'fulfilled');
  assert.equal(result.body.order.totalAmount, 450);
  assert.equal(result.body.order.lineItems[0].price, 90);
  assert.equal(result.body.order.lineItems[0].lineTotal, 450);
  assert.equal(rows.order_items[0].price, 90);
  assert.equal(exceptions.length, 0);
});

for (const [label, timestamp] of [['Unix seconds', 1791267033], ['numeric strings', '1791267033'], ['ISO timestamps', paymentTime]]) {
  test(`paid checkout status accepts ${label} and confirms the existing order`, async () => {
    providerSession.attributes.payments[0].attributes.paid_at = timestamp;
    const result = await loadCheckout();
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'fulfilled');
    assert.equal(result.body.paidAt, paymentTime);
    assert.equal(result.body.orderId, 'order-1');
    assert.equal(result.body.order.status, 'confirmed');
    assert.equal(rows.orders.length, 1);
    assert.equal(rows.payment_checkouts[0].payment_id, 'pay_test_fixture');
    assert.equal(rows.orders[0].status_timestamps.confirmed, paymentTime);
    assert.equal(rows.orders[0].notifications.find((item) => item.type === 'payment_confirmed').createdAt, paymentTime);
    assert.equal(exceptions.length, 0);
    assert.ok(checkoutWrites.filter((patch) => patch.paid_at).every((patch) => patch.paid_at === paymentTime));
    const notificationCount = rows.orders[0].notifications.length;
    const repeated = await loadCheckout();
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.paidAt, paymentTime);
    assert.equal(rows.orders.length, 1);
    assert.equal(rows.orders[0].notifications.length, notificationCount);
  });
}

test('a payment without paid_at uses the normalized provider creation timestamp', async () => {
  delete providerSession.attributes.payments[0].attributes.paid_at;
  providerSession.attributes.payments[0].attributes.created_at = 1791267033;
  const result = await loadCheckout();
  assert.equal(result.status, 200);
  assert.equal(result.body.paidAt, paymentTime);
  assert.equal(result.body.status, 'fulfilled');
});

test('failed payment status also normalizes provider timestamps without confirming the order', async () => {
  providerSession.attributes.payments[0].attributes.status = 'failed';
  const result = await loadCheckout();
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'failed');
  assert.equal(result.body.order.status, 'cancelled');
  assert.equal(rows.orders[0].notifications.some((item) => item.type === 'payment_confirmed'), false);
  assert.equal(exceptions.length, 0);
});

test('signed paid webhook reconciles numeric provider dates and duplicate delivery remains safe', async (t) => {
  const previous = process.env.PAYMONGO_WEBHOOK_SECRET;
  const secret = 'fixture-webhook-signing-secret';
  process.env.PAYMONGO_WEBHOOK_SECRET = secret;
  t.after(() => { if (previous === undefined) delete process.env.PAYMONGO_WEBHOOK_SECRET; else process.env.PAYMONGO_WEBHOOK_SECRET = previous; });
  const body = JSON.stringify({ data: { attributes: {
    type: 'checkout_session.payment.paid', data: { id: providerSession.id, attributes: { reference_number: reference } },
  } } });
  const timestamp = '1791267033';
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${origin}/api/payments/webhooks/paymongo`, {
      method: 'POST', body,
      headers: { 'Content-Type': 'application/json', 'Paymongo-Signature': `t=${timestamp},te=${signature},li=` },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).received, true);
  }
  assert.equal(rows.payment_checkouts[0].status, 'fulfilled');
  assert.equal(rows.payment_checkouts[0].paid_at, paymentTime);
  assert.equal(rows.orders.length, 1);
  assert.equal(rows.orders[0].notifications.filter((item) => item.type === 'payment_confirmed').length, 1);
  assert.equal(exceptions.length, 0);
});

test('an unpaid session still remains pending with no fabricated payment timestamp', async () => {
  providerSession.attributes.payments = [];
  providerSession.attributes.payment_intent.attributes.status = 'awaiting_payment_method';
  const result = await loadCheckout();
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'created');
  assert.equal(result.body.paidAt, null);
  assert.equal(result.body.order.status, 'pending');
  assert.ok(checkoutWrites.every((patch) => !patch.paid_at && !patch.status));
});

test('checkout ownership remains enforced during payment-status polling', async () => {
  rows.profiles.push({ ...rows.profiles[1], id: 'test-other-customer', username: 'other-customer' });
  const result = await loadCheckout('test-other-customer');
  assert.equal(result.status, 404);
  assert.equal(rows.payment_checkouts[0].status, 'created');
  assert.equal(rows.orders[0].order_status, 'pending');
  assert.equal(checkoutWrites.length, 0);
});

test('timestamp conversion rejects absent and invalid values and preserves time zones', () => {
  for (const value of [undefined, null, '', '   ', 0, -1, '-1', false, {}, NaN, Infinity, 1e30, 'not-a-date', '1791267033junk']) {
    assert.equal(realPayMongo.normalizePayMongoTimestamp(value), null, String(value));
  }
  assert.equal(realPayMongo.normalizePayMongoTimestamp('2026-10-06T14:10:33+08:00'), paymentTime);
  assert.equal(realPayMongo.normalizePayMongoTimestamp(1791267033.125), '2026-10-06T06:10:33.125Z');
});

test('an invalid paid_at falls back to a valid provider creation timestamp', async () => {
  providerSession.attributes.payments[0].attributes.paid_at = 'invalid-date';
  providerSession.attributes.payments[0].attributes.created_at = 1791267033;
  const result = await loadCheckout();
  assert.equal(result.status, 200);
  assert.equal(result.body.paidAt, paymentTime);
  assert.equal(result.body.status, 'fulfilled');
});

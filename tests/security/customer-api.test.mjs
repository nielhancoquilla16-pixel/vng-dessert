// node --experimental-test-module-mocks --test tests/security/customer-api.test.mjs
import test, { mock, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from '../../dessert-ai-system/node_modules/express/index.js';
import * as realSupabase from '../../dessert-ai-system/server/lib/supabaseAdmin.js';
import * as realPayMongo from '../../dessert-ai-system/server/lib/paymongo.js';
import { createPurchaseFixture } from '../shop-hours/purchase-fixture.mjs';
import { publicErrorResponses } from '../../dessert-ai-system/server/middleware/publicErrorResponses.js';
import { requestErrorHandler } from '../../dessert-ai-system/server/middleware/requestErrorHandler.js';
import { aiRequestLimiter } from '../../dessert-ai-system/server/middleware/rateLimit.js';
import { getShortagesForItems, normalizeRequestedItems } from '../../dessert-ai-system/server/lib/orderUtils.js';

const { rows, database } = createPurchaseFixture();
let authUser;
let reads;
const client = {
  ...database,
  from: (table) => { reads.push(table); return database.from(table); },
  auth: { getUser: async (token) => ({ data: { user: token === 'valid-session' ? authUser : null }, error: null }) },
};
mock.module('../../dessert-ai-system/server/lib/supabaseAdmin.js', {
  namedExports: { ...realSupabase, getSupabaseAdmin: () => client, hasSupabaseAdminConfig: () => true },
});
mock.module('../../dessert-ai-system/server/lib/paymongo.js', { namedExports: { ...realPayMongo, isPayMongoConfigured: () => true } });
const { createAiRouter } = await import('../../dessert-ai-system/server/routes/ai.js');
const { createChatMessagesRouter } = await import('../../dessert-ai-system/server/routes/chatMessages.js');
const { createShopSettingsRouter } = await import('../../dessert-ai-system/server/routes/shopSettings.js');
const [{ default: products }, { default: inventory }, { default: orders }, { default: payments }, { default: profiles }, { default: carts }, { default: preorders }] = await Promise.all([
  import('../../dessert-ai-system/server/routes/products.js'), import('../../dessert-ai-system/server/routes/inventory.js'),
  import('../../dessert-ai-system/server/routes/orders.js'), import('../../dessert-ai-system/server/routes/payments.js'),
  import('../../dessert-ai-system/server/routes/profiles.js'), import('../../dessert-ai-system/server/routes/carts.js'),
  import('../../dessert-ai-system/server/routes/preOrders.js'),
]);
const app = express();
app.use(publicErrorResponses);
app.use(express.json());
app.use('/api/products', products);
app.use('/api/inventory', inventory);
app.use('/api/orders', orders);
app.use('/api/payments', payments);
app.use('/api/profiles', profiles);
app.use('/api/carts', carts);
app.use('/api/pre-orders', preorders);
app.use('/api/shop-settings', createShopSettingsRouter({ getSupabase: () => client }));
const reply = async () => ({ ok: true, reply: 'Public answer', mode: 'groq', source: 'groq', groqConfigured: true, intents: [] });
app.use('/api/ai', createAiRouter({ reply }));
app.use('/api/chat-messages', createChatMessagesRouter({ reply }));
app.use(requestErrorHandler);
let server;
let origin;
before(async () => {
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach((t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  reads = [];
  aiRequestLimiter.clear();
  authUser = { id: 'test-customer', email: 'customer@gmail.com', email_confirmed_at: '2026-09-01T00:00:00Z', user_metadata: {} };
  rows.shop_settings[0].customer_support = { owner: 'Public Owner', supplier: 'PRIVATE_SUPPLIER', email: 'shop@gmail.com' };
  rows.profiles.find((row) => row.id === 'test-customer').email_verified = true;
});
const request = async (path, { method = 'GET', body, authenticated = true } = {}) => {
  const response = await fetch(origin + path, {
    method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer valid-session' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
};

test('unverified provider email is blocked even if the profile or user metadata claims verification', async () => {
  authUser.email_confirmed_at = null;
  authUser.user_metadata = { email_verified: true, role: 'admin' };
  const result = await request('/api/carts/mine');
  assert.equal(result.status, 403);
  assert.match(result.body.error, /verification/);
  assert.ok(!reads.includes('carts'));
});

test('direct auth signup without a server-created application profile cannot access protected data', async () => {
  authUser.id = 'direct-provider-account';
  authUser.user_metadata = { role: 'admin', email_verified: true };
  assert.equal((await request('/api/profiles/me')).status, 403);
  assert.equal(rows.profiles.some((row) => row.id === authUser.id), false);
});

test('a confirmed public Gmail inbox cannot use existing tokens to access customer APIs', async () => {
  for (const email of ['s.l.o.t.h.f.u.l.n.m.w+another@gmail.com', 'ma.ss.i.v.e.cvn@gmail.com', 'kajaahahaggjahagafa+kemp@gmail.com']) {
    authUser.email = email;
    const result = await request('/api/carts/mine');
    assert.equal(result.status, 403);
    assert.ok(!reads.includes('carts'));
    assert.doesNotMatch(JSON.stringify(result.body), /gmail.com|disposable_mailbox|MailTicking/);
  }
});

test('customer profile cannot hide a blocked mailbox behind a different provider email', async (t) => {
  const profile = rows.profiles.find((row) => row.id === authUser.id);
  const previous = profile.email;
  t.after(() => { profile.email = previous; });
  profile.email = 'slothfulnmw@gmail.com';
  assert.equal((await request('/api/profiles/me')).status, 403);
});

test('mailbox registration blocks do not change staff permissions', async () => {
  authUser.id = 'test-admin';
  authUser.email = 'slothfulnmw@gmail.com';
  assert.equal((await request('/api/shop-settings/internal')).status, 200);
});

test('customer role cannot be upgraded using client metadata or a claimed admin header', async () => {
  authUser.user_metadata = { role: 'admin' };
  for (const [path, method, body] of [
    ['/api/inventory', 'GET'], ['/api/inventory/report', 'POST', { products: [] }],
    ['/api/inventory/health', 'GET'], ['/api/products/recipes', 'GET'],
    ['/api/products', 'POST', { product_name: 'unauthorized' }], ['/api/profiles/staff', 'GET'],
    ['/api/orders', 'GET'], ['/api/orders/analyze', 'POST', { orders: [] }],
    ['/api/shop-settings/internal', 'GET'],
  ]) {
    const result = await request(path, { method, body });
    assert.equal(result.status, 403, path);
    assert.doesNotMatch(JSON.stringify(result.body), /supplier|profit|cost|inventory|bearer|stack/i);
  }
  assert.ok(reads.every((table) => table === 'profiles'));
});

test('admin retains access to inventory analysis and supplier settings', async () => {
  authUser.id = 'test-admin';
  const inventory = await request('/api/inventory/report', { method: 'POST', body: { products: [{ name: 'Flan', stock: 3 }] } });
  assert.equal(inventory.status, 200);
  const settings = await request('/api/shop-settings/internal');
  assert.equal(settings.status, 200);
  assert.equal(settings.body.customerSupport.supplier, 'PRIVATE_SUPPLIER');
});

test('public catalog uses a field projection that excludes private product business data', async () => {
  Object.assign(rows.products[0], { cost: 32, profit: 68, profit_margin: 0.68, supplier: 'PRIVATE_SUPPLIER', api_key: 'PRIVATE_API_KEY' });
  const result = await request('/api/products', { authenticated: false });
  assert.equal(result.status, 200);
  assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE|supplier|profit|cost|api_key/);
  assert.ok(!result.body.some((row) => row.availability === 'hidden'));
  assert.equal(result.body[0].price, 100.5);
});

test('public shop settings and event stream do not expose suppliers', async () => {
  const result = await request('/api/shop-settings', { authenticated: false });
  assert.equal(result.status, 200);
  assert.equal(result.body.customerSupport.owner, 'Public Owner');
  assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_SUPPLIER|supplier/);
  const controller = new AbortController();
  const response = await fetch(origin + '/api/shop-settings/events', { signal: controller.signal });
  const chunk = await response.body.getReader().read();
  controller.abort();
  const stream = new TextDecoder().decode(chunk.value);
  assert.match(stream, /shop-settings/);
  assert.doesNotMatch(stream, /PRIVATE_SUPPLIER|supplier/);
});

test('customers cannot view or cancel another account payment checkout', async () => {
  rows.payment_checkouts = [{ id: 'private-checkout', user_id: 'other-customer', reference_number: 'PRIVATE-REF', status: 'created' }];
  for (const [path, method] of [['/api/payments/checkouts/PRIVATE-REF', 'GET'], ['/api/payments/checkouts/PRIVATE-REF/cancel', 'POST']]) {
    const result = await request(path, { method });
    assert.equal(result.status, 404);
    assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE-REF|other-customer|payment checkout not found/i);
    assert.doesNotMatch(result.body.message, /404|HTTP|status code/i);
  }
});

test('direct checkout, preorder, saved-address and order requests reject malformed contacts on the server', async () => {
  for (const contact of ['123456', '09123', '0917123', '09001234567', '0917abc4567', '+639171234567']) {
    for (const [path, body] of [
      ['/api/orders', { items: [{ product_id: 'available', quantity: 1 }], phone_number: contact }],
      ['/api/payments/checkout-sessions', { lineItems: [{ productId: 'available', quantity: 1 }], phoneNumber: contact }],
      ['/api/profiles/me', { phone_number: contact }],
      ['/api/profiles/me/addresses', { recipientName: 'Customer', phoneNumber: contact, streetAddress: 'Street', city: 'City', province: 'Province' }],
      ['/api/pre-orders', { product_id: 'available', customer_name: 'Customer', phone_number: contact, address: 'Street', quantity: 1 }],
    ]) {
      const result = await request(path, { method: path === '/api/profiles/me' ? 'PUT' : 'POST', body });
      assert.equal(result.status, 400, path + ' ' + contact);
      assert.match(result.body.error, /(?:contact|mobile|phone)/i);
    }
  }
});

test('direct cart requests cannot order hidden, expired, sold-out or disabled products', async () => {
  rows.products.push({ id: 'disabled', product_name: 'Disabled', stock_quantity: 10, availability: 'unavailable' });
  for (const id of ['hidden', 'expired', 'sold-out', 'disabled']) {
    const result = await request('/api/carts/mine/items', { method: 'POST', body: { product_id: id, quantity: 1 } });
    assert.equal(result.status, 409, id);
  }
  for (const quantity of [-1, 1.5, 'nan', true]) {
    assert.equal((await request('/api/carts/mine/items', { method: 'POST', body: { product_id: 'available', quantity } })).status, 400);
  }
});

test('duplicate product lines cannot bypass stock checks and request prices do not set availability', () => {
  const items = normalizeRequestedItems([{ product_id: 'available', quantity: 5, price: 0 }, { product_id: 'available', quantity: 5, price: 0 }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 10);
  assert.equal(getShortagesForItems(items, new Map(rows.products.map((row) => [row.id, row]))).length, 1);
  for (const quantity of [0, -1, 1.5, 'nan', Infinity, true]) assert.throws(() => normalizeRequestedItems([{ product_id: 'available', quantity }]), { status: 400 });
});

test('AI endpoint aliases share rate limits and hide provider configuration', async () => {
  for (let index = 0; index < 20; index++) {
    const result = await request(index % 2 ? '/api/ai' : '/api/chat-messages', { method: 'POST', body: { message: 'Public question' }, authenticated: false });
    assert.ok([200, 201].includes(result.status));
    assert.doesNotMatch(JSON.stringify(result.body), /groq|model|Configured/i);
  }
  const result = await request('/api/chat-messages', { method: 'POST', body: { message: 'Public question' }, authenticated: false });
  assert.equal(result.status, 429);
  assert.ok(Number(result.headers.get('Retry-After')) > 0);
});

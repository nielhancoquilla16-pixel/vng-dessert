// Real product and report handlers with isolated storage. No live writes.
import test, { mock, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from '../../dessert-ai-system/node_modules/express/index.js';
import * as realSupabase from '../../dessert-ai-system/server/lib/supabaseAdmin.js';
import { createPurchaseFixture } from '../shop-hours/purchase-fixture.mjs';

const { rows, database } = createPurchaseFixture();
const productId = '20000000-0000-4000-8000-000000000001';
let reads = [];
const client = { ...database, from: table => {
  reads.push(table);
  const query = database.from(table);
  query.ilike = (field, value) => { query.filters.push(row => String(row[field] || '').toLowerCase() === value.toLowerCase()); return query; };
  if (table === 'product_costs') {
    const upsert = query.upsert.bind(query);
    query.upsert = value => upsert({ ...value, id: value.product_id });
  }
  return query;
} };
mock.module('../../dessert-ai-system/server/lib/supabaseAdmin.js', {
  namedExports: { ...realSupabase, getSupabaseAdmin: () => client, hasSupabaseAdminConfig: () => true },
});
const [{ default: products }, { default: reports }] = await Promise.all([
  import('../../dessert-ai-system/server/routes/products.js'), import('../../dessert-ai-system/server/routes/salesReports.js'),
]);
const app = express();
app.use(express.json());
app.use('/api/products', products);
app.use('/api/sales-reports', reports);
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
let server;
let origin;
before(async () => {
  rows.profiles.push({ id: 'test-staff', role: 'staff', email: 'staff@example.test' });
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  origin = 'http://127.0.0.1:' + server.address().port;
});
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => {
  reads = [];
  rows.products = [{ id: productId, product_name: 'Lecheflan', price: 140, category: 'Puddings', stock_quantity: 50,
    discount_enabled: true, discount_tiers: [{ minQuantity: 5, price: 125 }], image_url: 'https://images.example.test/flan.jpg' }];
  rows.product_costs = [{ id: productId, product_id: productId, cost_price: 80 }];
  rows.inventory = [];
  rows.orders = [];
  rows.order_items = [];
  rows.order_item_costs = [];
});
const request = async (path, role = 'admin', method = 'GET', body) => {
  const response = await fetch(origin + path, { method, headers: {
    'Content-Type': 'application/json', ...(role ? { Authorization: 'Bearer test-' + role } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
};

test('admin product list/detail include costs; public, customer and staff responses never read or return costs', async () => {
  for (const path of ['/api/products', '/api/products/' + productId]) {
    const admin = await request(path);
    assert.equal(admin.status, 200);
    assert.equal((Array.isArray(admin.body) ? admin.body[0] : admin.body).costPrice, 80);
    for (const role of [null, 'customer', 'staff']) {
      reads = [];
      const result = await request(path, role);
      assert.equal(result.status, 200);
      assert.doesNotMatch(JSON.stringify(result.body), /cost|profit|margin/i);
      assert.equal(reads.includes('product_costs'), false);
      assert.equal((Array.isArray(result.body) ? result.body[0] : result.body).discountTiers[0].price, 125);
    }
  }
});

test('admin create persists cost and all tiers while keeping product inventory synchronized', async () => {
  const result = await request('/api/products', 'admin', 'POST', {
    product_name: 'New cake', category: 'Cakes', price: 140, cost_price: 80, stock_quantity: 25,
    discount_enabled: true, discount_tiers: [{ minQuantity: 5, price: 125 }, { minQuantity: 10, price: 115 }],
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.price, 140);
  assert.equal(result.body.costPrice, 80);
  assert.equal(result.body.discountTiers.length, 2);
  assert.equal(rows.product_costs.find(row => row.product_id === result.body.id).cost_price, 80);
  assert.equal(rows.inventory[0].stock_quantity, 25);
});

test('editing updates cost, tiers and stock without losing the existing product image', async () => {
  const result = await request('/api/products/' + productId, 'admin', 'PATCH', {
    cost_price: 82, stock_quantity: 30, discount_enabled: true,
    discount_tiers: [{ minQuantity: 6, price: 120 }, { minQuantity: 12, price: 110 }],
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.costPrice, 82);
  assert.equal(result.body.imageUrl, 'https://images.example.test/flan.jpg');
  assert.equal(result.body.discountTiers[0].minQuantity, 6);
  assert.equal(rows.inventory[0].stock_quantity, 30);
  assert.equal((await request('/api/products/' + productId)).body.costPrice, 82);
});

test('stock-only inventory updates preserve cost and configured tiers', async () => {
  const result = await request('/api/products/' + productId, 'staff', 'PATCH', { stock_quantity: 8 });
  assert.equal(result.status, 200);
  assert.equal(rows.product_costs[0].cost_price, 80);
  assert.equal(result.body.discountTiers[0].price, 125);
});

test('staff cannot write cost even by alias; admin can explicitly clear an unrecorded cost', async () => {
  for (const body of [{ cost_price: 1 }, { costPrice: 1 }, { cost_price: null }]) {
    const result = await request('/api/products/' + productId, 'staff', 'PATCH', body);
    assert.equal(result.status, 403);
  }
  const result = await request('/api/products/' + productId, 'admin', 'PATCH', { cost_price: null });
  assert.equal(result.status, 200);
  assert.equal(result.body.costPrice, null);
  assert.equal(rows.product_costs.length, 0);
});

test('server rejects malformed stock, money and tier changes without updating products', async () => {
  for (const body of [
    { stock_quantity: -1 }, { stock_quantity: 1.5 }, { price: -1 }, { cost_price: '1.234' },
    { price: 129.99 }, { cost_price: 90.05 }, { price: '140.00' }, { cost_price: '80.0' },
    { discount_tiers: [{ minQuantity: 5, price: 125.5 }] },
    { price: 100 }, { discount_enabled: true, discount_tiers: [] },
    { discount_tiers: [{ minQuantity: 5, price: 150 }] }, { category: '  ' },
  ]) {
    const original = structuredClone(rows.products);
    const result = await request('/api/products/' + productId, 'admin', 'PATCH', body);
    assert.equal(result.status, 400, JSON.stringify(result.body));
    assert.deepEqual(rows.products, original);
  }
});

test('completed reports include only admin profit from snapshots and exclude cancelled/refunded sales', async () => {
  for (const [index, status] of ['completed', 'cancelled', 'refunded'].entries()) {
    rows.orders.push({ id: 'order-' + index, user_id: 'test-admin', total_price: 625, order_status: status,
      status_timestamps: { completed: '2026-10-09T04:00:00Z' }, created_at: '2026-10-09T02:00:00Z' });
    rows.order_items.push({ id: 'sale-' + index, order_id: 'order-' + index, product_id: productId, quantity: 5, price: 125 });
    rows.order_item_costs.push({ order_item_id: 'sale-' + index, unit_cost: 80 });
  }
  rows.product_costs[0].cost_price = 120; // Today's cost must not rewrite historical profit.
  const result = await request('/api/sales-reports');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].estimatedGrossProfit, 225);
  assert.equal(result.body[0].uncostedQuantity, 0);
  const staff = await request('/api/sales-reports', 'staff');
  assert.equal(staff.status, 200);
  assert.doesNotMatch(JSON.stringify(staff.body), /cost|profit|margin/i);
  assert.equal((await request('/api/sales-reports', 'customer')).status, 403);
});

test('historical sales with no cost snapshot are identified as uncosted', async () => {
  rows.orders.push({ id: 'old-order', user_id: 'test-admin', total_price: 280, order_status: 'completed',
    status_timestamps: { completed: '2026-10-09T04:00:00Z' } });
  rows.order_items.push({ id: 'old-sale', order_id: 'old-order', product_id: productId, quantity: 2, price: 140 });
  const result = await request('/api/sales-reports');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body[0].estimatedGrossProfit, 0);
  assert.equal(result.body[0].uncostedQuantity, 2);
});


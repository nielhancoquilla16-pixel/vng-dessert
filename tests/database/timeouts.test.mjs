// node --experimental-test-module-mocks --test tests/database/timeouts.test.mjs
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from '../../dessert-ai-system/node_modules/express/index.js';
import * as realSupabase from '../../dessert-ai-system/server/lib/supabaseAdmin.js';
import { isDatabaseUnavailableError } from '../../dessert-ai-system/server/lib/databaseErrors.js';
import { createPurchaseFixture } from '../shop-hours/purchase-fixture.mjs';

const { database, rows } = createPurchaseFixture();
// The latest product and report handlers also read the private cost tables.
rows.product_costs = [];
rows.order_item_costs = [];
// Expiry must be computed even if the persisted availability is still available.
rows.products.find((row) => row.id === 'expired').availability = 'available';
const selections = [];
const client = {
  ...database,
  from: (table) => {
    const query = database.from(table);
    const select = query.select.bind(query);
    query.select = (columns) => { selections.push({ table, columns }); return select(columns); };
    if (table === 'products' || table === 'inventory') {
      for (const method of ['update', 'insert', 'delete', 'upsert']) {
        query[method] = () => { throw new Error('Catalog reads must not write to products or inventory.'); };
      }
    }
    return query;
  },
};
mock.module('../../dessert-ai-system/server/lib/supabaseAdmin.js', {
  namedExports: { ...realSupabase, getSupabaseAdmin: () => client, hasSupabaseAdminConfig: () => true },
});
const { default: productsRouter } = await import('../../dessert-ai-system/server/routes/products.js');
const { default: reportsRouter } = await import('../../dessert-ai-system/server/routes/salesReports.js');
const { requireAuth } = await import('../../dessert-ai-system/server/middleware/requireAuth.js');

const app = express();
app.use('/api/products', productsRouter);
app.use('/api/sales-reports', reportsRouter);
app.get('/auth-probe', requireAuth, (req, res) => res.json({ ok: true }));
app.use((error, req, res, next) => res.status(error.status || (isDatabaseUnavailableError(error) ? 503 : 500)).json({ error: 'Request failed.' }));
let server;
let origin;
before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test('product listing stays readable without expiry writes and reports current expiry', async () => {
  const response = await fetch(`${origin}/api/products`);
  assert.equal(response.status, 200);
  const products = await response.json();
  assert.equal(products.find((row) => row.id === 'expired').availability, 'expired');
  assert.equal(products.find((row) => row.id === 'expired').isExpired, true);
  assert.equal(products.some((row) => row.id === 'hidden'), false);
  assert.equal(products.find((row) => row.id === 'sold-out').availability, 'out of stock');
  assert.equal(rows.products.find((row) => row.id === 'expired').availability, 'available');
  const staffResponse = await fetch(`${origin}/api/products`, { headers: { Authorization: 'Bearer test-admin' } });
  assert.equal(staffResponse.status, 200);
  assert.equal((await staffResponse.json()).find((row) => row.id === 'hidden').availability, 'hidden');
});

test('lean sales query preserves completed sale totals, staff and receipt timestamp fallback', async () => {
  const completedAt = '2026-10-01T03:00:00.000Z';
  rows.orders.push({
    id: 'sale', user_id: 'test-admin', order_code: 'VNG-123456',
    order_status: 'completed', payment_method: 'cash', delivery_method: 'pickup',
    status_timestamps: {}, receipt_received_at: completedAt,
    created_at: '2026-09-30T03:00:00.000Z', updated_at: completedAt,
  }, {
    id: 'pending-sale', user_id: 'test-admin', order_status: 'pending',
    receipt_received_at: completedAt,
  }, {
    id: 'refunded-sale', user_id: 'test-admin', order_status: 'refunded',
    receipt_received_at: completedAt,
  });
  rows.order_items.push({ id: 'item', order_id: 'sale', product_id: 'available', quantity: 2, price: 100.5 });
  const response = await fetch(`${origin}/api/sales-reports?month=2026-10`, { headers: { Authorization: 'Bearer test-admin' } });
  assert.equal(response.status, 200);
  const reports = await response.json();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].totalSales, 201);
  assert.equal(reports[0].totalQuantity, 2);
  assert.equal(reports[0].submittedAt, completedAt);
  assert.equal(reports[0].staffId, 'test-admin');
  assert.equal(reports[0].items[0].itemName, 'Fresh Leche Flan');
  const projection = selections.find(({ table }) => table === 'orders').columns;
  assert.doesNotMatch(projection, /image_url|notifications|order_issue_reports|return_refund_requests|payment_checkouts|lalamove/);
});

test('profile query timeout reaches the error handler with its database code intact', async (t) => {
  t.mock.method(client, 'from', () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }),
  }) }) }));
  const response = await fetch(`${origin}/auth-probe`, { headers: { Authorization: 'Bearer test-admin' } });
  assert.equal(response.status, 503);
});

test('database outages are classified separately from validation and constraint failures', () => {
  for (const code of ['57014', '55P03', '53300', '57P01', '57P02', '57P03', '08006']) {
    assert.equal(isDatabaseUnavailableError({ code }), true, code);
  }
  for (const code of ['23505', '23503', '42501', 'PGRST116', undefined]) {
    assert.equal(isDatabaseUnavailableError({ code }), false, code);
  }
});

test('temporary auth-service failures return 503 instead of an invalid-session response', async (t) => {
  t.mock.method(database.auth, 'getUser', async () => ({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 503, message: 'Auth service unavailable' } }));
  const response = await fetch(`${origin}/auth-probe`, { headers: { Authorization: 'Bearer test-admin' } });
  assert.equal(response.status, 503);
});

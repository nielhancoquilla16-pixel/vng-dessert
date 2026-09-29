// Run with node --experimental-test-module-mocks --test tests/lalamove/routes.test.mjs
import test, { before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from '../../dessert-ai-system/node_modules/express/index.js';
import * as realSupabase from '../../dessert-ai-system/server/lib/supabaseAdmin.js';
import * as realBooking from '../../dessert-ai-system/server/lib/lalamoveBooking.js';
import { createPurchaseFixture } from '../shop-hours/purchase-fixture.mjs';

const { database, rows } = createPurchaseFixture();
rows.profiles.push({ id: 'test-staff', role: 'staff', full_name: 'Test Staff' });
Object.assign(rows.shop_settings[0], { phone_number: '09123456789', latitude: 14.45, longitude: 120.98 });
let submissions = [];
mock.module('../../dessert-ai-system/server/lib/supabaseAdmin.js', {
  namedExports: { ...realSupabase, getSupabaseAdmin: () => database },
});
mock.module('../../dessert-ai-system/server/lib/lalamoveBooking.js', {
  namedExports: {
    ...realBooking,
    bookLalamoveOrder: async (options) => {
      submissions.push(options);
      const booked = {
        ...options.order,
        ...options.addressPatch,
        lalamove_order_id: '3592038626034893861',
        lalamove_status: 'ASSIGNING_DRIVER',
        lalamove_share_link: 'https://share.sandbox.lalamove.com/?test-booking',
      };
      Object.assign(rows.orders.find((order) => order.id === booked.id), booked);
      return booked;
    },
  },
});
const { default: ordersRouter } = await import('../../dessert-ai-system/server/routes/orders.js');
const app = express();
app.use(express.json());
app.use('/api/orders', ordersRouter);
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
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
  submissions = [];
  rows.orders.splice(0, rows.orders.length, {
    id: 'delivery-test', user_id: 'test-customer', order_code: 'TEST-DELIVERY',
    customer_name: 'Account Owner', phone_number: '09111111111',
    delivery_recipient_name: 'Saved Recipient', delivery_contact_number: '09222222222',
    delivery_formatted_address: 'Saved complete delivery address, Las Pinas',
    delivery_latitude: 14.44, delivery_longitude: 120.99,
    delivery_instructions: 'Ring the bell',
    delivery_method: 'delivery', payment_method: 'cash', order_status: 'confirmed',
    notifications: [], order_items: [], payment_checkouts: [],
  });
});

const book = async (role = 'admin', body = {}) => {
  const response = await fetch(`${origin}/api/orders/delivery-test/lalamove/book`, {
    method: 'POST', headers: { Authorization: `Bearer test-${role}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

for (const role of ['admin', 'staff']) {
  test(`${role} books using the saved recipient and opens the created delivery`, async () => {
    const result = await book(role);
    assert.equal(result.status, 201);
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].addressPatch.delivery_recipient_name, 'Saved Recipient');
    assert.equal(submissions[0].addressPatch.delivery_contact_number, '09222222222');
    assert.equal(submissions[0].addressPatch.address, 'Saved complete delivery address, Las Pinas');
    assert.equal(submissions[0].pickup.latitude, '14.45');
    assert.equal(submissions[0].instructions, 'Ring the bell');
    assert.equal(result.body.order.lalamoveTracking.booked, true);
    assert.equal(result.body.lalamoveLaunch.launchUrls.web, result.body.order.lalamoveTracking.shareLink);
    assert.equal(result.body.lalamoveLaunch.mode, 'delivery-api');
  });
}

test('edited recipient is submitted, and instructions can be cleared', async () => {
  assert.equal((await book('staff', { recipientName: 'Changed Recipient', contactNumber: '09333333333', instructions: '' })).status, 201);
  assert.equal(submissions[0].addressPatch.delivery_recipient_name, 'Changed Recipient');
  assert.equal(submissions[0].addressPatch.delivery_contact_number, '09333333333');
  assert.equal(submissions[0].instructions, '');
});

test('admin and staff can book online delivery after PayMongo confirms payment', async () => {
  rows.orders[0].payment_method = 'online';
  rows.orders[0].payment_checkouts = [{
    status: 'fulfilled',
    payment_method: 'online',
    updated_at: '2026-09-28T10:00:00.000Z',
  }];

  const result = await book('staff');
  assert.equal(result.status, 201);
  assert.equal(submissions.length, 1);
  assert.equal(result.body.order.lalamoveTracking.booked, true);
});

test('online delivery cannot be booked until the latest checkout is paid', async () => {
  rows.orders[0].payment_method = 'online';
  rows.orders[0].payment_checkouts = [
    { status: 'fulfilled', updated_at: '2026-09-28T09:00:00.000Z' },
    { status: 'created', updated_at: '2026-09-28T10:00:00.000Z' },
  ];

  const result = await book('admin');
  assert.equal(result.status, 400);
  assert.match(result.body.error, /Complete the online payment/);
  assert.equal(submissions.length, 0);
});

test('staff can replace a legacy zero pin with an OpenStreetMap selection before booking', async () => {
  Object.assign(rows.orders[0], { delivery_latitude: 0, delivery_longitude: 0 });
  assert.equal((await book('staff')).status, 400);
  assert.equal(submissions.length, 0);
  const result = await book('staff', { destinationLatitude: '14.45678912', destinationLongitude: '120.98765432' });
  assert.equal(result.status, 201);
  assert.equal(Number(submissions[0].addressPatch.delivery_latitude), 14.45678912);
  assert.equal(Number(submissions[0].addressPatch.delivery_longitude), 120.98765432);
  assert.equal(Number(rows.orders[0].delivery_latitude), 14.45678912);
  assert.equal(Number(rows.orders[0].delivery_longitude), 120.98765432);
});

test('customer cannot dispatch a courier', async () => {
  assert.equal((await book('customer')).status, 403);
  assert.equal(submissions.length, 0);
});

test('repeated click returns existing booking without a second submission', async () => {
  const first = await book();
  const repeated = await book('staff');
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.lalamoveLaunch.orderId, first.body.lalamoveLaunch.orderId);
  assert.equal(submissions.length, 1);
});

test('missing map pin and incomplete saved recipient never reach the courier', async () => {
  rows.orders[0].delivery_latitude = null;
  assert.equal((await book()).status, 400);
  rows.orders[0].delivery_latitude = 14.44;
  rows.orders[0].phone_number = '';
  rows.orders[0].delivery_contact_number = '';
  assert.equal((await book()).status, 400);
  assert.equal(submissions.length, 0);
});

test('pending orders and uncertain courier submissions cannot be booked', async () => {
  rows.orders[0].order_status = 'pending';
  assert.equal((await book()).status, 400);
  rows.orders[0].order_status = 'confirmed';
  rows.orders[0].lalamove_status = 'BOOKING_UNCONFIRMED';
  assert.equal((await book()).status, 409);
  assert.equal(submissions.length, 0);
});

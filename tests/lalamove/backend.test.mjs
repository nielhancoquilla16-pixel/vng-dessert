import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  bookLalamoveOrder,
  buildLalamoveBookingLaunch,
} from '../../dessert-ai-system/server/lib/lalamoveBooking.js';
import {
  createLalamoveDelivery,
  retrieveLalamoveOrderDetails,
  retrieveLalamoveDriverDetails,
} from '../../dessert-ai-system/server/lib/lalamove.js';
import { normalizeCustomerAddressInput, getCustomerAddressValidationError, toOrderDeliveryAddress } from '../../dessert-ai-system/server/lib/customerAddresses.js';

const shareLink = 'https://share.sandbox.lalamove.com/?PH-test&sign=a%2Bb&lang=en_PH';
const makeOrder = () => ({
  id: 'local-order-1',
  order_code: 'VNG-TEST-1',
  order_status: 'ready',
  customer_name: 'Account Owner',
  phone_number: '09170000001',
  delivery_recipient_name: 'Delivery Recipient',
  delivery_contact_number: '09170000002',
  delivery_formatted_address: 'Saved delivery address',
  delivery_latitude: '14.6001',
  delivery_longitude: '121.0202',
  lalamove_order_id: null,
  lalamove_status: null,
  order_items: [{ quantity: 2, products: { product_name: 'Test Dessert' } }],
});
const pickup = {
  name: 'Configured Branch',
  phone: '09170000003',
  address: 'Configured branch address',
  latitude: '14.55',
  longitude: '121.01',
};
const makeDelivery = () => ({
  quotation: { quotationId: 'quotation-1' },
  order: {
    orderId: 'provider-order-1',
    quotationId: 'quotation-1',
    status: 'ASSIGNING_DRIVER',
    shareLink,
  },
  destinationCoordinates: { lat: '14.6001', lng: '121.0202' },
});

// Execute each conditional update atomically, as a single database statement.
// This fake is deliberately shared by requests with independent stale snapshots.
function makeDatabase(initialOrder, { failReferenceSave = false } = {}) {
  const row = structuredClone(initialOrder);
  return {
    row,
    from(table) {
      assert.equal(table, 'orders');
      let patch;
      const predicates = [];
      let execution;
      const execute = () => {
        if (!execution) {
          execution = Promise.resolve().then(() => {
            if (!predicates.every((matches) => matches(row))) return { data: null, error: null };
            if (failReferenceSave && patch.lalamove_order_id) {
              return { data: null, error: new Error('Database unavailable while saving reference') };
            }
            Object.assign(row, structuredClone(patch));
            return { data: { id: row.id }, error: null };
          });
        }
        return execution;
      };
      const query = {
        update(value) { patch = value; return query; },
        eq(key, value) { predicates.push((entry) => entry[key] === value); return query; },
        is(key, value) { predicates.push((entry) => (entry[key] ?? null) === value); return query; },
        or(expression) {
          const match = /^(\w+)\.is\.null,\1\.not\.in\.\(([^)]+)\)$/.exec(expression);
          assert.ok(match, `Unsupported database predicate: ${expression}`);
          const [, key, excluded] = match;
          predicates.push((entry) => entry[key] == null || !excluded.split(',').includes(entry[key]));
          return query;
        },
        select() { return query; },
        maybeSingle: execute,
        then(resolve, reject) { return execute().then(resolve, reject); },
      };
      return query;
    },
  };
}

// All HTTP requests target this loopback server with fake credentials. No .env,
// live databases, or external delivery services are loaded by these tests.
async function withProvider(run, { quoteStatus = 200, orderStatus = 201, incompleteQuote = false, hangOrder = false } = {}) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push({ method: request.method, path: request.url, headers: request.headers, body: raw ? JSON.parse(raw) : null });
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET' && request.url === '/v3/orders/provider-order-1') {
      response.end(JSON.stringify({ data: { ...makeDelivery().order, status: 'ON_GOING', driverId: 'driver-1' } }));
      return;
    }
    if (request.method === 'GET' && request.url === '/v3/orders/provider-order-1/drivers/driver-1') {
      response.end(JSON.stringify({ data: { driverId: 'driver-1', name: 'Test Driver', phone: '+639170000004' } }));
      return;
    }
    if (request.url === '/v3/quotations') {
      response.statusCode = quoteStatus;
      response.end(JSON.stringify(quoteStatus >= 400
        ? { message: 'Quotation rejected' }
        : { data: { quotationId: 'quotation-1', stops: incompleteQuote ? [] : [{ stopId: 'pickup-stop' }, { stopId: 'recipient-stop' }] } }));
      return;
    }
    if (request.url === '/v3/orders') {
      if (hangOrder) return;
      response.statusCode = orderStatus;
      response.end(JSON.stringify(orderStatus >= 400 ? { message: 'Order rejected' } : { data: makeDelivery().order }));
      return;
    }
    response.statusCode = 404;
    response.end('{}');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const values = {
    LALAMOVE_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    LALAMOVE_API_KEY: 'pk_test_local_fixture',
    LALAMOVE_API_SECRET: 'sk_test_local_fixture',
    LALAMOVE_ENVIRONMENT: 'sandbox',
    LALAMOVE_MARKET: 'PH',
    LALAMOVE_LANGUAGE: 'en_PH',
    LALAMOVE_SERVICE_TYPE: 'MOTORCYCLE',
    LALAMOVE_SPECIAL_REQUESTS: '',
    LALAMOVE_POD_ENABLED: 'true',
    LALAMOVE_PICKUP_NAME: 'Environment fallback',
    LALAMOVE_PICKUP_PHONE: '',
    LALAMOVE_PICKUP_ADDRESS: '',
    LALAMOVE_PICKUP_LATITUDE: '',
    LALAMOVE_PICKUP_LONGITUDE: '',
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    await run(requests);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('tracking retrieves the order and driver without pickup environment settings', async () => {
  await withProvider(async (requests) => {
    const order = await retrieveLalamoveOrderDetails('provider-order-1');
    const driver = await retrieveLalamoveDriverDetails(order.orderId, order.driverId);
    assert.equal(order.status, 'ON_GOING');
    assert.equal(order.shareLink, shareLink);
    assert.equal(driver.name, 'Test Driver');
    assert.deepEqual(requests.map(({ method, path }) => `${method} ${path}`), [
      'GET /v3/orders/provider-order-1',
      'GET /v3/orders/provider-order-1/drivers/driver-1',
    ]);
    for (const request of requests) {
      assert.match(request.headers.authorization, /^hmac pk_test_local_fixture:/);
      assert.equal(request.headers.market, 'PH');
      assert.equal(request.body, null);
    }
  });
});

for (const credential of ['LALAMOVE_API_KEY', 'LALAMOVE_API_SECRET']) {
  test(`tracking still rejects a missing ${credential} before contacting the courier`, async () => {
    await withProvider(async (requests) => {
      process.env[credential] = '';
      await assert.rejects(retrieveLalamoveOrderDetails('provider-order-1'), { status: 503, message: new RegExp(credential) });
      await assert.rejects(retrieveLalamoveDriverDetails('provider-order-1', 'driver-1'), { status: 503, message: new RegExp(credential) });
      assert.equal(requests.length, 0);
    });
  });
}

test('a new booking still requires pickup details before contacting the courier', async () => {
  await withProvider(async (requests) => {
    await assert.rejects(createLalamoveDelivery({ order: makeOrder() }), { status: 503, message: /LALAMOVE_PICKUP_ADDRESS/ });
    assert.equal(requests.length, 0);
  });
});

test('booking sends saved delivery recipient, pickup override and instructions through actual quotation and order HTTP requests', async () => {
  await withProvider(async (requests) => {
    const order = makeOrder();
    const delivery = await createLalamoveDelivery({ order, pickup, instructions: 'Call on arrival; keep upright' });
    assert.deepEqual(requests.map(({ method, path }) => `${method} ${path}`), ['POST /v3/quotations', 'POST /v3/orders']);
    const [quote, booking] = requests;
    assert.deepEqual(quote.body.data.stops, [
      { coordinates: { lat: '14.55', lng: '121.01' }, address: pickup.address },
      { coordinates: { lat: '14.6001', lng: '121.0202' }, address: order.delivery_formatted_address },
    ]);
    assert.deepEqual(booking.body.data.sender, { stopId: 'pickup-stop', name: pickup.name, phone: '+639170000003' });
    assert.equal(booking.body.data.quotationId, 'quotation-1');
    const recipient = booking.body.data.recipients[0];
    assert.equal(recipient.stopId, 'recipient-stop');
    assert.equal(recipient.name, 'Delivery Recipient');
    assert.equal(recipient.phone, '+639170000002');
    assert.match(recipient.remarks, /Call on arrival; keep upright/);
    assert.match(recipient.remarks, /2x Test Dessert/);
    assert.match(recipient.remarks, /VNG-TEST-1/);
    assert.match(booking.headers.authorization, /^hmac pk_test_local_fixture:/);
    assert.equal(booking.headers.market, 'PH');
    assert.ok(booking.headers['request-id']);
    assert.equal(delivery.order.orderId, 'provider-order-1');
    assert.equal(delivery.order.shareLink, shareLink);
  });
});

test('a saved OpenStreetMap pin reaches the courier quotation and is persisted on the order', async () => {
  await withProvider(async (requests) => {
    const address = normalizeCustomerAddressInput({
      recipientName: 'Map Recipient', phoneNumber: '09170000002',
      streetAddress: '10 Example Street', city: 'Las Pinas', province: 'Metro Manila',
      formattedAddress: '10 Example Street, Las Pinas, Metro Manila',
      latitude: '14.45678912', longitude: '120.98765432',
    });
    assert.equal(getCustomerAddressValidationError(address), '');
    const deliveryAddress = toOrderDeliveryAddress(address);
    const order = { ...makeOrder(), delivery_latitude: 0, delivery_longitude: 0 };
    const supabase = makeDatabase(order);
    await bookLalamoveOrder({
      supabase, order, pickup,
      addressPatch: {
        delivery_recipient_name: deliveryAddress.recipientName,
        delivery_contact_number: deliveryAddress.contactNumber,
        delivery_formatted_address: deliveryAddress.formattedAddress,
        delivery_latitude: deliveryAddress.latitude,
        delivery_longitude: deliveryAddress.longitude,
      },
    });
    assert.deepEqual(requests[0].body.data.stops[1], {
      coordinates: { lat: '14.45678912', lng: '120.98765432' },
      address: address.formatted_address,
    });
    assert.equal(requests[1].body.data.recipients[0].name, 'Map Recipient');
    assert.equal(Number(supabase.row.delivery_latitude), 14.45678912);
    assert.equal(Number(supabase.row.delivery_longitude), 120.98765432);
  });
});

test('invalid pickup or delivery pins are rejected without any courier HTTP request', async () => {
  await withProvider(async (requests) => {
    for (const pin of [
      { latitude: 0, longitude: 0 },
      { latitude: '', longitude: '' },
      { latitude: 100, longitude: 120 },
      { latitude: 14, longitude: 181 },
    ]) {
      await assert.rejects(createLalamoveDelivery({ order: makeOrder(), pickup: { ...pickup, ...pin } }));
      await assert.rejects(createLalamoveDelivery({ order: { ...makeOrder(), delivery_latitude: pin.latitude, delivery_longitude: pin.longitude }, pickup }));
    }
    assert.equal(requests.length, 0);
  });
});

for (const [name, scenario] of [
  ['rejected quotation', { quoteStatus: 422 }],
  ['incomplete quotation', { incompleteQuote: true }],
]) {
  test(`${name} does not submit an order and releases the booking claim`, async () => {
    await withProvider(async (requests) => {
      const order = makeOrder();
      const supabase = makeDatabase(order);
      await assert.rejects(bookLalamoveOrder({ supabase, order, pickup }));
      assert.deepEqual(requests.map(({ path }) => path), ['/v3/quotations']);
      assert.equal(supabase.row.lalamove_status, null);
      assert.equal(supabase.row.lalamove_order_id, null);
    }, scenario);
  });
}

test('persisted booking is reused and a stale second request cannot dispatch another courier', async () => {
  const original = makeOrder();
  const supabase = makeDatabase(original);
  let calls = 0;
  const dependencies = { createDelivery: async () => { calls += 1; return makeDelivery(); } };
  const saved = await bookLalamoveOrder({ supabase, order: original }, dependencies);
  assert.equal(saved.lalamove_order_id, 'provider-order-1');
  assert.equal(supabase.row.lalamove_order_id, 'provider-order-1');
  assert.equal(supabase.row.lalamove_status, 'ASSIGNING_DRIVER');
  assert.equal(await bookLalamoveOrder({ supabase, order: saved }, dependencies), saved);
  await assert.rejects(bookLalamoveOrder({ supabase, order: original }, dependencies), { status: 409 });
  assert.equal(calls, 1);
});

test('simultaneous staff requests with stale snapshots acquire only one booking claim', async () => {
  const order = makeOrder();
  const supabase = makeDatabase(order);
  let calls = 0;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const dependencies = { createDelivery: async () => { calls += 1; markStarted(); await pending; return makeDelivery(); } };
  const first = bookLalamoveOrder({ supabase, order: structuredClone(order) }, dependencies);
  await started;
  assert.equal(supabase.row.lalamove_status, 'BOOKING');
  try {
    await assert.rejects(bookLalamoveOrder({ supabase, order: structuredClone(order) }, dependencies), { status: 409 });
    assert.equal(calls, 1);
  } finally {
    release();
    await first;
  }
  assert.equal(supabase.row.lalamove_order_id, 'provider-order-1');
});

test('saved delivery correction is used by the courier request and retained in the order', async () => {
  const order = makeOrder();
  const supabase = makeDatabase(order);
  const addressPatch = { delivery_latitude: '14.61', delivery_longitude: '121.03', delivery_formatted_address: 'Corrected address' };
  let submitted;
  await bookLalamoveOrder({ supabase, order, addressPatch, pickup, instructions: 'Use side entrance' }, {
    createDelivery: async (input) => {
      submitted = input;
      return { ...makeDelivery(), destinationCoordinates: { lat: '14.61', lng: '121.03' } };
    },
  });
  assert.equal(submitted.order.delivery_formatted_address, 'Corrected address');
  assert.equal(submitted.destinationLatitude, '14.61');
  assert.equal(submitted.destinationLongitude, '121.03');
  assert.deepEqual(submitted.pickup, pickup);
  assert.equal(submitted.instructions, 'Use side entrance');
  assert.equal(supabase.row.delivery_formatted_address, 'Corrected address');
  assert.equal(supabase.row.delivery_instructions, 'Use side entrance');
});

test('a definite order rejection releases the claim so a corrected request can be submitted', async () => {
  await withProvider(async (requests) => {
    const order = makeOrder();
    const supabase = makeDatabase(order);
    await assert.rejects(bookLalamoveOrder({ supabase, order, pickup }), { status: 422 });
    assert.equal(supabase.row.lalamove_status, null);
    assert.equal(supabase.row.lalamove_order_id, null);
    assert.equal(requests.filter(({ path }) => path === '/v3/orders').length, 1);
    let retryCalls = 0;
    await bookLalamoveOrder({ supabase, order, pickup }, {
      createDelivery: async () => { retryCalls += 1; return makeDelivery(); },
    });
    assert.equal(retryCalls, 1);
    assert.equal(supabase.row.lalamove_order_id, 'provider-order-1');
  }, { orderStatus: 422 });
});

for (const status of [408, 503]) {
  test(`uncertain order response HTTP ${status} retains a lock and prevents a second submission`, async () => {
    await withProvider(async (requests) => {
      const order = makeOrder();
      const supabase = makeDatabase(order);
      await assert.rejects(bookLalamoveOrder({ supabase, order, pickup }), { status: 409, message: /may have accepted/ });
      assert.equal(supabase.row.lalamove_status, 'BOOKING_UNCONFIRMED');
      assert.equal(supabase.row.lalamove_order_id, null);
      await assert.rejects(bookLalamoveOrder({ supabase, order, pickup }), { status: 409 });
      assert.deepEqual(requests.map(({ path }) => path), ['/v3/quotations', '/v3/orders']);
    }, { orderStatus: status });
  });
}

test('an order request that times out after submission remains locked', async (context) => {
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  context.mock.method(AbortSignal, 'timeout', () => originalTimeout(100));
  await withProvider(async (requests) => {
    const order = makeOrder();
    const supabase = makeDatabase(order);
    await assert.rejects(bookLalamoveOrder({ supabase, order, pickup }), { status: 409, message: /may have accepted/ });
    assert.equal(supabase.row.lalamove_status, 'BOOKING_UNCONFIRMED');
    await assert.rejects(bookLalamoveOrder({ supabase, order, pickup }), { status: 409 });
    assert.deepEqual(requests.map(({ path }) => path), ['/v3/quotations', '/v3/orders']);
  }, { hangOrder: true });
});

test('failure to persist an accepted delivery retains the reference for recovery and prevents redispatch', async () => {
  const order = makeOrder();
  const supabase = makeDatabase(order, { failReferenceSave: true });
  let calls = 0;
  const dependencies = { createDelivery: async () => { calls += 1; return makeDelivery(); } };
  await assert.rejects(bookLalamoveOrder({ supabase, order }, dependencies), {
    status: 409,
    message: /provider-order-1 was created, but its reference could not be saved/,
  });
  assert.equal(supabase.row.lalamove_status, 'BOOKING_UNCONFIRMED');
  assert.equal(supabase.row.lalamove_metadata.unconfirmedBooking.orderId, 'provider-order-1');
  assert.match(supabase.row.lalamove_booking_error, /provider-order-1/);
  await assert.rejects(bookLalamoveOrder({ supabase, order }, dependencies), { status: 409 });
  assert.equal(calls, 1);
});

test('launch points to the booked delivery without a generic app fallback', () => {
  const launch = buildLalamoveBookingLaunch({ lalamove_order_id: 'provider-order-1', lalamove_share_link: shareLink });
  assert.equal(launch.mode, 'delivery-api');
  assert.equal(launch.shareLink, shareLink);
  assert.deepEqual(launch.launchUrls, { web: shareLink });
  const missingLink = buildLalamoveBookingLaunch({ lalamove_order_id: 'provider-order-1' });
  assert.deepEqual(missingLink.launchUrls, { web: '' });
});

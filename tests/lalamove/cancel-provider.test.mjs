import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  cancelLalamoveDelivery,
  mapLalamoveStatusToOrderStatus,
  retrieveLalamoveOrderDetails,
} from '../../dessert-ai-system/server/lib/lalamove.js';

const pickup = {
  name: 'Fixture Shop',
  phone: '09170000001',
  address: 'Fixture pickup address',
  latitude: '14.55',
  longitude: '121.01',
};

// This fixture never loads .env and only sends requests to a loopback server.
async function withProvider(run, { status = 204, responseBody = '', disconnect = false } = {}) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, path: request.url, headers: request.headers, body });
    if (disconnect) {
      request.socket.destroy();
      return;
    }
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.end(responseBody);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const values = {
    LALAMOVE_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    LALAMOVE_API_KEY: 'pk_test_cancel_fixture',
    LALAMOVE_API_SECRET: 'sk_test_cancel_fixture',
    LALAMOVE_MARKET: 'PH',
    LALAMOVE_PICKUP_NAME: '',
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

test('cancellation signs a bodyless DELETE and accepts a JSON-header 204', async () => {
  await withProvider(async (requests) => {
    const id = 'fixture/order?1';
    assert.deepEqual(await cancelLalamoveDelivery(id, { pickup }), { orderId: id, status: 'CANCELED' });
    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.equal(request.method, 'DELETE');
    assert.equal(request.path, '/v3/orders/fixture%2Forder%3F1');
    assert.equal(request.body, '');
    assert.equal(request.headers.market, 'PH');
    assert.ok(request.headers['request-id']);
    const match = /^hmac pk_test_cancel_fixture:(\d+):([a-f\d]+)$/.exec(request.headers.authorization);
    assert.ok(match);
    const signature = createHmac('sha256', 'sk_test_cancel_fixture')
      .update(`${match[1]}\r\nDELETE\r\n${request.path}\r\n\r\n`)
      .digest('hex');
    assert.equal(match[2], signature);
  });
});

test('cancellation forbidden returns a friendly error and retains the provider response', async () => {
  const details = { message: 'ERR_CANCELLATION_FORBIDDEN' };
  await withProvider(async (requests) => {
    await assert.rejects(cancelLalamoveDelivery('fixture-order', { pickup }), (error) => {
      assert.equal(error.status, 409);
      assert.match(error.message, /no longer allows cancellation/);
      assert.deepEqual(error.details, details);
      assert.equal(error.cancellationUncertain, false);
      return true;
    });
    assert.equal(requests.length, 1);
  }, { status: 409, responseBody: JSON.stringify(details) });
});

test('cancellation preserves other provider failures without reporting success', async () => {
  const details = { errors: [{ message: 'Invalid authentication' }] };
  await withProvider(async () => {
    await assert.rejects(cancelLalamoveDelivery('fixture-order', { pickup }), (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.message, 'Invalid authentication');
      assert.deepEqual(error.details, details);
      assert.equal(error.cancellationUncertain, false);
      return true;
    });
  }, { status: 401, responseBody: JSON.stringify(details) });
});

test('cancellation marks a lost provider response as uncertain', async () => {
  await withProvider(async (requests) => {
    await assert.rejects(cancelLalamoveDelivery('fixture-order', { pickup }), (error) => {
      assert.equal(error.cancellationUncertain, true);
      return true;
    });
    assert.equal(requests.length, 1);
  }, { disconnect: true });
});

test('cancellation rejects missing or non-string IDs without contacting the provider', async () => {
  await withProvider(async (requests) => {
    for (const id of [undefined, null, '', '  ', {}, 1234567890123456789]) {
      await assert.rejects(cancelLalamoveDelivery(id, { pickup }), { status: 400 });
    }
    assert.equal(requests.length, 0);
  });
});

test('missing credentials are not an uncertain provider cancellation', async () => {
  await withProvider(async (requests) => {
    process.env.LALAMOVE_API_SECRET = '';
    await assert.rejects(cancelLalamoveDelivery('fixture-order'), (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.cancellationUncertain, false);
      return true;
    });
    assert.equal(requests.length, 0);
  });
});

test('cancelling an existing booking does not require pickup environment settings', async () => {
  await withProvider(async (requests) => {
    assert.deepEqual(await cancelLalamoveDelivery('fixture-order'), { orderId: 'fixture-order', status: 'CANCELED' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'DELETE');
    assert.equal(requests[0].path, '/v3/orders/fixture-order');
  });
});

test('retrieving order details uses the saved shop pickup override', async () => {
  const order = { orderId: 'fixture-order', status: 'ASSIGNING_DRIVER' };
  await withProvider(async (requests) => {
    assert.deepEqual(await retrieveLalamoveOrderDetails(order.orderId, { pickup }), order);
    assert.equal(requests[0].method, 'GET');
    assert.equal(requests[0].path, '/v3/orders/fixture-order');
    assert.equal(requests[0].body, '');
  }, { status: 200, responseBody: JSON.stringify({ data: order }) });
});

test('cancelled courier status does not cancel or otherwise change the dessert order', () => {
  for (const providerStatus of ['CANCELED', 'CANCELLED']) {
    for (const orderStatus of ['ready', 'out-for-delivery', 'delivered', 'completed', 'refunded']) {
      assert.equal(mapLalamoveStatusToOrderStatus(providerStatus, orderStatus), '');
    }
  }
  assert.equal(mapLalamoveStatusToOrderStatus('REJECTED', 'ready'), 'cancelled');
  assert.equal(mapLalamoveStatusToOrderStatus('EXPIRED', 'ready'), 'cancelled');
});

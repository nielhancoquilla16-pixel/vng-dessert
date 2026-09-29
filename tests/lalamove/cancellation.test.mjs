import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelLalamoveOrder } from '../../dessert-ai-system/server/lib/lalamoveCancellation.js';
import { LalamoveApiError } from '../../dessert-ai-system/server/lib/lalamove.js';

const makeOrder = (overrides = {}) => ({
  id: 'dessert-order-1',
  order_code: 'VNG-CANCEL-1',
  delivery_method: 'delivery',
  order_status: 'ready',
  payment_status: 'paid',
  payment_method: 'gcash',
  total_amount: 500,
  inventory_deducted: true,
  order_items: [{ product_id: 'dessert-1', quantity: 2 }],
  lalamove_order_id: '3591466233260315549',
  lalamove_status: 'ASSIGNING_DRIVER',
  lalamove_share_link: 'https://share.sandbox.lalamove.com/?test-order',
  lalamove_booking_error: 'An earlier refresh failed',
  lalamove_last_synced_at: '2026-09-24T00:00:00.000Z',
  lalamove_metadata: { source: 'existing-booking', quotation: { quotationId: 'quote-1' } },
  ...overrides,
});

// This fake accepts only the cancellation helper's narrow order write. It never
// connects to a database, loads .env, or contacts a courier.
function makeDatabase(order, { saveError = null } = {}) {
  const row = structuredClone(order);
  const writes = [];
  return {
    row,
    writes,
    from(table) {
      assert.equal(table, 'orders', 'cancelling a courier must not change inventory or payments');
      let patch;
      let selected;
      const filters = [];
      const query = {
        update(value) { patch = structuredClone(value); return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        select(value) { selected = value; return query; },
        async maybeSingle() {
          assert.equal(selected, 'id');
          assert.deepEqual(filters, [['id', order.id], ['lalamove_order_id', order.lalamove_order_id]]);
          writes.push({ patch, filters });
          if (saveError) return { data: null, error: saveError };
          if (!filters.every(([key, value]) => row[key] === value)) return { data: null, error: null };
          Object.assign(row, patch);
          return { data: { id: row.id }, error: null };
        },
      };
      return query;
    },
  };
}

const makeProviderOrder = (order, status) => ({
  orderId: order.lalamove_order_id,
  status,
  shareLink: order.lalamove_share_link,
});

const forbiddenProvider = {
  retrieveOrder: async () => assert.fail('No courier lookup was expected'),
  cancelDelivery: async () => assert.fail('No courier cancellation was expected'),
};

const assertCancelledOnly = (before, after, database) => {
  assert.equal(after.lalamove_status, 'CANCELED');
  assert.equal(after.lalamove_booking_error, null);
  assert.ok(Number.isFinite(Date.parse(after.lalamove_last_synced_at)));
  assert.notEqual(after.lalamove_last_synced_at, before.lalamove_last_synced_at);
  assert.equal(after.lalamove_metadata.source, before.lalamove_metadata.source);
  assert.deepEqual(after.lalamove_metadata.quotation, before.lalamove_metadata.quotation);
  const mutableFields = new Set([
    'lalamove_status', 'lalamove_booking_error', 'lalamove_last_synced_at', 'lalamove_metadata',
  ]);
  for (const [key, value] of Object.entries(before)) {
    if (!mutableFields.has(key)) assert.deepEqual(after[key], value, `${key} must be retained`);
  }
  assert.equal(database.writes.length, 1);
  for (const key of Object.keys(database.writes[0].patch)) {
    assert.ok(mutableFields.has(key), `Unexpected cancellation write: ${key}`);
  }
  assert.deepEqual(database.row, after);
};

for (const overrides of [
  { delivery_method: 'pickup' },
  { lalamove_order_id: null },
  { lalamove_order_id: '' },
]) {
  test(`cancellation rejects an ineligible order before contacting Lalamove: ${JSON.stringify(overrides)}`, async () => {
    const order = makeOrder(overrides);
    const supabase = makeDatabase(order);
    await assert.rejects(cancelLalamoveOrder({ supabase, order }, forbiddenProvider), { status: 409 });
    assert.deepEqual(supabase.row, order);
    assert.equal(supabase.writes.length, 0);
  });
}

for (const status of ['CANCELED', 'CANCELLED']) {
  test(`a locally ${status} delivery returns idempotently without provider calls or writes`, async () => {
    const order = makeOrder({ lalamove_status: status });
    const supabase = makeDatabase(order);
    const result = await cancelLalamoveOrder({ supabase, order }, forbiddenProvider);
    assert.deepEqual(result, order);
    assert.equal(supabase.writes.length, 0);
  });
}

for (const status of ['PICKED_UP', 'COMPLETED', 'REJECTED', 'EXPIRED']) {
  test(`a locally ${status} delivery cannot be cancelled`, async () => {
    const order = makeOrder({ lalamove_status: status });
    const supabase = makeDatabase(order);
    await assert.rejects(cancelLalamoveOrder({ supabase, order }, forbiddenProvider), { status: 409 });
    assert.deepEqual(supabase.row, order);
    assert.equal(supabase.writes.length, 0);
  });
}

for (const status of ['ASSIGNING_DRIVER', 'ON_GOING', 'ONGOING']) {
  test(`a freshly confirmed ${status} delivery can be cancelled without cancelling the dessert order`, async () => {
    const order = makeOrder();
    const original = structuredClone(order);
    const supabase = makeDatabase(order);
    const calls = [];
    const result = await cancelLalamoveOrder({ supabase, order, actorId: 'admin-1' }, {
      async retrieveOrder(id) {
        assert.equal(id, order.lalamove_order_id);
        calls.push('GET');
        return makeProviderOrder(order, status);
      },
      async cancelDelivery(id) {
        assert.equal(id, order.lalamove_order_id);
        calls.push('DELETE');
        assert.equal(supabase.writes.length, 0, 'cancellation must be confirmed before it is saved');
        // A successful Lalamove DELETE returns HTTP 204, without a response body.
      },
    });
    assert.deepEqual(calls, ['GET', 'DELETE']);
    assertCancelledOnly(original, result, supabase);
    assert.deepEqual(order, original, 'the caller snapshot must not be mutated');
    assert.notDeepEqual(result.lalamove_metadata, original.lalamove_metadata);
  });
}

for (const status of ['PICKED_UP', 'COMPLETED', 'REJECTED', 'EXPIRED', 'UNRECOGNIZED_STATUS']) {
  test(`a fresh ${status} provider response prevents cancellation of a stale pending local order`, async () => {
    const order = makeOrder();
    const supabase = makeDatabase(order);
    await assert.rejects(cancelLalamoveOrder({ supabase, order }, {
      retrieveOrder: async () => makeProviderOrder(order, status),
      cancelDelivery: forbiddenProvider.cancelDelivery,
    }), { status: 409 });
    assert.deepEqual(supabase.row, order);
    assert.equal(supabase.writes.length, 0);
  });
}

for (const status of ['CANCELED', 'CANCELLED']) {
  test(`a provider delivery already ${status} is reconciled without a second DELETE`, async () => {
    const order = makeOrder();
    const supabase = makeDatabase(order);
    const result = await cancelLalamoveOrder({ supabase, order }, {
      retrieveOrder: async () => makeProviderOrder(order, status),
      cancelDelivery: forbiddenProvider.cancelDelivery,
    });
    assertCancelledOnly(order, result, supabase);
  });
}

for (const response of [
  { orderId: '3591466233260315549' },
  { orderId: 'different-provider-order', status: 'ASSIGNING_DRIVER' },
]) {
  test(`an incomplete or mismatched provider response cannot cancel an order: ${JSON.stringify(response)}`, async () => {
    const order = makeOrder();
    const supabase = makeDatabase(order);
    await assert.rejects(cancelLalamoveOrder({ supabase, order }, {
      retrieveOrder: async () => response,
      cancelDelivery: forbiddenProvider.cancelDelivery,
    }), { status: 502 });
    assert.deepEqual(supabase.row, order);
    assert.equal(supabase.writes.length, 0);
  });
}

test('a failed initial status lookup never sends DELETE or modifies the order', async () => {
  const order = makeOrder();
  const supabase = makeDatabase(order);
  await assert.rejects(cancelLalamoveOrder({ supabase, order }, {
    retrieveOrder: async () => { throw new LalamoveApiError('Unable to retrieve Lalamove status', 502); },
    cancelDelivery: forbiddenProvider.cancelDelivery,
  }), { status: 502 });
  assert.deepEqual(supabase.row, order);
  assert.equal(supabase.writes.length, 0);
});

for (const uncertain of [false, true]) {
  test(`${uncertain ? 'an uncertain DELETE' : 'a conflicting cancellation'} reconciles a provider-confirmed cancellation`, async () => {
    const order = makeOrder();
    const supabase = makeDatabase(order);
    const calls = [];
    const result = await cancelLalamoveOrder({ supabase, order }, {
      async retrieveOrder() {
        calls.push('GET');
        return makeProviderOrder(order, calls.length === 1 ? 'ASSIGNING_DRIVER' : 'CANCELED');
      },
      async cancelDelivery() {
        calls.push('DELETE');
        const error = new LalamoveApiError(uncertain ? 'Confirmation was not received' : 'Order has changed', uncertain ? 502 : 409);
        if (uncertain) error.cancellationUncertain = true;
        throw error;
      },
    });
    assert.deepEqual(calls, ['GET', 'DELETE', 'GET']);
    assertCancelledOnly(order, result, supabase);
  });
}

test('a driver pickup racing with cancellation never records a false cancellation', async () => {
  const order = makeOrder();
  const supabase = makeDatabase(order);
  let lookups = 0;
  await assert.rejects(cancelLalamoveOrder({ supabase, order }, {
    retrieveOrder: async () => makeProviderOrder(order, ++lookups === 1 ? 'ON_GOING' : 'PICKED_UP'),
    cancelDelivery: async () => { throw new LalamoveApiError('Order can no longer be cancelled', 409); },
  }), { status: 409 });
  assert.equal(lookups, 2);
  assert.deepEqual(supabase.row, order);
  assert.equal(supabase.writes.length, 0);
});

for (const followUp of ['ASSIGNING_DRIVER', 'lookup-fails', 'mismatched-order']) {
  test(`an uncertain cancellation with ${followUp} reconciliation remains unconfirmed and preserves local state`, async () => {
    const order = makeOrder();
    const supabase = makeDatabase(order);
    let lookups = 0;
    await assert.rejects(cancelLalamoveOrder({ supabase, order }, {
      async retrieveOrder() {
        if (++lookups === 1) return makeProviderOrder(order, 'ASSIGNING_DRIVER');
        if (followUp === 'lookup-fails') throw new LalamoveApiError('Status lookup failed', 502);
        if (followUp === 'mismatched-order') return { orderId: 'different-provider-order', status: 'CANCELED' };
        return makeProviderOrder(order, followUp);
      },
      async cancelDelivery() {
        const error = new LalamoveApiError('Cancellation confirmation was not received', 502);
        error.cancellationUncertain = true;
        throw error;
      },
    }), (error) => {
      assert.ok([409, 502].includes(error.status));
      assert.match(error.message, /cancel|confirm|refresh/i);
      return true;
    });
    assert.equal(lookups, 2);
    assert.deepEqual(supabase.row, order);
    assert.equal(supabase.writes.length, 0);
  });
}

for (const failure of ['database-error', 'booking-reference-changed']) {
  test(`a confirmed provider cancellation with ${failure} gives explicit recovery instructions`, async () => {
    const order = makeOrder();
    const supabase = makeDatabase(order, {
      saveError: failure === 'database-error' ? new Error('Database is unavailable') : null,
    });
    let cancellations = 0;
    await assert.rejects(cancelLalamoveOrder({ supabase, order }, {
      retrieveOrder: async () => makeProviderOrder(order, 'ASSIGNING_DRIVER'),
      async cancelDelivery() {
        cancellations += 1;
        if (failure === 'booking-reference-changed') supabase.row.lalamove_order_id = 'new-booking-reference';
      },
    }), (error) => {
      assert.match(error.message, /cancelled|canceled/i);
      assert.match(error.message, /could not be saved/i);
      assert.match(error.message, /Refresh Tracking/i);
      return true;
    });
    assert.equal(cancellations, 1);
    assert.equal(supabase.row.lalamove_status, order.lalamove_status);
    assert.equal(supabase.row.order_status, order.order_status);
    assert.equal(supabase.writes.length, 1);
    if (failure === 'booking-reference-changed') assert.equal(supabase.row.lalamove_order_id, 'new-booking-reference');
  });
}

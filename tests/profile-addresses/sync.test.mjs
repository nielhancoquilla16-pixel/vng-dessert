import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCustomerAddressValidationError,
  normalizeCustomerAddressInput,
  syncProfileDefaultAddress,
} from '../../dessert-ai-system/server/lib/customerAddresses.js';

const makeFixture = (initialRows = [], fail = () => false) => {
  const rows = structuredClone(initialRows);
  const operations = [];
  let nextId = 1;
  let failed = false;

  const database = {
    from(table) {
      assert.equal(table, 'customer_addresses');
      let action = 'select';
      let payload;
      let single = false;
      let execution;
      const filters = [];
      const query = {
        select() { return query; },
        insert(value) { action = 'insert'; payload = value; return query; },
        update(value) { action = 'update'; payload = value; return query; },
        delete() { action = 'delete'; return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        neq(key, value) { filters.push((row) => row[key] !== value); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        order() { return query; },
        limit() { return query; },
        single() { single = true; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          execution ||= Promise.resolve().then(() => {
            const selected = rows.filter((row) => filters.every((matches) => matches(row)));
            const operation = { action, payload, selected: structuredClone(selected) };
            operations.push(operation);
            if (!failed && fail(operation)) {
              failed = true;
              return { data: null, error: new Error(`Injected ${action} failure`) };
            }

            let affected = selected;
            if (action === 'insert') {
              affected = (Array.isArray(payload) ? payload : [payload]).map((entry) => ({
                id: `new-address-${nextId++}`,
                latitude: null,
                longitude: null,
                ...entry,
              }));
            } else if (action === 'update') {
              affected = selected.map((row) => ({ ...row, ...payload }));
            }

            if (action === 'insert' || action === 'update') {
              const changedIds = new Set(affected.map((row) => row.id));
              const candidateRows = [...rows.filter((row) => !changedIds.has(row.id)), ...affected];
              const defaults = candidateRows.filter((row) => row.is_default).map((row) => row.user_id);
              if (new Set(defaults).size !== defaults.length) {
                return { data: null, error: new Error('Unique default constraint violated') };
              }
              for (const row of affected) {
                for (const key of ['user_id', 'label', 'recipient_name', 'phone_number', 'formatted_address']) {
                  assert.notEqual(row[key], null, `${key} must not be null`);
                  assert.notEqual(row[key], undefined, `${key} must be present`);
                }
              }
              rows.splice(0, rows.length, ...candidateRows);
            } else if (action === 'delete') {
              const selectedIds = new Set(selected.map((row) => row.id));
              rows.splice(0, rows.length, ...rows.filter((row) => !selectedIds.has(row.id)));
            }

            return { data: structuredClone(single ? affected[0] || null : affected), error: null };
          });
          return execution.then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { database, rows, operations };
};

const profile = (updates = {}) => ({
  id: 'customer-1',
  role: 'customer',
  username: 'maria',
  full_name: 'Maria Santos',
  phone_number: '09123456789',
  address: '1359 Sample Street',
  ...updates,
});

const saved = (updates = {}) => ({
  id: 'previous-address',
  user_id: 'customer-1',
  label: 'Work',
  recipient_name: 'Maria Santos',
  phone_number: '09123456789',
  street_address: '15 Original Street',
  barangay: 'Original Barangay',
  city: 'Las Pinas',
  province: 'Metro Manila',
  formatted_address: '15 Original Street, Las Pinas',
  place_id: 'original-location',
  latitude: 14.45,
  longitude: 120.98,
  is_default: true,
  ...updates,
});

test('new free-text address becomes default without losing the previous saved address', async () => {
  const previous = saved();
  const otherCustomer = saved({ id: 'other-address', user_id: 'customer-2' });
  const { database, rows } = makeFixture([previous, otherCustomer]);

  const result = await syncProfileDefaultAddress(database, profile({ address: '  1359 Sample Street  ' }));

  assert.equal(rows.length, 3);
  assert.equal(result.user_id, 'customer-1');
  assert.equal(result.label, 'Home');
  assert.equal(result.formatted_address, '1359 Sample Street');
  assert.equal(result.street_address, '1359 Sample Street');
  assert.equal(result.recipient_name, 'Maria Santos');
  assert.equal(result.phone_number, '09123456789');
  assert.equal(result.is_default, true);
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
  assert.ok(!result.city && !result.province && !result.place_id);
  assert.deepEqual(rows.find((row) => row.id === previous.id), { ...previous, is_default: false });
  assert.deepEqual(rows.find((row) => row.id === otherCustomer.id), otherCustomer);
});

test('matching ignores surrounding space, repeated whitespace, and case while preserving the pin', async () => {
  const existing = saved({ id: 'matching-address', formatted_address: '1359 SAMPLE  Street', is_default: false });
  const { database, rows } = makeFixture([saved(), existing]);

  const result = await syncProfileDefaultAddress(database, profile({ address: ' 1359 sample\nStreet ' }));

  assert.equal(result.id, existing.id);
  assert.equal(rows.length, 2);
  for (const key of ['label', 'street_address', 'barangay', 'city', 'province', 'place_id', 'latitude', 'longitude']) {
    assert.equal(result[key], existing[key], `${key} should be preserved`);
  }
  assert.equal(result.is_default, true);
  assert.equal(rows.find((row) => row.id === 'previous-address').is_default, false);
});

test('saving the same address again reuses the same saved entry', async () => {
  const { database, rows } = makeFixture();
  const first = await syncProfileDefaultAddress(database, profile());
  const repeated = await syncProfileDefaultAddress(database, profile({ address: ' 1359 SAMPLE Street ' }));

  assert.equal(repeated.id, first.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].is_default, true);
});

test('an identical address owned by another customer is neither reused nor modified', async () => {
  const other = saved({ user_id: 'customer-2', formatted_address: '1359 Sample Street' });
  const { database, rows } = makeFixture([other]);
  const result = await syncProfileDefaultAddress(database, profile());

  assert.notEqual(result.id, other.id);
  assert.equal(result.user_id, 'customer-1');
  assert.deepEqual(rows.find((row) => row.id === other.id), other);
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
});

test('blank addresses and non-customer profiles do not change saved addresses', async () => {
  const previous = saved();
  const { database, rows, operations } = makeFixture([previous]);
  for (const candidate of [profile({ address: ' \n ' }), profile({ address: null }), profile({ role: 'staff' }), profile({ role: 'admin' })]) {
    assert.equal(await syncProfileDefaultAddress(database, candidate), null);
  }
  assert.deepEqual(rows, [previous]);
  assert.equal(operations.length, 0);
});

test('free-text saves allow missing phone and use available recipient fallback', async () => {
  for (const [updates, recipient] of [
    [{ full_name: '', phone_number: null }, 'maria'],
    [{ full_name: null, username: null, phone_number: '' }, 'Customer'],
  ]) {
    const { database } = makeFixture();
    const result = await syncProfileDefaultAddress(database, profile(updates));
    assert.equal(result.recipient_name, recipient);
    assert.equal(result.phone_number, '');
    assert.equal(result.is_default, true);
  }
});

test('failed insert leaves the existing default intact and rejects the save', async () => {
  const previous = saved();
  const { database, rows } = makeFixture([previous], ({ action }) => action === 'insert');
  await assert.rejects(syncProfileDefaultAddress(database, profile()), /Injected insert failure/);
  assert.deepEqual(rows, [previous]);
});

test('failed promotion restores the previous default and removes the new non-default entry', async () => {
  const previous = saved();
  const { database, rows } = makeFixture([previous], ({ action, payload }) => action === 'update' && payload.is_default === true);
  await assert.rejects(syncProfileDefaultAddress(database, profile()), /Injected update failure/);
  assert.deepEqual(rows, [previous]);
});

test('failed promotion of an existing match restores the old default without deleting either address', async () => {
  const previous = saved();
  const existing = saved({ id: 'matching-address', formatted_address: '1359 Sample Street', is_default: false });
  const { database, rows } = makeFixture([previous, existing], ({ action, payload }) => action === 'update' && payload.is_default === true);
  await assert.rejects(syncProfileDefaultAddress(database, profile()), /Injected update failure/);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find((row) => row.id === previous.id), previous);
  assert.equal(rows.find((row) => row.id === existing.id).is_default, false);
});

test('failed lookup returns an error without writing addresses', async () => {
  const previous = saved();
  const { database, rows, operations } = makeFixture([previous], ({ action }) => action === 'select');
  await assert.rejects(syncProfileDefaultAddress(database, profile()), /Injected select failure/);
  assert.deepEqual(rows, [previous]);
  assert.equal(operations.length, 1);
});

test('ordinary address validation still requires structured fields and a real pin', () => {
  const complete = normalizeCustomerAddressInput({
    recipientName: 'Maria Santos', phoneNumber: '09123456789',
    streetAddress: '1359 Sample Street', city: 'Las Pinas', province: 'Metro Manila',
    formattedAddress: '1359 Sample Street, Las Pinas, Metro Manila',
    latitude: 14.45, longitude: 120.98,
  });
  assert.equal(getCustomerAddressValidationError(complete), '');
  assert.match(getCustomerAddressValidationError({ ...complete, city: null }), /city\/municipality/);
  assert.match(getCustomerAddressValidationError({ ...complete, latitude: null, longitude: null }), /map/);
  assert.match(getCustomerAddressValidationError({ ...complete, latitude: 0, longitude: 0 }), /map/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expireProducts,
  getCustomerProducts,
  getNextProductExpiryDelay,
  isProductExpired,
} from '../../frontend/src/utils/customerProducts.js';

const expiry = Date.parse('2026-10-04T14:00:00+08:00');
const product = (id, overrides = {}) => ({
  id, type: 'product', availability: 'available', stock: 5,
  expirationAt: new Date(expiry).toISOString(), ...overrides,
});

test('products stay visible until the exact expiry instant, regardless of stale API status', () => {
  const dessert = product('flan', { expiryStatus: 'fresh' });
  assert.equal(isProductExpired(dessert, expiry - 1), false);
  assert.deepEqual(getCustomerProducts([dessert], expiry - 1), [dessert]);
  assert.equal(isProductExpired(dessert, expiry), true);
  assert.deepEqual(getCustomerProducts([dessert], expiry), []);
});

test('expiry needs no creation date and supports database fields and Manila date-only fallback', () => {
  assert.equal(isProductExpired({ expiration_at: '2026-10-04T14:00:00+08:00' }, expiry), true);
  const cutoff = Date.parse('2026-10-04T23:59:00+08:00');
  const legacy = { expiration_date: '2026-10-04' };
  assert.equal(isProductExpired(legacy, cutoff - 1), false);
  assert.equal(isProductExpired(legacy, cutoff), true);
});

test('explicit expiry and hidden flags exclude products while sold-out and undated products keep their existing behavior', () => {
  const rows = [
    product('fresh'), product('sold-out', { stock: 0, availability: 'out of stock' }),
    product('undated', { expirationAt: '' }),
    product('hidden', { availability: 'hidden' }), product('expired', { availability: 'expired' }),
    product('flag', { isExpired: true }), product('status', { expiryStatus: 'expired' }),
    product('raw-status', { expiry_status: 'expired' }), product('ingredient', { type: 'inventory-batch' }),
  ];
  assert.deepEqual(getCustomerProducts(rows, expiry - 1).map(({ id }) => id), ['fresh', 'sold-out', 'undated']);
});

test('expiry updates purchase guards but keeps staff rows, stock and source objects intact', () => {
  const rows = [product('flan'), product('hidden', { availability: 'hidden' })];
  assert.strictEqual(expireProducts(rows, expiry - 1), rows);
  const updated = expireProducts(rows, expiry);
  assert.equal(updated.length, 2);
  assert.deepEqual(updated.map(({ availability }) => availability), ['expired', 'hidden']);
  assert.ok(updated.every((row) => row.isExpired && row.expiryStatus === 'expired' && row.stock === 5));
  assert.equal(rows[0].availability, 'available');
  assert.strictEqual(expireProducts(updated, expiry + 1), updated);
});

test('expiry timer targets the next future expiry, skips expired rows and bounds long delays', () => {
  const rows = [product('later', { expirationAt: new Date(expiry + 1000).toISOString() }), product('next')];
  assert.equal(getNextProductExpiryDelay(rows, expiry - 500), 501);
  assert.equal(getNextProductExpiryDelay(rows, expiry), 1001);
  assert.equal(getNextProductExpiryDelay(rows, expiry + 1000), null);
  assert.equal(getNextProductExpiryDelay([product('distant')], expiry - 30 * 86400000), 2147483647);
  assert.equal(getNextProductExpiryDelay([{ expirationAt: 'invalid' }, {}], expiry), null);
});

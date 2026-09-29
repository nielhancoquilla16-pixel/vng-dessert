import test from 'node:test';
import assert from 'node:assert/strict';
import { canConfirmPickupOrder } from '../../frontend/src/utils/orderWorkflow.js';

test('a scanned and verified Ready pickup remains confirmable while its QR is valid', () => {
  const expiresAt = '2026-09-29T04:06:00.000Z';
  assert.equal(canConfirmPickupOrder({
    deliveryMethod: 'pickup',
    status: 'ready',
    verificationRequired: true,
    qrUsedAt: '2026-09-29T04:01:00.000Z',
    qrExpiresAt: expiresAt,
  }, Date.parse('2026-09-29T04:02:00.000Z')), true);
});

test('a scanned Confirmed pickup with a pickup alias can be confirmed while its QR is valid', () => {
  assert.equal(canConfirmPickupOrder({
    deliveryMethod: 'pick-up',
    status: 'Confirmed',
    verificationRequired: true,
    verificationMethod: 'qr',
    verifiedAt: '2026-09-29T04:01:00.000Z',
    qrUsedAt: '2026-09-29T04:01:00.000Z',
    qrExpiresAt: '2026-09-29T04:06:00.000Z',
  }, Date.parse('2026-09-29T04:02:00.000Z')), true);
});

test('expired QR credentials cannot confirm a pickup, while manual COD pickup remains available', () => {
  const expiredOrder = {
    deliveryMethod: 'pickup',
    status: 'ready',
    verificationRequired: true,
    qrExpiresAt: '2026-09-29T04:06:00.000Z',
  };
  assert.equal(canConfirmPickupOrder(expiredOrder, Date.parse('2026-09-29T04:06:00.000Z')), false);
  assert.equal(canConfirmPickupOrder({
    deliveryMethod: 'pick-up',
    status: 'confirmed',
    verificationRequired: true,
    verificationMethod: 'qr',
    verifiedAt: '2026-09-29T04:01:00.000Z',
    qrUsedAt: '2026-09-29T04:01:00.000Z',
    qrExpiresAt: '2026-09-29T04:02:00.000Z',
  }, Date.parse('2026-09-29T04:02:00.000Z')), false);
  assert.equal(canConfirmPickupOrder({
    deliveryMethod: 'pickup',
    status: 'confirmed',
    verificationRequired: true,
    verificationMethod: 'order_id',
    qrUsedAt: '2026-09-29T04:01:00.000Z',
    verifiedAt: '2026-09-29T04:01:00.000Z',
    qrExpiresAt: '2026-09-29T04:06:00.000Z',
  }, Date.parse('2026-09-29T04:02:00.000Z')), false);
  assert.equal(canConfirmPickupOrder({
    deliveryMethod: 'pickup',
    status: 'ready',
    verificationRequired: false,
  }), true);
});

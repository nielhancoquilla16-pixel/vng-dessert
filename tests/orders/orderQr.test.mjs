import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canConfirmQrScannedPickup,
  createOrderQrExpiry,
  getOrderQrExpiry,
  isOrderQrExpired,
  ORDER_QR_VALIDITY_MS,
} from '../../dessert-ai-system/server/lib/orderQr.js';

test('new QR and Order ID credentials expire exactly six minutes after generation', () => {
  const generatedAt = '2026-09-29T04:00:00.000Z';
  const expiresAt = createOrderQrExpiry(generatedAt);
  assert.equal(Date.parse(expiresAt) - Date.parse(generatedAt), ORDER_QR_VALIDITY_MS);
  assert.equal(isOrderQrExpired({ qr_expires_at: expiresAt }, Date.parse(expiresAt) - 1), false);
  assert.equal(isOrderQrExpired({ qr_expires_at: expiresAt }, Date.parse(expiresAt)), true);
});

test('legacy QR records derive expiry from their generation timestamp and missing timestamps fail closed', () => {
  const generatedAt = '2026-09-29T04:00:00.000Z';
  assert.equal(
    getOrderQrExpiry({ qr_generated_at: generatedAt }),
    '2026-09-29T04:06:00.000Z',
  );
  assert.equal(isOrderQrExpired({}, Date.parse(generatedAt)), true);
});

test('server permits the scanned Confirmed pickup flow only with a valid consumed QR', () => {
  const order = {
    delivery_method: 'pick-up',
    order_status: 'confirmed',
    verification_required: true,
    verification_method: 'qr',
    verified_at: '2026-09-29T04:01:00.000Z',
    qr_used_at: '2026-09-29T04:01:00.000Z',
    qr_expires_at: '2026-09-29T04:06:00.000Z',
  };

  assert.equal(canConfirmQrScannedPickup(order, Date.parse('2026-09-29T04:02:00.000Z')), true);
  assert.equal(canConfirmQrScannedPickup({ ...order, qr_expires_at: '2026-09-29T04:02:00.000Z' }, Date.parse('2026-09-29T04:02:00.000Z')), false);
  assert.equal(canConfirmQrScannedPickup({ ...order, verification_method: 'manual' }, Date.parse('2026-09-29T04:02:00.000Z')), false);
  assert.equal(canConfirmQrScannedPickup({ ...order, qr_used_at: null }, Date.parse('2026-09-29T04:02:00.000Z')), false);
});

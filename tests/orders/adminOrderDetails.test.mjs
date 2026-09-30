import test from 'node:test';
import assert from 'node:assert/strict';
import { getItemSubtotal, getOrderPaymentSummary } from '../../frontend/src/utils/adminOrderDetails.js';

const lineItems = [{ price: 90, quantity: 1 }, { price: 110, quantity: 2 }];
test('legacy delivery totals preserve the stored charge and derive the delivery fee', () => {
  assert.deepEqual(getOrderPaymentSummary({ lineItems, totalAmount: 360, deliveryMethod: 'delivery' }), {
    subtotal: 310, discount: 0, tax: 0, deliveryFee: 50, total: 360,
  });
});
test('explicit zero amounts and saved discounts and tax are preserved', () => {
  assert.equal(getItemSubtotal({ lineTotal: 0, price: 90, quantity: 1 }), 0);
  assert.deepEqual(getOrderPaymentSummary({ lineItems, discountAmount: 20, taxAmount: 5, deliveryFee: 0, totalAmount: 295 }), {
    subtotal: 310, discount: 20, tax: 5, deliveryFee: 0, total: 295,
  });
});
test('orders without line items retain their recorded total and explicit delivery fee', () => {
  assert.deepEqual(getOrderPaymentSummary({ total: 'PHP 1,050.00', delivery_fee: 50 }), {
    subtotal: 1000, discount: 0, tax: 0, deliveryFee: 50, total: 1050,
  });
});
test('totals fall back to line items only when no recorded total exists', () => {
  assert.equal(getOrderPaymentSummary({ lineItems }).total, 310);
  assert.equal(getOrderPaymentSummary({ lineItems, totalAmount: 0 }).total, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductPricing, getProfitPreview, validateDiscountTiers } from '../../dessert-ai-system/shared/productPricing.js';
import { validateProductPricingPayload, estimateSaleProfit } from '../../dessert-ai-system/server/lib/productFinance.js';
import { mapPreOrder } from '../../dessert-ai-system/server/lib/preOrderUtils.js';
import { enrichItemsFromProducts, normalizeRequestedItems } from '../../dessert-ai-system/server/lib/orderUtils.js';

const product = { id: 'dessert', name: 'Lecheflan', price: 140, discountEnabled: true,
  discountTiers: [{ minQuantity: 5, price: 125 }, { minQuantity: 10, price: 115 }] };

test('saved tiers override legacy offers, apply per product and restore prices below the threshold', () => {
  for (const [quantity, price] of [[1, 140], [4, 140], [5, 125], [9, 125], [10, 115], [12, 115]]) {
    const pricing = getProductPricing(product, quantity);
    assert.equal(pricing.unitPrice, price);
    assert.equal(pricing.lineTotal, price * quantity);
  }
  assert.equal(getProductPricing({ ...product, discountEnabled: false }, 10).unitPrice, 140);
  assert.equal(getProductPricing({ name: 'Lecheflan', price: 100, discount_enabled: null }, 5).unitPrice, 77);
  assert.equal(getProductPricing({ ...product, discountTiers: [{ minQuantity: 5, price: '' }] }, 5).isBulkPrice, false);
});

test('the reference profit, margin, discounted profit and savings are calculated from input values', () => {
  const preview = getProfitPreview({ ...product, costPrice: 80 });
  assert.equal(preview.regularProfit, 60);
  assert.equal(preview.margin, 42.86);
  assert.equal(preview.tiers[0].profitPerUnit, 45);
  assert.equal(preview.tiers[0].estimatedProfit, 225);
  assert.equal(preview.tiers[0].customerSavings, 75);
  assert.equal(preview.belowCost, false);
  assert.equal(getProfitPreview({ ...product, costPrice: 120 }).belowCost, true, 'Also checks advanced tiers');
  assert.equal(getProfitPreview({ ...product, costPrice: '' }), null);
  assert.equal(getProfitPreview({ ...product, costPrice: 0 }).regularProfit, 140);
  assert.equal(getProfitPreview({ price: 0, costPrice: 10 }).margin, null);
});

test('server validation rejects invalid money, quantities and contradictory tier settings', () => {
  const existing = { price: 140, discount_enabled: true, discount_tiers: product.discountTiers };
  for (const body of [
    { price: -1 }, { price: '1.001' }, { cost_price: -1 }, { cost_price: '' }, { price: '1e3' },
    { price: 129.99 }, { price: '140.00' }, { cost_price: 90.05 }, { cost_price: '80.0' },
    { stock_quantity: -1 }, { stock_quantity: 0.5 }, { stock_quantity: '1e2' }, { stock_quantity: 2147483648 },
    { discount_enabled: 'true' }, { discount_enabled: null }, { discount_tiers: null },
    { discount_tiers: [] }, { discount_tiers: [{ minQuantity: 1, price: 125 }] },
    { discount_tiers: [{ minQuantity: 5.5, price: 125 }] },
    { discount_tiers: [{ minQuantity: 5, price: 141 }] },
    { discount_tiers: [{ minQuantity: 5, price: 125.5 }] },
    { discount_tiers: [{ minQuantity: 5, price: 125 }, { minQuantity: 5, price: 120 }] },
    { discount_tiers: [{ minQuantity: 5, price: 125 }, { minQuantity: 10, price: 130 }] },
    { price: 100 },
  ]) assert.throws(() => validateProductPricingPayload(body, existing), error => error.status === 400, JSON.stringify(body));
  assert.deepEqual(validateProductPricingPayload({ price: '140', stockQuantity: '0', costPrice: '80', discountEnabled: false }, existing),
    { price: 140, stock_quantity: 0, cost_price: 80, discount_enabled: false, discount_tiers: [] });
  assert.deepEqual(validateProductPricingPayload({ cost_price: null }), { cost_price: null });
  assert.equal(validateDiscountTiers([{ minQuantity: 10, price: 115 }, { minQuantity: 5, price: 125 }], 140)[0].minQuantity, 5);
});

test('online/POS enrichment and pre-order summaries share configured pricing', () => {
  const row = { id: product.id, product_name: product.name, price: 140, discount_enabled: true, discount_tiers: product.discountTiers };
  const requested = normalizeRequestedItems([{ product_id: row.id, quantity: 2, price: 1 }, { product_id: row.id, quantity: 3, price: 1 }]);
  assert.equal(enrichItemsFromProducts(requested, new Map([[row.id, row]]))[0].price, 125);
  assert.equal(mapPreOrder({ products: row, quantity: 10 }).productPrice, 115);
});

test('profit reporting uses historical charged prices and snapshots, preserves losses and flags unknown costs', () => {
  const items = [{ id: 'sale', price: 125, quantity: 5 }, { id: 'old', price: 140, quantity: 2 }];
  assert.deepEqual(estimateSaleProfit(items, [{ order_item_id: 'sale', unit_cost: 80 }]), { estimatedGrossProfit: 225, uncostedQuantity: 2 });
  assert.deepEqual(estimateSaleProfit([{ id: 'loss', price: 70, quantity: 2 }], [{ order_item_id: 'loss', unit_cost: 80 }]), { estimatedGrossProfit: -20, uncostedQuantity: 0 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductPricing } from '../../dessert-ai-system/shared/productPricing.js';
import { enrichItemsFromProducts, normalizeRequestedItems, mapOrder } from '../../dessert-ai-system/server/lib/orderUtils.js';

const reference = [
  ['Lecheflan', 90, 77], ['Lecheflan Oval', 90, 77], ['Lecheflan Flat Tub Round', 85, 75],
  ['Ube Flan', 105, 95], ['Graham de Leche', 110, 100], ['Graham de Leche Ube', 130, 125],
  ['Ube Halaya', 90, 90], ['Oreo Graham Float', 110, 100],
  ['Yema in a Can', 110, 95], ['Moist Choco Crinkles (12 big pcs)', 140, 130],
  ['Moist Crinkles Trio (12 big pcs)', 140, 125], ['Premium Crinkle Bites Chocolate (450g)', 125, 115],
  ['Premium Crinkle Bites Ube (450g)', 120, 105], ['Premium Crinkle Bites Red Velvet (450g)', 120, 105],
  ['Premium Brownies Overload (8pcs)', 110, 98], ['Leche Flan Cake (Ube 450g)', 100, 95],
  ['Chocolate Revel 8pcs (300g)', 95, 90],
  ['Double Choco Inverse 8pcs (300g)', 95, 90], ['Choco Caramel Bars w Real Cashew (8pcs)', 90, 80],
  ['Leche Flan Cake Choco', 110, 98], ['2 in 1 Revel & Inverse 8pcs (300g)', 145, 130],
  ['Moist Crinkles Trio big 4pcs', 75, 63],
  ['Mango Graham Tiramusu (500ml Tub)', 145, 130],
  ['Moist Crinkles Choco big 6pcs', 85, 65],
];
for (const [name, price, bulk] of reference) {
  test(`${name}: regular price for 1–4, exact bulk price from 5 onwards`, () => {
    for (const quantity of [1, 4, 5, 6, 200]) {
      const result = getProductPricing({ name, price }, quantity);
      const expected = quantity < 5 ? price : bulk;
      assert.equal(result.unitPrice, expected);
      assert.equal(result.lineTotal, expected * quantity);
      assert.equal(result.regularPrice, price);
    }
    assert.equal(getProductPricing({ name, price }, 4).unitPrice, price, 'Dropping below 5 restores the regular price');
  });
}
test('existing catalog names and package labels resolve the same offers', () => {
  for (const [name, price, expected] of [
    ['Lecheflan (330-340g)', 90, 77], ['Letcheflan oval (330-340g)', 90, 77],
    ['Flan Tub Round', 85, 75], ['Ube Flan Original 350g', 105, 95],
    ['Graham De Leche (500ml Tub)', 110, 100], ['Graham De Leche Ube Halaya (650ml Tub)', 130, 125],
    ['Ube Halaya 100% Real Ube (300g)', 100, 90], ['Oreo Graham Float (500ml Tub)', 110, 100],
  ]) assert.equal(getProductPricing({ name, price }, 5).unitPrice, expected, name);
});
test('unspecified products keep their catalog prices; identified offers use the flyer as their source of truth', () => {
  assert.equal(getProductPricing({ name: 'Chocolate Cake', price: 250.5 }, 6).lineTotal, 1503);
  assert.equal(getProductPricing({ name: 'Graham de Leche Choco Mousse', price: 110 }, 5).unitPrice, 110);
  assert.equal(getProductPricing({ name: 'Lecheflan', price: 70 }, 1).unitPrice, 90);
  assert.equal(getProductPricing({ name: 'Lecheflan', price: 70 }, 5).unitPrice, 77);
  assert.equal(getProductPricing({ name: 'Ube Halaya', price: 100 }, 1).unitPrice, 90);
  assert.equal(getProductPricing({ name: '2 in 1 Revel & Inverse 8pcs (300g)', price: 95 }, 5).unitPrice, 130);
});
test('user corrections override the conflicting flyer rows and stale catalog prices', () => {
  assert.equal(getProductPricing({ id: '2744ca3c-1a13-4e05-b902-d6017db76b84', price: 80 }, 4).lineTotal, 340);
  assert.equal(getProductPricing({ id: '2744ca3c-1a13-4e05-b902-d6017db76b84', price: 80 }, 5).lineTotal, 325);
  assert.equal(getProductPricing({ id: 'a3f71afc-033d-4e74-b2bc-80ef11d78f98', price: 63 }, 4).lineTotal, 300);
  assert.equal(getProductPricing({ id: '5bf21980-37c8-4a5b-bebb-e4354119717e', price: 130 }, 5).lineTotal, 650);
});
test('product IDs keep chocolate-cake and Ube-cake offers separate', () => {
  assert.equal(getProductPricing({ id: 'd53a6386-4fd7-4902-8abd-31ba5e82aa22', name: 'Leche Flan Cake (Choco 450g)', price: 100 }, 5).unitPrice, 98);
  assert.equal(getProductPricing({ id: 'eb70735b-8938-4f0c-bd39-92d06dce6110', name: 'Leche Flan Cake (Ube 450g)', price: 100 }, 1).unitPrice, 100);
  assert.equal(getProductPricing({ id: 'eb70735b-8938-4f0c-bd39-92d06dce6110', name: 'Leche Flan Cake (Ube 450g)', price: 100 }, 5).unitPrice, 95);
  assert.equal(getProductPricing({ name: 'PREMIUM Brownles overload', price: 120 }, 5).unitPrice, 98);
  assert.equal(getProductPricing({ name: 'Moist Crinkles Trio (4 big pcs)', price: 75 }, 5).bulkPrice, null, 'Unknown pack labels must not inherit the 12-piece tier');
});
test('server prices combined quantities from live products, ignoring supplied prices and product names', () => {
  const products = new Map([['flan', { id: 'flan', product_name: 'Lecheflan', price: 90 }]]);
  const requested = normalizeRequestedItems([
    { product_id: 'flan', quantity: 2, price: 1, name: 'fake' },
    { product_id: 'flan', quantity: 3, price: 1, name: 'fake' },
  ]);
  const items = enrichItemsFromProducts(requested, products);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 5);
  assert.equal(items[0].price, 77);
  assert.equal(items[0].name, 'Lecheflan');
  const mixed = enrichItemsFromProducts(normalizeRequestedItems([
    { product_id: 'flan', quantity: 3, price: 1 }, { product_id: 'oval', quantity: 2, price: 1 },
  ]), new Map([...products, ['oval', { product_name: 'Lecheflan Oval', price: 90 }]]));
  assert.deepEqual(mixed.map(item => item.price), [90, 90], 'Different products do not combine for eligibility');
});
test('saved order summaries retain the price charged instead of recalculating historical discounts', () => {
  const order = mapOrder({ id: 'old-order', total_price: 450, order_status: 'completed',
    order_items: [{ product_id: 'flan', price: 90, quantity: 5, products: { product_name: 'Lecheflan', price: 120 } }] });
  assert.equal(order.totalAmount, 450);
  assert.equal(order.lineItems[0].price, 90);
  assert.equal(order.lineItems[0].lineTotal, 450);
});

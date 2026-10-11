// Real checkout, payment return, and order UI with isolated account/API fixtures.
// Gateway navigation is intercepted; this test cannot create real payments.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an installed playwright/index.mjs path.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const root = fileURLToPath(new URL('../../frontend/', import.meta.url)).replaceAll('\\', '/');
const hooksId = `${root}__payment-hooks.jsx`;
const entryId = `${root}__payment-fixture.jsx`;
const gatewayUrl = 'https://checkout.paymongo.com/fixture-test';
const hooksSource = `
import { useSyncExternalStore } from 'react';
const listeners = new Set();
let revision = 0;
const changed = () => { revision++; listeners.forEach(fn => fn()); };
const watch = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const useFixture = () => useSyncExternalStore(watch, () => revision);
const noop = async () => {};
const items = [{ id: 'cake', name: 'Test Cake', category: 'Cake', price: 100, quantity: 2 }, { id: 'extra', name: 'Unselected Dessert', category: 'Cake', price: 50, quantity: 1 }];
export const fixture = window.checkoutFixture = { items, orders: [], removed: [], cashOrders: [], failCleanup: false, refresh: changed };
const shop = { openingTime: '00:00', closingTime: '23:59', serverTime: '2026-10-03T04:00:00Z' };
const settings = { shopSettings: shop, isShopSettingsLoading: false, shopSettingsError: '', isShopOpen: true, operatingHoursLabel: 'Open', refreshShopSettings: async () => shop };
export const useShopSettings = () => settings;
const auth = { loggedInCustomer: { id: 'customer', fullName: 'Test Customer', username: 'test', phoneNumber: '09123456789' }, isAuthLoading: false, updateLoggedInCustomer: noop };
export const useAuth = () => auth;
const address = { id: 'saved-address', label: 'Home', recipientName: 'Test Customer', phoneNumber: '09123456789', streetAddress: '10 Example Street', barangay: '', city: 'Las Pinas', province: 'Metro Manila', postalCode: '', placeId: '', formattedAddress: '10 Example Street, Las Pinas, Metro Manila', latitude: 14.45, longitude: 120.97, isDefault: true };
const addresses = { addresses: [address], defaultAddress: address, hasLoadedAddresses: true, isAddressesLoading: false };
export const useCustomerAddresses = () => addresses;
const removeFromCart = async id => { fixture.removed.push(id); fixture.items = fixture.items.filter(item => item.id !== id); changed(); if (fixture.failCleanup) throw new Error('Fixture cart cleanup failure'); };
export const useCart = () => { useFixture(); return { cartItems: fixture.items, removeFromCart, refreshRemoteCart: noop }; };
const products = { validateStockAvailability: () => ({ isAvailable: true }), refreshProducts: noop };
export const useProducts = () => products;
const orders = { isOrdersLoading: false, refreshOrders: noop, addOrder: async input => { fixture.cashOrders.push(input); return input; } };
export const useOrders = () => { useFixture(); return { ...orders, orders: fixture.orders }; };
export const apiRequest = async (url, options) => {
  const response = await fetch('/fixture-api' + url, { ...options, headers: { 'Content-Type': 'application/json' } });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error); error.status = response.status; throw error; }
  return result;
};
`;
const entrySource = `
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Checkout from '/src/pages/Checkout.jsx';
import CheckoutPayMongoReturn from '/src/pages/CheckoutPayMongoReturn.jsx';
import Orders from '/src/pages/Orders.jsx';
import '/__payment-hooks.jsx';
import '/src/index.css';
if (new URLSearchParams(location.search).has('selected')) history.replaceState({ usr: { selectedCartIds: ['cake'] } }, '');
createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><Routes>
  <Route path='/checkout' element={<Checkout />} />
  <Route path='/checkout/paymongo/success' element={<CheckoutPayMongoReturn />} />
  <Route path='/checkout/paymongo/cancel' element={<CheckoutPayMongoReturn mode='cancel' />} />
  <Route path='/orders' element={<Orders />} />
  <Route path='/cart' element={<p>Cart</p>} />
</Routes></BrowserRouter></StrictMode>);
`;
const order = {
  id: 'order-test', orderCode: 'TEST-ORDER', customer: 'Test Customer', status: 'pending',
  paymentMethod: 'online', paymentCheckoutStatus: 'created', deliveryMethod: 'pickup',
  verificationRequired: true, qrPayload: 'TEST-QR', qrExpiresAt: '2020-01-01T00:00:00Z',
  createdAt: '2026-10-03T04:00:00Z', totalAmount: 200,
  lineItems: [{ name: 'Test Cake', quantity: 2, price: 100, lineTotal: 200 }],
  paymentCheckout: { checkoutUrl: gatewayUrl },
};
let vite;
let browser;
const pageErrors = [];
const unexpectedRequests = [];
let scenario;
const resetScenario = () => { scenario = { configured: true, sessions: [], status: 'created', failSession: false, missingUrl: false, reads: 0 }; };
const pass = message => console.log(`PASS ${message}`);
try {
  vite = await createServer({
    root, configFile: path.join(root, 'vite.config.js'),
    cacheDir: path.join(root, '../tmp/payment-vite-cache'),
    optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'react-router-dom', 'lucide-react', '@zxing/library'] },
    server: { host: '127.0.0.1', port: 0, open: false },
    plugins: [{
      name: 'isolated-payment-fixtures', enforce: 'pre',
      resolveId(source) {
        if (source === hooksId || source === entryId || source === `${root}__payment-map.jsx`) return source;
        if (/\/(context\/(AuthContext|CartContext|OrderContext|ProductContext|CustomerAddressesContext|ShopSettingsContext)|lib\/api)(\.jsx?)?$/.test(source) || source === '/__payment-hooks.jsx') return hooksId;
        if (source === '/__payment-fixture.jsx') return entryId;
        if (/\/components\/LocationPinPicker(\.jsx)?$/.test(source)) return `${root}__payment-map.jsx`;
      },
      load(id) {
        if (id === hooksId) return hooksSource;
        if (id === entryId) return entrySource;
        if (id === `${root}__payment-map.jsx`) return 'export default function LocationPinPicker() { return null; }';
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!/^\/(checkout|orders|cart)([/?]|$)/.test(req.url)) return next();
          const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__payment-fixture.jsx"></script></body></html>';
          res.setHeader('Content-Type', 'text/html');
          res.end(await server.transformIndexHtml(req.url, html));
        });
      },
    }],
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext();
  context.setDefaultTimeout(15000);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href === gatewayUrl) return route.fulfill({ contentType: 'text/html', body: `<h1>Test payment gateway</h1><a href="${origin}/checkout/paymongo/success?reference=TEST-REFERENCE">Complete test payment</a>` });
    if (url.origin === 'https://fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.origin !== origin) { unexpectedRequests.push(url.href); return route.abort(); }
    if (!url.pathname.startsWith('/fixture-api')) return route.continue();
    const endpoint = url.pathname.replace('/fixture-api', '');
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (endpoint === '/api/payments/status') {
      await new Promise(resolve => setTimeout(resolve, 120));
      return json({ configured: scenario.configured, paymentMethodTypes: ['gcash', 'card'] });
    }
    if (endpoint === '/api/payments/checkout-sessions') {
      scenario.sessions.push(route.request().postDataJSON());
      if (scenario.failSession) return json({ error: 'Fixture gateway unavailable' }, 503);
      return json({ referenceNumber: 'TEST-REFERENCE', checkoutUrl: scenario.missingUrl ? '' : gatewayUrl }, 201);
    }
    if (endpoint === '/api/payments/checkouts/TEST-REFERENCE/cancel') scenario.status = 'cancelled';
    if (endpoint.startsWith('/api/payments/checkouts/TEST-REFERENCE')) {
      scenario.reads++;
      return json({ referenceNumber: 'TEST-REFERENCE', checkoutUrl: gatewayUrl, status: scenario.status, orderId: order.id, order: { ...order, paymentCheckoutStatus: scenario.status } });
    }
    unexpectedRequests.push(url.href);
    return json({ error: 'Unexpected fixture request' }, 500);
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  const navigations = [];
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  const prepareCheckout = async (deliveryMethod = 'pickup', selected = false) => {
    await page.goto(`${origin}/checkout${selected ? '?selected=1' : ''}`);
    await page.waitForFunction(() => {
      const button = document.querySelector('.place-order-btn');
      return button && !button.disabled;
    });
    await page.locator(`input[name="deliveryMethod"][value="${deliveryMethod}"]`).check();
  };
  const assertNoOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await fs.mkdir(path.join(root, '../tmp/payment-checkout'), { recursive: true });

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const deliveryMethod of ['pickup', 'delivery']) {
      resetScenario();
      await prepareCheckout(deliveryMethod, true);
      assert.equal(await page.locator('input[name="paymentMethod"][value="online"]').isChecked(), true);
      assert.equal(await page.getByRole('button', { name: 'Continue Online Payment', exact: true }).count(), 1);
      assert.equal(await page.getByText('Review QR and Continue').count(), 0);
      await assertNoOverflow();
      if (deliveryMethod === 'pickup') await page.screenshot({ path: path.join(root, `../tmp/payment-checkout/checkout-${width}.png`), fullPage: true });
      navigations.length = 0;
      await page.getByRole('button', { name: 'Continue Online Payment', exact: true }).click();
      await page.waitForURL(gatewayUrl);
      assert.equal(scenario.sessions.length, 1);
      assert.equal(scenario.sessions[0].paymentMethod, 'online');
      assert.equal(scenario.sessions[0].deliveryMethod, deliveryMethod);
      assert.deepEqual(scenario.sessions[0].lineItems.map(item => item.productId), ['cake']);
      assert.deepEqual(navigations, [gatewayUrl]);
      assert.equal(scenario.reads, 0);
      scenario.status = 'fulfilled';
      await page.getByRole('link', { name: 'Complete test payment' }).click();
      await page.getByRole('heading', { name: 'Payment Confirmed' }).waitFor();
      assert.equal(await page.getByRole('link', { name: 'Continue Online Payment', exact: true }).count(), 0);
      await page.getByRole('region', { name: 'Printable receipt' }).waitFor();
      await assertNoOverflow();
      pass(`${width}px ${deliveryMethod}: one click opens gateway without Orders/QR; paid return shows confirmation`);
    }
  }

  resetScenario();
  await prepareCheckout();
  await page.evaluate(() => {
    const form = document.querySelector('#customer-checkout-form');
    form.requestSubmit();
    form.requestSubmit();
  });
  await page.waitForURL(gatewayUrl);
  assert.equal(scenario.sessions.length, 1);
  pass('Repeated synchronous submissions create only one checkout');

  resetScenario();
  scenario.failSession = true;
  await prepareCheckout();
  await page.getByRole('button', { name: 'Continue Online Payment' }).click();
  await page.getByText('Unable to place the order right now.', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/checkout');
  assert.deepEqual(await page.evaluate(() => window.checkoutFixture.removed), []);
  scenario.failSession = false;
  await page.evaluate(() => { window.checkoutFixture.failCleanup = true; });
  await page.getByRole('button', { name: 'Continue Online Payment' }).click();
  await page.waitForURL(gatewayUrl);
  pass('Gateway error preserves cart for retry; cart cleanup failure cannot interrupt payment');

  resetScenario();
  scenario.missingUrl = true;
  await prepareCheckout();
  await page.getByRole('button', { name: 'Continue Online Payment' }).click();
  await page.getByText('Unable to place the order right now.', { exact: true }).waitFor();
  assert.equal(await page.getByText('PayMongo did not return a checkout URL.').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.checkoutFixture.removed), []);
  pass('Missing gateway URL stays on checkout with a clear error');

  for (const deliveryMethod of ['pickup', 'delivery']) {
    resetScenario();
    await prepareCheckout(deliveryMethod, true);
    await page.locator('input[name="paymentMethod"][value="cash"]').check();
    await page.getByRole('button', { name: 'Place Order', exact: true }).click();
    await page.waitForURL(`${origin}/orders`);
    assert.equal(scenario.sessions.length, 0);
    assert.deepEqual(await page.evaluate(() => window.checkoutFixture.removed), ['cake']);
    assert.deepEqual(await page.evaluate(() => window.checkoutFixture.items.map(item => item.id)), ['extra']);
    assert.equal(await page.evaluate(() => window.checkoutFixture.cashOrders[0].paymentMethod), 'cash');
    pass(`${deliveryMethod}: cash keeps existing Orders flow and unselected cart items`);
  }

  resetScenario();
  scenario.configured = false;
  await prepareCheckout();
  assert.equal(await page.locator('input[name="paymentMethod"][value="cash"]').isChecked(), true);
  assert.equal(await page.locator('input[name="paymentMethod"][value="online"]').isDisabled(), true);
  pass('Unavailable online payment retains the existing cash fallback');

  resetScenario();
  await page.goto(`${origin}/checkout/paymongo/success?reference=TEST-REFERENCE`);
  await page.locator('.checkout-return-summary .checkout-return-status').getByText('Waiting for online payment', { exact: true }).waitFor();
  await page.getByText('Complete your online payment to continue processing this order.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Continue Online Payment', exact: true }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: 'Payment Confirmed' }).count(), 0);
  scenario.status = 'paid';
  await page.getByRole('button', { name: 'Refresh Status' }).click();
  await page.getByRole('heading', { name: 'Payment Confirmed' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Continue Online Payment' }).count(), 0);
  pass('Unconfirmed return stays pending; refresh confirms payment and removes the resume action');

  resetScenario();
  await page.goto(`${origin}/checkout/paymongo/cancel?reference=TEST-REFERENCE`);
  await page.getByRole('heading', { name: 'Payment Cancelled' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Continue Online Payment' }).count(), 0);
  pass('Cancelled payment never shows confirmation or a payment button');

  await page.goto(`${origin}/orders`);
  await page.waitForFunction(() => Boolean(window.checkoutFixture));
  for (const verificationRequired of [true, false]) {
    await page.evaluate(nextOrder => { window.checkoutFixture.orders = [nextOrder]; window.checkoutFixture.refresh(); }, { ...order, verificationRequired });
    await page.getByText('Waiting for online payment', { exact: true }).waitFor();
    await page.getByText('Complete your online payment to continue processing this order.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Continue Online Payment', exact: true }).count(), 1);
    assert.equal(await page.locator('.order-qr-panel a').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Continue Online Payment' }).getAttribute('href'), gatewayUrl);
    await assertNoOverflow();
  }
  await page.screenshot({ path: path.join(root, '../tmp/payment-checkout/orders-mobile.png'), fullPage: true });
  pass('Saved pending order has one payment action independent of expired or absent QR');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(unexpectedRequests, []);
} finally {
  await browser?.close();
  await vite?.close();
}

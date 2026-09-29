// node --experimental-test-module-mocks tests/shop-hours/midnight-browser.mjs
// Uses real route handlers and UI, with isolated storage and an injected API clock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mock } from 'node:test';
import { pathToFileURL, fileURLToPath } from 'node:url';
import express from '../../dessert-ai-system/node_modules/express/index.js';
import { createServer as createVite } from '../../frontend/node_modules/vite/dist/node/index.js';
import * as realSettings from '../../dessert-ai-system/server/lib/shopSettings.js';
import * as realSupabase from '../../dessert-ai-system/server/lib/supabaseAdmin.js';
import { createPurchaseFixture } from './purchase-fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const { database, rows } = createPurchaseFixture();
let virtualTime = Date.parse('2026-09-07T22:30:00+08:00');
const now = () => new Date(virtualTime);
mock.module('../../dessert-ai-system/server/lib/supabaseAdmin.js', { namedExports: { ...realSupabase, getSupabaseAdmin: () => database } });
mock.module('../../dessert-ai-system/server/lib/shopSettings.js', { namedExports: {
  ...realSettings,
  assertShopOpen: (client) => realSettings.assertShopOpen(client, now()),
} });
const { createShopSettingsRouter } = await import('../../dessert-ai-system/server/routes/shopSettings.js');
const { createShopSettingsEvents } = await import('../../dessert-ai-system/server/lib/shopSettingsEvents.js');
const { default: cartsRouter } = await import('../../dessert-ai-system/server/routes/carts.js');
const { default: ordersRouter } = await import('../../dessert-ai-system/server/routes/orders.js');
const events = createShopSettingsEvents({ loadSettings: () => realSettings.getShopSettings(database), now, pollIntervalMs: 1000 });
const app = express();
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use('/api/shop-settings', createShopSettingsRouter({ getSupabase: () => database, now, events }));
app.use('/api/carts', cartsRouter);
app.get('/api/orders/best-sellers', (req, res) => res.json({ items: [] }));
app.use('/api/orders', ordersRouter);
app.get('/api/products', (req, res) => res.json(rows.products.filter((product) => product.availability !== 'hidden').map((product) => ({
  ...product, productName: product.product_name, stockQuantity: product.stock_quantity, imageUrl: product.image_url,
  expiryStatus: product.availability === 'expired' ? 'expired' : 'fresh',
}))));
app.all('/api/profiles/me', (req, res) => {
  const profile = rows.profiles.find((item) => item.id === req.headers.authorization?.replace('Bearer ', ''));
  if (req.method === 'PUT') Object.assign(profile, req.body);
  res.json(profile);
});
app.get('/api/payments/status', (req, res) => res.json({ configured: false, paymentMethodTypes: [] }));
app.get('/health', (req, res) => res.json({ status: 'ready' }));
app.get('/api/*', (req, res) => res.json([]));
app.get('/rest/v1/*', (req, res) => res.json([]));
app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
  res.status(error.status || 500).json({ error: error.message, code: error.code });
});
const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const apiOrigin = `http://127.0.0.1:${server.address().port}`;
const artifactDir = path.join(root, 'tmp/shop-hours-midnight');
fs.mkdirSync(artifactDir, { recursive: true });
const checks = [];
const passed = (label) => { checks.push(label); console.log(`PASS ${label}`); };
const eventually = async (check, label) => {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch { /* wait for UI state */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${label}`);
};
const request = (route, body) => fetch(`${apiOrigin}${route}`, {
  method: 'POST', headers: { Authorization: 'Bearer test-customer', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const orderBody = (id = 'available', quantity = 1) => ({ items: [{ product_id: id, quantity }], delivery_method: 'pickup', payment_method: 'cash', customer_name: 'Test customer' });
let vite;
let adminBrowser;
let customerBrowser;
let pages = [];
try {
  vite = await createVite({ root: path.join(root, 'frontend'), configFile: path.join(root, 'frontend/vite.config.js'), server: { host: '127.0.0.1', port: 0, open: false }, define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiOrigin),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(apiOrigin),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-anon-key'),
    'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(''),
  } });
  await vite.listen();
  const uiOrigin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  adminBrowser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  customerBrowser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_EXECUTABLE || process.env.CHROMIUM_EXECUTABLE });
  const adminContext = await adminBrowser.newContext({ viewport: { width: 1440, height: 1000 } });
  const customerContext = await customerBrowser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
  for (const [context, role] of [[adminContext, 'admin'], [customerContext, 'customer']]) {
    await context.addInitScript((role) => {
      if (location.protocol !== 'http:') return;
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: `test-${role}`, refresh_token: 'test-refresh', expires_at: 4102444800, token_type: 'bearer', user: { id: `test-${role}`, email: `${role}@example.test`, aud: 'authenticated' } }));
    }, role);
  }
  const admin = await adminContext.newPage();
  const customer = await customerContext.newPage();
  const cart = await customerContext.newPage();
  pages = [admin, customer, cart];
  const pageErrors = [];
  pages.forEach((page) => { page.setDefaultTimeout(15000); page.on('pageerror', (error) => pageErrors.push(error.message)); });
  await Promise.all([admin.goto(`${uiOrigin}/admin/dashboard`), customer.goto(`${uiOrigin}/products`)]);
  const closing = admin.getByLabel('Closing Time');
  const status = customer.locator('.shop-hours-tag');
  const availableCard = customer.locator('.shop-product-card').filter({ has: customer.getByRole('heading', { name: 'Fresh Leche Flan', exact: true }) });
  const add = availableCard.locator('.shop-product-actions button').first();
  await closing.waitFor();
  await add.waitFor();
  await eventually(async () => (await status.innerText()) === 'Currently closed', '10:30 PM closed');
  assert.equal(await add.isDisabled(), true);
  assert.equal((await request('/api/orders', orderBody())).status, 403);
  assert.equal((await request('/api/carts/mine/items', { product_id: 'available', quantity: 1 })).status, 403);
  passed('At 10:30 PM Manila, old 10 PM closing blocks UI and actual cart/order endpoints');
  const save = async (time) => {
    await closing.fill(time);
    await admin.getByRole('button', { name: 'Save Settings' }).click();
    await admin.getByText('Shop settings updated.', { exact: true }).waitFor();
    assert.equal(rows.shop_settings[0].closing_time, time);
  };
  await save('00:00');
  await eventually(() => add.isEnabled(), 'midnight extension reopens original tab');
  assert.match(await status.innerText(), /12:00 AM/);
  assert.match(await customer.locator('.products-heading').innerText(), /next day/);
  assert.equal(await customer.getByRole('button', { name: 'Out of stock: Sold Out Dessert', exact: true }).isDisabled(), true);
  assert.equal(await customer.getByRole('button', { name: 'Expired: Expired Dessert', exact: true }).isDisabled(), true);
  await customer.evaluate(() => window.scrollTo(0, 0));
  await customer.screenshot({ path: path.join(artifactDir, 'products-reopened-390.png') });
  await add.click();
  await eventually(() => Promise.resolve(rows.cart_items.length === 1), 'cart item persisted by actual route');
  assert.equal(rows.cart_items[0].quantity, 1);
  passed('Admin save broadcasts midnight to the original customer tab; eligible Add to Cart persists without refresh');
  // Navigate to the saved cart after adding; the original Products tab stays open.
  await cart.goto(`${uiOrigin}/cart`);
  await cart.getByRole('button', { name: 'Proceed to Checkout' }).click();
  await cart.waitForURL('**/checkout');
  await cart.locator('input[name="deliveryMethod"][value="pickup"]').check();
  await cart.getByLabel('Full Name', { exact: true }).fill('Test customer');
  await cart.getByLabel('Contact Number', { exact: true }).fill('09123456789');
  const checkoutResponse = cart.waitForResponse((response) => response.url() === `${apiOrigin}/api/orders` && response.request().method() === 'POST');
  await cart.locator('.place-order-btn').click();
  const createdResponse = await checkoutResponse;
  assert.equal(createdResponse.status(), 201, await createdResponse.text());
  await cart.waitForURL('**/orders');
  assert.equal(rows.orders.length, 1);
  assert.equal(rows.orders[0].total_price, 100.5);
  await cart.getByText('Fresh Leche Flan', { exact: true }).first().waitFor();
  await cart.screenshot({ path: path.join(artifactDir, 'ordered-after-extension-390.png') });
  passed('Actual checkout route saves the order and customer reaches Orders after the midnight extension');
  for (const id of ['sold-out', 'expired', 'hidden']) {
    assert.equal((await request('/api/orders', orderBody(id))).status, 409, id);
    assert.equal((await request('/api/carts/mine/items', { product_id: id, quantity: 1 })).status, 409, id);
  }
  assert.equal((await request('/api/orders', orderBody('available', 100))).status, 409);
  assert.equal(rows.orders.length, 1);
  passed('Real backend stock, expiry, hidden-product and quantity checks still block ineligible orders');
  // Leave a saved cart and its checkout open while the admin changes the hours.
  assert.equal((await request('/api/carts/mine/items', { product_id: 'available', quantity: 1 })).status, 201);
  const cartReview = await customerContext.newPage();
  const checkoutReview = await customerContext.newPage();
  for (const page of [cartReview, checkoutReview]) {
    pages.push(page);
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => pageErrors.push(error.message));
  }
  await Promise.all([cartReview.goto(`${uiOrigin}/cart`), checkoutReview.goto(`${uiOrigin}/cart`)]);
  await checkoutReview.getByRole('button', { name: 'Proceed to Checkout' }).click();
  await checkoutReview.waitForURL('**/checkout');
  const proceed = cartReview.getByRole('button', { name: 'Proceed to Checkout' });
  const place = checkoutReview.locator('.place-order-btn');
  await eventually(() => place.isEnabled(), 'second checkout ready');
  await save('21:00');
  await eventually(() => add.isDisabled(), 'shortening closes original tab');
  await eventually(() => proceed.isDisabled(), 'saved cart closes after shortening');
  await eventually(() => place.isDisabled(), 'already-open checkout closes after shortening');
  assert.match(await cartReview.locator('.cart-page-heading').innerText(), /9:00 PM/);
  assert.match(await checkoutReview.locator('.checkout-page-heading').innerText(), /9:00 PM/);
  assert.equal((await request('/api/orders', orderBody())).status, 403);
  assert.equal(rows.orders.length, 1);
  assert.equal(rows.cart_items.length, 1);
  await save('00:00');
  await eventually(() => add.isEnabled(), 'reopen before midnight boundary');
  await eventually(() => proceed.isEnabled(), 'saved cart reopens after extension');
  await eventually(() => place.isEnabled(), 'already-open checkout reopens after extension');
  assert.match(await cartReview.locator('.cart-page-heading').innerText(), /12:00 AM \(next day\)/);
  assert.match(await checkoutReview.locator('.checkout-page-heading').innerText(), /12:00 AM \(next day\)/);
  passed('Products, saved Cart and open Checkout close and reopen together; existing order and cart remain intact');
  const orderingPages = [customer, cartReview, checkoutReview];
  await Promise.all(orderingPages.map((page) => page.clock.install()));
  virtualTime = Date.parse('2026-09-07T23:59:59+08:00');
  await Promise.all(orderingPages.map(async (page) => {
    const refreshed = page.waitForResponse((response) => response.url() === `${apiOrigin}/api/shop-settings`);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal((await (await refreshed).json()).serverTime, now().toISOString());
  }));
  await new Promise((resolve) => setTimeout(resolve, 200));
  await Promise.all(orderingPages.map((page) => page.clock.runFor(1500)));
  await eventually(() => add.isDisabled(), 'automatic midnight close');
  await eventually(() => proceed.isDisabled(), 'automatic midnight cart close');
  await eventually(() => place.isDisabled(), 'automatic midnight checkout close');
  assert.equal(await status.innerText(), 'Currently closed');
  virtualTime = Date.parse('2026-09-08T00:00:00+08:00');
  assert.equal((await request('/api/orders', orderBody())).status, 403);
  assert.equal((await request('/api/carts/mine/items', { product_id: 'available', quantity: 1 })).status, 403);
  virtualTime = Date.parse('2026-09-08T07:59:59+08:00');
  assert.equal((await request('/api/orders', orderBody())).status, 403);
  assert.equal(rows.orders.length, 1);
  await customer.evaluate(() => window.scrollTo(0, 0));
  await customer.screenshot({ path: path.join(artifactDir, 'products-midnight-closed-390.png') });
  passed('Products, Cart and Checkout left open close at midnight; stale direct requests stay blocked until opening');
  virtualTime = Date.parse('2026-09-08T08:00:00+08:00');
  assert.equal((await request('/api/carts/mine/items', { product_id: 'available', quantity: 1 })).status, 201);
  assert.equal(rows.orders.length, 1);
  passed('Next-day 8 AM opening permits ordering again; previously placed order remains intact');
  assert.deepEqual(pageErrors, []);
  await admin.locator('.shop-settings-panel').screenshot({ path: path.join(artifactDir, 'admin-midnight-settings.png') });
  fs.writeFileSync(path.join(artifactDir, 'results.json'), JSON.stringify({ browsers: [await adminBrowser.version(), await customerBrowser.version()], checks, database: 'isolated adapter; actual route handlers; no live database or payment gateway' }, null, 2));
  console.log(`${checks.length} midnight purchase-flow checks passed.`);
} catch (error) {
  for (const page of pages) console.log('PAGE STATE', page.url(), (await page.locator('body').innerText()).slice(-2200));
  throw error;
} finally {
  await customerBrowser?.close();
  await adminBrowser?.close();
  await vite?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  mock.restoreAll();
}

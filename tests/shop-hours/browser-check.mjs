// Runs the real UI, settings API router and event stream against isolated fixtures.
// No production credentials, orders, or database writes are used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import express from '../../dessert-ai-system/node_modules/express/index.js';
import { createServer as createVite } from '../../frontend/node_modules/vite/dist/node/index.js';
import { createShopSettingsRouter } from '../../dessert-ai-system/server/routes/shopSettings.js';
import { createShopSettingsEvents } from '../../dessert-ai-system/server/lib/shopSettingsEvents.js';
import { getShopSettings } from '../../dessert-ai-system/server/lib/shopSettings.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) throw new Error('Set PLAYWRIGHT_MODULE to the installed playwright/index.mjs path.');
const { chromium } = await import(pathToFileURL(path.resolve(playwrightModule)).href);
const results = [];
const passed = (name) => { results.push(name); console.log(`PASS ${name}`); };
const eventually = async (fn, label, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await fn()) return; } catch { /* wait for async state */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${label}`);
};

let virtualTime = Date.parse('2026-09-07T13:00:00Z'); // 9 PM Manila; default 8 PM close.
const now = () => new Date(virtualTime);
let revision = 0;
let row = { id: 1, shop_name: 'V & G test shop', address: 'Test shop, Las Pinas', phone_number: '09123456789', opening_time: '08:00:00', closing_time: '20:00:00', preorder_time_slots: [], updated_at: '2026-09-07T00:00:00.000Z' };
let failSave = false;
let failRead = false;
let saveDelay = 0;
const database = {
  from(table) {
    assert.equal(table, 'shop_settings');
    return {
      select() { return { eq() { return { maybeSingle: async () => ({ data: failRead ? null : { ...row }, error: failRead ? new Error('Fixture read failure') : null }) }; } }; },
      upsert(updates) { return { select() { return { single: async () => {
        await new Promise((resolve) => setTimeout(resolve, saveDelay));
        if (failSave) return { data: null, error: new Error('Fixture save failure') };
        row = { ...row, ...updates, updated_at: new Date(Date.parse('2026-09-07T00:00:00Z') + ++revision * 1000).toISOString() };
        return { data: { ...row }, error: null };
      } }; } }; },
    };
  },
};
const events = createShopSettingsEvents({ loadSettings: () => getShopSettings(database), now, pollIntervalMs: 1000 });
const app = express();
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use('/api/shop-settings', createShopSettingsRouter({
  getSupabase: () => database, events, now,
  authenticate: (req, res, next) => req.headers.authorization ? next() : res.sendStatus(401),
  authorizeAdmin: (req, res, next) => req.headers.authorization === 'Bearer test-admin' ? next() : res.sendStatus(403),
}));
const profiles = {
  admin: { id: 'test-admin', role: 'admin', fullName: 'Test Admin', username: 'admin', email: 'admin@example.test', emailVerified: true },
  customer: { id: 'test-customer', role: 'customer', fullName: 'Test Customer', username: 'customer', phoneNumber: '09123456789', email: 'customer@example.test', emailVerified: true },
};
const products = [
  { id: 'available', productName: 'Fresh Leche Flan', price: 100, stockQuantity: 8, category: 'Flan', availability: 'available', imageUrl: '/logo.png', expiryStatus: 'fresh' },
  { id: 'sold-out', productName: 'Sold Out Dessert', price: 120, stockQuantity: 0, category: 'Flan', availability: 'available', imageUrl: '/logo.png', expiryStatus: 'fresh' },
  { id: 'expired', productName: 'Expired Dessert', price: 90, stockQuantity: 9, category: 'Flan', availability: 'expired', imageUrl: '/logo.png', expiryStatus: 'expired' },
];
app.get('/health', (req, res) => res.json({ status: 'ready' }));
app.get('/api/profiles/me', (req, res) => res.json(profiles[req.headers.authorization === 'Bearer test-admin' ? 'admin' : 'customer']));
app.get('/api/products', (req, res) => res.json(products));
app.get('/api/orders/best-sellers', (req, res) => res.json({ items: [] }));
app.get('/api/carts/mine', (req, res) => res.json({ items: [{ cartItemId: 'test-cart-item', quantity: 2, product: { ...products[0], name: products[0].productName, stock: 8 } }] }));
app.get('/api/payments/status', (req, res) => res.json({ configured: false, paymentMethodTypes: [] }));
app.get('/api/*', (req, res) => res.json([]));
app.get('/rest/v1/*', (req, res) => res.json([]));
app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
  res.status(error.status || 500).json({ error: error.message });
});

const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const apiOrigin = `http://127.0.0.1:${server.address().port}`;
let vite;
let browser;
let edge;
let debugPages = [];
try {
  vite = await createVite({ root: path.join(root, 'frontend'), configFile: path.join(root, 'frontend/vite.config.js'), server: { port: 0, host: '127.0.0.1', open: false }, define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiOrigin),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(apiOrigin),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-anon-key'),
    'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(''),
  } });
  await vite.listen();
  const uiOrigin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const edgePath = process.env.EDGE_EXECUTABLE;
  if (edgePath) edge = await chromium.launch({ headless: true, executablePath: edgePath });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const customerContext = await (edge || browser).newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
  for (const [context, role] of [[adminContext, 'admin'], [customerContext, 'customer']]) {
    await context.addInitScript(({ role, profile }) => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: `test-${role}`, refresh_token: 'test-refresh', expires_at: 4102444800, token_type: 'bearer', user: { ...profile, aud: 'authenticated' } })), { role, profile: profiles[role] });
  }
  const admin = await adminContext.newPage();
  const customer = await customerContext.newPage();
  const cart = await customerContext.newPage();
  const checkout = await customerContext.newPage();
  debugPages = [admin, customer, cart, checkout];
  const pageErrors = [];
  for (const page of [admin, customer, cart, checkout]) page.on('pageerror', (error) => pageErrors.push(error.message));
  for (const page of debugPages) page.setDefaultTimeout(15000);
  await Promise.all([admin.goto(`${uiOrigin}/admin/dashboard`, { waitUntil: 'domcontentloaded' }), customer.goto(`${uiOrigin}/products`, { waitUntil: 'domcontentloaded' }), cart.goto(`${uiOrigin}/cart`, { waitUntil: 'domcontentloaded' }), checkout.goto(`${uiOrigin}/checkout`, { waitUntil: 'domcontentloaded' })]);
  const closing = admin.getByLabel('Closing Time');
  await closing.waitFor();
  const status = customer.locator('.shop-hours-tag');
  const add = customer.getByRole('button', { name: 'Add to Cart: Fresh Leche Flan', exact: true });
  const preOrder = customer.getByRole('button', { name: 'Pre-order: Fresh Leche Flan', exact: true });
  await eventually(async () => (await status.innerText()) === 'Currently closed', 'initial closed status');
  await preOrder.waitFor();
  assert.equal(await preOrder.isVisible(), true);
  assert.equal(await preOrder.isDisabled(), true);
  assert.match(await customer.locator('.shop-product-card').first().innerText(), /Shop closed\. Pre-order during opening hours\./);
  passed('Existing customer tab uses Manila time even when device timezone is New York');
  const save = async (time) => {
    await closing.fill(time);
    await admin.getByRole('button', { name: 'Save Settings' }).click();
    await admin.getByText('Shop settings updated.', { exact: true }).waitFor();
    assert.equal(row.closing_time, time);
  };
  saveDelay = 400;
  await closing.fill('22:00');
  await admin.getByRole('button', { name: 'Save Settings' }).click();
  assert.equal(await admin.getByText('Shop settings updated.', { exact: true }).count(), 0);
  await admin.getByText('Shop settings updated.', { exact: true }).waitFor();
  saveDelay = 0;
  await eventually(() => add.isEnabled(), 'extension reopens products');
  assert.match(await status.innerText(), /10:00 PM/);
  await eventually(async () => !(await cart.getByRole('button', { name: 'Proceed to Checkout' }).isDisabled()), 'cart reopened');
  if (new URL(checkout.url()).pathname === '/cart') {
    await checkout.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await checkout.waitForURL('**/checkout');
  }
  await eventually(async () => !(await checkout.locator('.place-order-btn').isDisabled()), 'checkout reopened');
  assert.equal(await customer.getByRole('button', { name: 'Out of stock: Sold Out Dessert', exact: true }).isDisabled(), true);
  assert.equal(await customer.getByRole('button', { name: 'Expired: Expired Dessert', exact: true }).isDisabled(), true);
  passed('Awaited DB save pushes 8 PM to 10 PM extension to products, cart and checkout; stock/expiry still block');
  await eventually(() => preOrder.isEnabled(), 'extension reopens pre-orders');
  const soldOutPreOrder = customer.getByRole('button', { name: 'Pre-order: Sold Out Dessert', exact: true });
  assert.equal(await soldOutPreOrder.isEnabled(), true);
  assert.equal(await customer.getByRole('button', { name: 'Pre-order: Expired Dessert', exact: true }).isDisabled(), true);
  for (const [button, productName] of [[preOrder, 'Fresh Leche Flan'], [soldOutPreOrder, 'Sold Out Dessert']]) {
    await button.click();
    const dialog = customer.getByRole('dialog', { name: 'Pre-Order', exact: true });
    await dialog.waitFor();
    await eventually(async () => (await dialog.locator('input[name="productName"]').inputValue()) === productName, 'selected pre-order product');
    await customer.getByRole('button', { name: 'Close pre-order form' }).click();
    assert.equal(await customer.getByRole('dialog').count(), 0);
  }
  passed('Visible card Pre-order opens the selected dessert form, including sold-out future orders; expired products stay blocked');
  fs.mkdirSync(path.join(root, 'tmp/shop-hours'), { recursive: true });
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await customer.setViewportSize({ width, height: 1000 });
    await preOrder.scrollIntoViewIfNeeded();
    const bounds = await preOrder.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44, `Pre-order touch target at ${width}`);
    assert.ok(await customer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No overflow at ${width}`);
    if (width === 390 || width === 1440) {
      await customer.screenshot({ path: path.join(root, `tmp/shop-hours/preorder-products-${width}.png`) });
    }
  }
  await customer.setViewportSize({ width: 390, height: 844 });
  passed('Pre-order buttons fit all seven representative widths with at least 44px touch targets');
  await save('18:00');
  await eventually(async () => (await status.innerText()) === 'Currently closed', 'earlier close');
  assert.match(await customer.locator('.products-heading').innerText(), /6:00 PM/);
  await eventually(() => cart.getByRole('button', { name: 'Proceed to Checkout' }).isDisabled(), 'cart closed');
  await eventually(() => checkout.locator('.place-order-btn').isDisabled(), 'checkout closed');
  assert.equal(await cart.locator('.cart-item').count(), 1);
  assert.equal(await preOrder.isDisabled(), true);
  assert.equal(await preOrder.innerText(), 'Pre-order');
  passed('Earlier closing time immediately disables new orders without clearing the cart');
  await save('22:00');
  await eventually(() => add.isEnabled(), 'reopen after closed');
  await eventually(() => preOrder.isEnabled(), 'pre-order reopens after closed');
  passed('Admin can extend hours and reopen after the previous closing time');
  await closing.fill('23:00');
  await admin.evaluate(() => window.dispatchEvent(new Event('focus')));
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(await closing.inputValue(), '23:00');
  failSave = true;
  await admin.getByRole('button', { name: 'Save Settings' }).click();
  await admin.getByRole('alert').filter({ hasText: 'Fixture save failure' }).waitFor();
  assert.equal(row.closing_time, '22:00');
  assert.equal(await admin.getByText('Shop settings updated.', { exact: true }).count(), 0);
  failSave = false;
  passed('Refresh preserves unsaved admin edits; failed DB write never shows success');
  const fallbackContext = await browser.newContext();
  await fallbackContext.addInitScript(() => { window.EventSource = undefined; });
  const fallback = await fallbackContext.newPage();
  await fallback.goto(`${uiOrigin}/products`);
  await eventually(async () => (await fallback.locator('.shop-hours-tag').innerText()).includes('10:00 PM'), 'polling initial read');
  await save('19:00');
  await eventually(async () => (await fallback.locator('.shop-hours-tag').innerText()) === 'Currently closed', 'polling fallback sync');
  passed('Polling fallback updates already-open customer pages without EventSource');
  await save('22:00');
  await eventually(() => add.isEnabled(), 'reopen before boundary test');
  await customer.clock.install();
  virtualTime = Date.parse('2026-09-07T13:59:59Z');
  row.updated_at = new Date(Date.parse('2026-09-07T00:00:00Z') + ++revision * 1000).toISOString();
  events.publish(await getShopSettings(database));
  await new Promise((resolve) => setTimeout(resolve, 100));
  await customer.clock.runFor(1500);
  await eventually(async () => (await status.innerText()) === 'Currently closed', 'clock reaches closing');
  passed('Customer left open automatically closes at 10 PM boundary without another admin save');
  virtualTime = Date.parse('2026-09-07T13:00:00Z');
  failRead = true;
  await fallback.evaluate(() => window.dispatchEvent(new Event('focus')));
  await eventually(async () => (await fallback.locator('.shop-hours-tag').innerText()) === 'Hours unavailable', 'hours fetch unavailable');
  assert.equal(await fallback.getByRole('button', { name: 'Hours unavailable: Fresh Leche Flan', exact: true }).isDisabled(), true);
  failRead = false;
  await fallback.evaluate(() => window.dispatchEvent(new Event('focus')));
  await eventually(async () => (await fallback.locator('.shop-hours-tag').innerText()).includes('10:00 PM'), 'reconnect latest hours');
  passed('Disconnected schedule fails closed and recovers without login or refresh');
  await fallback.getByRole('button', { name: 'Pre-order: Fresh Leche Flan', exact: true }).click();
  await fallback.waitForURL('**/login');
  assert.equal(await fallback.getByRole('dialog').count(), 0);
  await fallback.goto(`${uiOrigin}/products`);
  passed('Guest card Pre-order preserves the login requirement');
  assert.deepEqual(pageErrors, []);
  fs.mkdirSync(path.join(root, 'tmp/shop-hours'), { recursive: true });
  await admin.locator('.shop-settings-panel').screenshot({ path: path.join(root, 'tmp/shop-hours/admin-settings.png') });
  await fallback.screenshot({ path: path.join(root, 'tmp/shop-hours/customer-products.png') });
  fs.writeFileSync(path.join(root, 'tmp/shop-hours/browser-results.json'), JSON.stringify({ browsers: [await browser.version(), edge ? `Edge ${await edge.version()}` : 'second isolated Chromium context'], tests: results }, null, 2));
  console.log(`${results.length} browser integration checks passed.`);
} catch (error) {
  for (const page of debugPages) console.log('PAGE STATE', page.url(), (await page.locator('body').innerText()).slice(0,1000));
  throw error;
} finally {
  await edge?.close();
  await browser?.close();
  await vite?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

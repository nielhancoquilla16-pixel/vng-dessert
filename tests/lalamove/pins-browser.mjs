// Real React forms and Leaflet, with isolated hook fixtures. No real users,
// database writes, Google requests, tile downloads, or courier bookings.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an installed playwright/index.mjs path.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const root = fileURLToPath(new URL('../../frontend/', import.meta.url)).replaceAll('\\', '/');
const hooksId = `${root}__pin-hooks.jsx`;
const entryId = `${root}__pin-fixture.jsx`;
const hooksSource = `
import { useSyncExternalStore } from 'react';
const listeners = new Set();
let revision = 0;
const changed = () => { revision++; listeners.forEach(fn => fn()); };
const watch = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const useFixture = () => useSyncExternalStore(watch, () => revision);
const noop = async () => {};
const shop = { shopName: 'Test Shop', address: 'Test pickup address', phoneNumber: '09123456789', latitude: '14.455378', longitude: '120.974665', openingTime: '00:00', closingTime: '23:59', serverTime: '2026-09-25T04:00:00Z' };
const order = { id: 'legacy-order', orderCode: 'TEST-LEGACY', customer: 'Test Recipient', phoneNumber: '09123456789', deliveryRecipientName: 'Test Recipient', deliveryContactNumber: '09123456789', address: '10 Example Street, Las Pinas, Metro Manila', deliveryLatitude: 0, deliveryLongitude: 0, status: 'confirmed', deliveryMethod: 'delivery', paymentMethod: 'cash', createdAt: '2026-09-25T01:00:00Z', lineItems: [], totalAmount: 100 };
export const fixture = window.pinFixture = { addresses: [{ id: 'saved-1', label: 'Home', recipientName: 'Test Recipient', phoneNumber: '09123456789', streetAddress: '10 Example Street', city: 'Las Pinas', province: 'Metro Manila', formattedAddress: '10 Example Street, Las Pinas, Metro Manila', isDefault: true }], orders: [order], bookings: [], placedOrders: [], settingsUpdates: [], failBooking: false };
fixture.refresh = () => { fixture.orders = fixture.orders.map(order => ({ ...order })); changed(); };
const customerAddresses = {
  isAddressesLoading: false, hasLoadedAddresses: true, addressesError: '',
  async createAddress(input) { const address = { ...input, id: 'saved-' + (fixture.addresses.length + 1) }; fixture.addresses = [...fixture.addresses, address]; changed(); return address; },
  async updateAddress(id, input) { fixture.addresses = fixture.addresses.map(a => a.id === id ? { ...a, ...input } : a); changed(); },
  setDefaultAddress: noop, deleteAddress: noop,
};
export const useCustomerAddresses = () => { useFixture(); return { ...customerAddresses, addresses: fixture.addresses, defaultAddress: fixture.addresses.find(a => a.isDefault) }; };
const settings = { shopSettings: shop, canEditShopSettings: true, isShopSettingsLoading: false, shopSettingsError: '', isShopOpen: true, operatingHoursLabel: 'Open', refreshShopSettings: async () => shop, updateShopSettings: async input => { fixture.settingsUpdates.push(input); Object.assign(shop, input); changed(); } };
export const useShopSettings = () => { useFixture(); return settings; };
const orders = {
  isOrdersLoading: false, refreshOrders: noop, updateOrderStatus: noop,
  getLalamoveStatus: async () => ({ configured: true, pickup: { name: shop.shopName, phone: shop.phoneNumber, address: shop.address, latitude: shop.latitude, longitude: shop.longitude } }),
  async addOrder(input) { fixture.placedOrders.push(input); return input; },
  async bookLalamoveDelivery(id, input) {
    fixture.bookings.push(input);
    if (fixture.holdBooking) await new Promise(resolve => { fixture.finishBooking = resolve; });
    if (fixture.failBooking) throw new Error('Fixture courier rejection');
    const shareLink = 'https://share.lalamove.com/fixture-tracking';
    const booked = { ...order, deliveryLatitude: input.destinationLatitude, deliveryLongitude: input.destinationLongitude, lalamoveTracking: { booked: true, orderId: 'fixture-delivery', shareLink } };
    fixture.orders = [booked]; changed();
    return { order: booked, lalamoveLaunch: { shareLink } };
  },
};
export const useOrders = () => { useFixture(); return { ...orders, orders: fixture.orders }; };
const auth = { loggedInCustomer: { id: 'customer', fullName: 'Test Recipient', username: 'test', phoneNumber: '09123456789' }, updateLoggedInCustomer: noop };
export const useAuth = () => auth;
const cart = { cartItems: [{ id: 'dessert', name: 'Test Cake', category: 'Cake', price: 100, quantity: 1 }], removeFromCart: noop };
export const useCart = () => cart;
const products = { validateStockAvailability: () => ({ isAvailable: true }), refreshProducts: noop };
export const useProducts = () => products;
export const apiRequest = async () => ({ configured: false, paymentMethodTypes: [] });
`;
const entrySource = `
import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import SavedAddressManager from '/src/components/SavedAddressManager.jsx';
import ShopSettingsPanel from '/src/components/ShopSettingsPanel.jsx';
import Checkout from '/src/pages/Checkout.jsx';
import AdminOrders from '/src/pages/AdminOrders.jsx';
import LocationPinPicker from '/src/components/LocationPinPicker.jsx';
import '/__pin-hooks.jsx';
function Picker() { const [pin, setPin] = useState({}); const [disabled, setDisabled] = useState(false); return <><button onClick={() => setDisabled(!disabled)}>Toggle disabled</button><LocationPinPicker {...pin} onChange={setPin} disabled={disabled} /><output>{JSON.stringify(pin)}</output></>; }
function App() { return <BrowserRouter><nav><Link to="/addresses">Addresses</Link> <Link to="/checkout">Checkout</Link> <Link to="/admin">Admin</Link> <Link to="/settings">Settings</Link> <Link to="/picker">Picker</Link></nav><Routes><Route path="/addresses" element={<SavedAddressManager/>}/><Route path="/checkout" element={<Checkout/>}/><Route path="/admin" element={<AdminOrders/>}/><Route path="/settings" element={<ShopSettingsPanel/>}/><Route path="/picker" element={<Picker/>}/><Route path="/orders" element={<p>Order submitted</p>}/></Routes></BrowserRouter>; }
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;
let vite;
let browser;
const consoleErrors = [];
const unexpectedRequests = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1sAAAAASUVORK5CYII=', 'base64');
const pass = message => console.log(`PASS ${message}`);
try {
  vite = await createServer({
    root, configFile: path.join(root, 'vite.config.js'),
    cacheDir: path.join(root, '../tmp/lalamove-vite-cache'),
    optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'react-router-dom', 'leaflet', 'lucide-react'] },
    server: { host: '127.0.0.1', port: 5197, open: false },
    plugins: [{
      name: 'isolated-map-fixtures', enforce: 'pre',
      resolveId(source) {
        if (source === hooksId || source === entryId) return source;
        if (/\/(context\/(AuthContext|CartContext|OrderContext|ProductContext|CustomerAddressesContext|ShopSettingsContext)|lib\/api)(\.jsx?)?$/.test(source) || source === '/__pin-hooks.jsx') return hooksId;
        if (source === '/__pin-fixture.jsx') return entryId;
      },
      load(id) { if (id === hooksId) return hooksSource; if (id === entryId) return entrySource; },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!['/picker', '/addresses', '/checkout', '/settings', '/admin', '/orders', '/fixture-tracking'].includes(req.url)) return next();
          const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:12px"><div id="root"></div><script type="module" src="/__pin-fixture.jsx"></script></body></html>';
          res.setHeader('Content-Type', 'text/html');
          res.end(await server.transformIndexHtml(req.url, html));
        });
      },
    }],
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    if (url === 'https://share.lalamove.com/fixture-tracking') return route.fulfill({ contentType: 'text/html', body: 'Fixture delivery tracking' });
    if (/https:\/\/tile.openstreetmap.org\//.test(url)) return route.fulfill({ contentType: 'image/png', body: png });
    if (/https:\/\/www.openstreetmap.org\/export\/embed/.test(url)) return route.fulfill({ contentType: 'text/html', body: 'Pickup preview fixture' });
    unexpectedRequests.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => consoleErrors.push(error.message));
  const map = () => page.locator('.location-pin-picker__map');
  const choosePin = async (x = 180, y = 140) => { await map().click({ position: { x, y } }); await page.locator('.location-pin-picker__marker').waitFor(); };
  const manualPin = async (latitude, longitude) => {
    await page.getByText('Enter coordinates manually', { exact: true }).click();
    await page.getByLabel('Latitude', { exact: true }).fill(latitude);
    await page.getByLabel('Longitude', { exact: true }).fill(longitude);
  };
  await page.goto(`${origin}/picker`);
  await map().waitFor();
  assert.equal(await page.locator('output').innerText(), '{}');
  assert.equal(await page.locator('.location-pin-picker__marker').count(), 0);
  await choosePin();
  const clicked = JSON.parse(await page.locator('output').innerText());
  assert.ok(Number(clicked.latitude) > 14 && Number(clicked.longitude) > 120);
  const beforeDrag = await page.locator('output').innerText();
  const marker = await page.locator('.location-pin-picker__marker').boundingBox();
  await page.mouse.move(marker.x + 16, marker.y + 16);
  await page.mouse.down(); await page.mouse.move(marker.x + 60, marker.y + 35, { steps: 8 }); await page.mouse.up();
  assert.notEqual(await page.locator('output').innerText(), beforeDrag);
  await manualPin('0', '0');
  assert.equal(await page.locator('.location-pin-picker__marker').count(), 0);
  await page.getByLabel('Latitude', { exact: true }).fill('14.45678912');
  await page.getByLabel('Longitude', { exact: true }).fill('120.98765432');
  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  const frozen = await page.locator('output').innerText();
  await map().click({ position: { x: 220, y: 160 } });
  assert.equal(await page.locator('output').innerText(), frozen);
  assert.equal(await page.getByLabel('Latitude', { exact: true }).isDisabled(), true);
  pass('No default pin; clicking, dragging, manual validation and disabled state work in StrictMode');

  await page.getByRole('link', { name: 'Addresses', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Add Address', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  for (const [name, value] of [['recipientName', 'Map Recipient'], ['phoneNumber', '09123456789'], ['streetAddress', '10 Example Street'], ['city', 'Las Pinas'], ['province', 'Metro Manila']]) await page.locator(`[name="${name}"]`).fill(value);
  await page.getByRole('button', { name: 'Save Address', exact: true }).click();
  assert.equal(await page.evaluate(() => window.pinFixture.addresses[0].recipientName), 'Test Recipient');
  await page.getByRole('alert').filter({ hasText: 'Select the actual' }).waitFor();
  await choosePin();
  await page.locator('[name="recipientName"]').fill('Updated Recipient');
  assert.equal(await page.locator('.location-pin-picker__marker').count(), 1);
  await page.locator('[name="city"]').fill('Las Pinas City');
  assert.equal(await page.locator('.location-pin-picker__marker').count(), 0);
  await choosePin(210, 155);
  await page.getByRole('button', { name: 'Save Address', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const saved = await page.evaluate(() => window.pinFixture.addresses[0]);
  assert.equal(saved.recipientName, 'Updated Recipient');
  assert.equal(saved.formattedAddress, '10 Example Street, Las Pinas City, Metro Manila');
  assert.ok(saved.latitude && saved.longitude);
  pass('Saved addresses require a pin, preserve it for contact edits and clear it for geographic edits');

  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await page.locator('.location-pin-picker__marker').waitFor();
  await page.locator('.place-order-btn').click();
  await page.getByText('Order submitted', { exact: true }).waitFor();
  const submitted = await page.evaluate(() => window.pinFixture.placedOrders[0]);
  assert.equal(submitted.deliveryLatitude, Number(saved.latitude));
  assert.equal(submitted.deliveryLongitude, Number(saved.longitude));
  assert.equal(submitted.deliveryAddressId, saved.id);
  pass('Checkout submits the saved OpenStreetMap coordinates and address ID');

  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await page.locator('.location-pin-picker__marker').waitFor();
  await manualPin('14.46678912', '120.99765432');
  await page.locator('.place-order-btn').click();
  await page.getByText('Order submitted', { exact: true }).waitFor();
  const corrected = await page.evaluate(() => window.pinFixture.placedOrders[1]);
  assert.equal(corrected.deliveryAddressId, '');
  assert.equal(corrected.deliveryLatitude, 14.46678912);
  assert.equal(corrected.deliveryLongitude, 120.99765432);
  pass('Changing the checkout pin overrides the saved address rather than submitting its stale coordinates');

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await manualPin('14.4554', '120.9747');
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.pinFixture.settingsUpdates.at(-1)), { latitude: '14.4554', longitude: '120.9747' });
  pass('Store pickup map selection is included in the shop settings save');

  await page.getByRole('link', { name: 'Admin', exact: true }).click();
  await map().waitFor();
  await page.getByRole('button', { name: 'Book Now', exact: true }).click();
  assert.equal(await page.evaluate(() => window.pinFixture.bookings.length), 0);
  assert.equal(context.pages().length, 1);
  await manualPin('14.4789', '120.9987');
  await page.evaluate(() => { window.pinFixture.refresh(); window.pinFixture.failBooking = true; window.pinFixture.holdBooking = true; });
  assert.equal(await page.getByLabel('Latitude', { exact: true }).inputValue(), '14.4789');
  const failedPopupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Book Now', exact: true }).click();
  const failedPopup = await failedPopupPromise;
  await failedPopup.getByRole('heading', { name: 'Booking your delivery…' }).waitFor();
  assert.equal(await failedPopup.evaluate(() => window.opener), null);
  assert.equal(await page.getByRole('button', { name: 'Booking...', exact: true }).isDisabled(), true);
  const failedPopupClosed = failedPopup.waitForEvent('close');
  await page.evaluate(() => window.pinFixture.finishBooking());
  await failedPopupClosed;
  await page.locator('.admin-orders-lalamove-panel [role="alert"]').filter({ hasText: 'Fixture courier rejection' }).waitFor();
  assert.equal(context.pages().length, 1);
  await page.evaluate(() => { window.pinFixture.failBooking = false; });
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Book Now', exact: true }).click();
  const popup = await popupPromise;
  await popup.getByRole('heading', { name: 'Booking your delivery…' }).waitFor();
  await page.evaluate(() => window.pinFixture.finishBooking());
  await popup.waitForURL('https://share.lalamove.com/fixture-tracking');
  assert.equal(await page.evaluate(() => window.pinFixture.bookings.at(-1).destinationLatitude), '14.4789');
  await popup.close();
  pass('Staff correct a legacy zero pin; refresh preserves it, failures stay visible, and success opens the returned link');

  await page.getByRole('link', { name: 'Addresses', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  for (const width of [375, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await map().scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await page.locator('.leaflet-control-attribution').isVisible());
  }
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(unexpectedRequests, []);
  pass('Map fits mobile and desktop forms with visible attribution and no Google or external API requests');
} finally {
  await browser?.close();
  await vite?.close();
}

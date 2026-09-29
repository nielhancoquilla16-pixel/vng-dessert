// Exercise the real account page with isolated hook fixtures. No real account,
// database writes, authentication, geocoding, or delivery requests are used.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an installed playwright/index.mjs path.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const root = fileURLToPath(new URL('../../frontend/', import.meta.url)).replaceAll('\\', '/');
const hooksId = `${root}__profile-address-hooks.jsx`;
const entryId = `${root}__profile-address-fixture.jsx`;
const hooksSource = `
import { useSyncExternalStore } from 'react';
const listeners = new Set();
let revision = 0;
const changed = () => { revision++; listeners.forEach(fn => fn()); };
const watch = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const useFixture = () => useSyncExternalStore(watch, () => revision);
const noop = async () => {};
export const fixture = window.profileAddressFixture = {
  customer: { id: 'fixture-customer', username: 'fixture', fullName: 'Test Customer', email: 'fixture@example.test', phoneNumber: '09123456789', address: '', avatarUrl: '' },
  persistedAddresses: [], addresses: [], addressesError: '', saveCalls: [], refreshCalls: 0,
  failSave: false, failRefresh: false, holdRefresh: false,
};
const auth = {
  isAuthLoading: false,
  profile: { createdAt: '2026-09-01T04:00:00Z', emailVerified: true },
  async updateMyProfile(input) {
    fixture.saveCalls.push(input);
    if (fixture.failSave) throw new Error('Fixture profile save rejected');
    fixture.customer = { ...fixture.customer, ...input };
    if (input.address) {
      const existing = fixture.persistedAddresses.find(a => a.formattedAddress === input.address);
      fixture.persistedAddresses = fixture.persistedAddresses.map(a => ({ ...a, isDefault: a.id === existing?.id }));
      if (!existing) fixture.persistedAddresses.push({ id: 'fixture-address-' + (fixture.persistedAddresses.length + 1), label: 'Home', recipientName: input.fullName, phoneNumber: input.phoneNumber, streetAddress: input.address, formattedAddress: input.address, isDefault: true });
    }
    changed();
    return fixture.customer;
  },
};
export const useAuth = () => { useFixture(); return { ...auth, loggedInCustomer: fixture.customer }; };
const customerAddresses = {
  isAddressesLoading: false, hasLoadedAddresses: true,
  async refreshAddresses() {
    fixture.refreshCalls++;
    if (fixture.holdRefresh) await new Promise(resolve => { fixture.finishRefresh = resolve; });
    if (fixture.failRefresh) {
      fixture.addressesError = 'Fixture saved-address refresh rejected';
      changed();
      throw new Error(fixture.addressesError);
    }
    fixture.addresses = fixture.persistedAddresses.map(a => ({ ...a }));
    fixture.addressesError = '';
    changed();
    return fixture.addresses;
  },
  async createAddress() { throw new Error('The profile must not call the manual address creation flow'); },
  updateAddress: noop, setDefaultAddress: noop, deleteAddress: noop,
};
export const useCustomerAddresses = () => { useFixture(); return { ...customerAddresses, addresses: fixture.addresses, addressesError: fixture.addressesError, defaultAddress: fixture.addresses.find(a => a.isDefault) }; };
export const useShopSettings = () => ({ shopSettings: {} });
`;
const entrySource = `
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import CustomerProfile from '/src/pages/CustomerProfile.jsx';
import '/src/index.css';
import '/__profile-address-hooks.jsx';
createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><CustomerProfile /></BrowserRouter></StrictMode>);
`;
let vite;
let browser;
const consoleErrors = [];
const unexpectedRequests = [];
const pass = message => console.log(`PASS ${message}`);
try {
  vite = await createServer({
    root, configFile: path.join(root, 'vite.config.js'),
    cacheDir: path.join(root, '../tmp/profile-address-vite-cache'),
    optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'react-router-dom', 'leaflet', 'lucide-react'] },
    server: { host: '127.0.0.1', port: 5198, open: false },
    plugins: [{
      name: 'isolated-profile-address-fixtures', enforce: 'pre',
      resolveId(source) {
        if (source === hooksId || source === entryId) return source;
        if (/\/context\/(AuthContext|CustomerAddressesContext|ShopSettingsContext)(\.jsx?)?$/.test(source) || source === '/__profile-address-hooks.jsx') return hooksId;
        if (source === '/__profile-address-fixture.jsx') return entryId;
      },
      load(id) { if (id === hooksId) return hooksSource; if (id === entryId) return entrySource; },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/profile') return next();
          const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="padding:12px"><div id="root"></div><script type="module" src="/__profile-address-fixture.jsx"></script></body></html>';
          res.setHeader('Content-Type', 'text/html');
          res.end(await server.transformIndexHtml(req.url, html));
        });
      },
    }],
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    if (url.startsWith('https://fonts.googleapis.com/')) return route.fulfill({ contentType: 'text/css', body: '' });
    unexpectedRequests.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.setDefaultTimeout(15000);
  const defaultAddress = page.getByLabel('Default Address', { exact: true });
  const saveProfile = page.getByRole('button', { name: 'Save Profile', exact: true });
  const cards = page.locator('.saved-address-card');
  const addressCard = address => cards.filter({ has: page.getByText(address, { exact: true }) });
  const notice = page.locator('.customer-profile-feedback[role="status"]');

  await page.goto(`${origin}/profile`);
  await page.getByRole('heading', { name: 'My Account', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add Address', exact: true }).count(), 0);
  assert.equal(await cards.count(), 0);
  assert.equal(await saveProfile.isDisabled(), true);
  await defaultAddress.fill('Discarded address');
  assert.equal(await cards.count(), 0);
  await page.getByRole('button', { name: 'Reset Changes', exact: true }).click();
  assert.equal(await defaultAddress.inputValue(), '');
  assert.deepEqual(await page.evaluate(() => window.profileAddressFixture.saveCalls), []);
  pass('Add Address is absent; typing and Reset Changes do not save an address');

  const firstAddress = '10 Example Street, Las Pinas, Metro Manila';
  await page.evaluate(() => { window.profileAddressFixture.holdRefresh = true; });
  await defaultAddress.fill(firstAddress);
  await saveProfile.click();
  await page.waitForFunction(() => window.profileAddressFixture.refreshCalls === 1);
  assert.equal(await page.locator('.customer-profile-primary-button').isDisabled(), true);
  assert.equal(await cards.count(), 0);
  assert.equal(await notice.count(), 0);
  await page.evaluate(() => { window.profileAddressFixture.holdRefresh = false; window.profileAddressFixture.finishRefresh(); });
  await addressCard(firstAddress).waitFor();
  await notice.waitFor();
  assert.equal(await addressCard(firstAddress).getByText('Default', { exact: true }).isVisible(), true);
  assert.equal(await saveProfile.isDisabled(), true);
  pass('Save Profile awaits address refresh and automatically displays the new default');

  const secondAddress = '20 New Street, Las Pinas, Metro Manila';
  await defaultAddress.fill(secondAddress);
  await saveProfile.click();
  await addressCard(secondAddress).waitFor();
  assert.equal(await cards.count(), 2);
  assert.equal(await addressCard(firstAddress).getByText('Default', { exact: true }).count(), 0);
  assert.equal(await addressCard(secondAddress).getByText('Default', { exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).count(), 2);
  pass('Changing the default shows the newly saved address and retains the previous one');

  await page.evaluate(() => { window.profileAddressFixture.failSave = true; });
  await defaultAddress.fill('Address that must not be saved');
  await saveProfile.click();
  await page.getByRole('alert').filter({ hasText: 'Fixture profile save rejected' }).waitFor();
  assert.equal(await notice.count(), 0);
  assert.equal(await cards.count(), 2);
  assert.deepEqual(await page.evaluate(() => ({ persisted: window.profileAddressFixture.persistedAddresses.length, refreshes: window.profileAddressFixture.refreshCalls })), { persisted: 2, refreshes: 2 });
  pass('A rejected profile save creates no row, performs no refresh, and shows no success');

  const thirdAddress = '30 Saved Street, Las Pinas, Metro Manila';
  await page.evaluate(() => { window.profileAddressFixture.failSave = false; window.profileAddressFixture.failRefresh = true; });
  await defaultAddress.fill(thirdAddress);
  await saveProfile.click();
  await page.locator('.customer-profile-feedback[role="alert"]').filter({ hasText: 'Your profile was saved, but Saved Addresses could not refresh. Please reload the page.' }).waitFor();
  assert.equal(await notice.count(), 0);
  assert.equal(await cards.count(), 2);
  assert.equal(await defaultAddress.inputValue(), thirdAddress);
  assert.deepEqual(await page.evaluate(() => ({ persisted: window.profileAddressFixture.persistedAddresses.length, address: window.profileAddressFixture.customer.address })), { persisted: 3, address: thirdAddress });
  pass('Refresh failure accurately reports the saved profile and asks for a page reload');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => { window.profileAddressFixture.failRefresh = false; });
  await page.getByLabel('Full Name', { exact: true }).fill('Mobile Test Customer');
  await saveProfile.click();
  await addressCard(thirdAddress).waitFor();
  assert.equal(await cards.count(), 3);
  assert.equal(await page.getByRole('alert').count(), 0);
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await addressCard(thirdAddress).scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Account page overflows at ${width}px`);
    assert.equal(await page.getByRole('button', { name: 'Add Address', exact: true }).count(), 0);
  }
  const phoneInput = page.getByLabel('Phone Number', { exact: true });
  assert.equal(await phoneInput.getAttribute('maxlength'), '11');
  assert.equal(await phoneInput.getAttribute('pattern'), '[0-9]{11}');
  assert.equal(await phoneInput.getAttribute('required'), '');
  await phoneInput.fill('09628971659dadasd');
  assert.equal(await phoneInput.inputValue(), '09628971659');
  await phoneInput.press('a');
  await phoneInput.press('!');
  assert.equal(await phoneInput.inputValue(), '09628971659');
  const callsBeforeInvalidPhone = await page.evaluate(() => window.profileAddressFixture.saveCalls.length);
  await phoneInput.fill('0962897165');
  await saveProfile.click();
  await page.getByRole('alert').filter({ hasText: 'Phone number must contain exactly 11 digits.' }).waitFor();
  assert.equal(await page.evaluate(() => window.profileAddressFixture.saveCalls.length), callsBeforeInvalidPhone);
  pass('Phone input blocks non-digits, caps at 11, and prevents saving any other length');
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(unexpectedRequests, []);
  pass('Saving and automatic address refresh work on mobile, without horizontal overflow or live requests');
} finally {
  await browser?.close();
  await vite?.close();
}

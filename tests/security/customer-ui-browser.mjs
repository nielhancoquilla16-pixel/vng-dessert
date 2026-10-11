// Real signup, saved-address and error UI; all API responses are isolated.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
import { chromium } from '../../tmp/security-verification/node_modules/playwright/index.mjs';

const root = fileURLToPath(new URL('../../frontend/', import.meta.url)).replaceAll('\\', '/');
const hooksId = `${root}__security-hooks.jsx`;
const entryId = `${root}__security-entry.jsx`;
const hooks = `
export const fixture = window.securityFixture = { registrations: [], addressWrites: [], registrationMessage: '' };
const noop = async () => ({ success: true });
export const getDashboardPathForRole = () => '/customer/dashboard';
export const useAuth = () => ({ session: null, profile: null, isAuthLoading: false, isPasswordRecovery: false,
  loginUser: noop, resendCustomerSignupLink: noop, requestPasswordReset: noop, verifyPasswordRecoveryCode: noop, completePasswordRecovery: noop,
  registerCustomer: async input => { if (fixture.registrationMessage) return { success: false, message: fixture.registrationMessage }; fixture.registrations.push(input.email); return { success: true, needsVerification: true, email: input.email }; } });
export const useCustomerAddresses = () => ({ addresses: [{ id: 'address', label: 'Home', recipientName: 'Customer', phoneNumber: '09171234567', streetAddress: 'Street', city: 'City', province: 'Province', formattedAddress: 'Street, City, Province', latitude: 14.4, longitude: 120.9 }], isAddressesLoading: false, addressesError: '',
  updateAddress: async (id, input) => { fixture.addressWrites.push(input); }, setDefaultAddress: noop, deleteAddress: noop });
export const useShopSettings = () => ({ shopSettings: {} });
export const supabase = null;
export const isSupabaseConfigured = false;
export const clearSupabaseSessionStorage = () => {};
export const getRememberMePreference = () => false;
export const passwordRecoveryMode = 'link';
`;
const entry = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from '/src/pages/Login.jsx';
import SavedAddressManager from '/src/components/SavedAddressManager.jsx';
import ApiStatusBanner from '/src/components/ApiStatusBanner.jsx';
import { apiRequest } from '/src/lib/api.js';
import { customerErrorMessage } from '/src/lib/publicErrors.js';
function ErrorProbe() {
  const [error, setError] = useState('');
  const request = async () => { try { await apiRequest('/api/failure'); } catch(error) { setError(customerErrorMessage(error)); } };
  return <><ApiStatusBanner/><button onClick={request}>Load information</button><p role="alert">{error}</p></>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
  <Route path="/login" element={<Login/>}/><Route path="/addresses" element={<SavedAddressManager/>}/>
  <Route path="/errors" element={<ErrorProbe/>}/>
</Routes></BrowserRouter>);
`;
let vite;
let browser;
const pageErrors = [];
let failureStatus = 500;
try {
  vite = await createServer({
    root, configFile: path.join(root, 'vite.config.js'), cacheDir: path.join(root, '../tmp/security-ui-cache'),
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/fixture-api') },
    server: { host: '127.0.0.1', port: 0, open: false }, optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'react-router-dom', 'lucide-react'] },
    plugins: [{ name: 'security-ui-fixtures', enforce: 'pre',
      resolveId(source) {
        if (source === hooksId || source === entryId || source === `${root}__security-map.jsx`) return source;
        if (source === '/__security-entry.jsx') return entryId;
        if (/\/(context\/(AuthContext|CustomerAddressesContext|ShopSettingsContext)|lib\/supabase)(\.jsx?)?$/.test(source)) return hooksId;
        if (/\/components\/LocationPinPicker(\.jsx)?$/.test(source)) return `${root}__security-map.jsx`;
      },
      load(id) { if (id === hooksId) return hooks; if (id === entryId) return entry; if (id === `${root}__security-map.jsx`) return 'export default function Map() { return null; }'; },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!/^\/(login|addresses|errors)([/?]|$)/.test(req.url)) return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(await server.transformIndexHtml(req.url, '<html><body><div id="root"></div><script type="module" src="/__security-entry.jsx"></script></body></html>'));
        });
      },
    }],
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/fixture-api/api/auth/captcha') return route.fulfill({ json: { id: 'captcha', question: '2 + 3', expiresInSeconds: 600 } });
    if (url.pathname === '/fixture-api/api/failure') return route.fulfill({ status: failureStatus, json: { error: `Error ${failureStatus}: database SQLSTATE failed at secret.env PRIVATE_SECRET`, stack: 'PRIVATE_STACK', api_key: 'PRIVATE_API_KEY' } });
    if (url.origin !== origin) return route.abort();
    return route.continue();
  });
  const signup = async (email) => {
    await page.goto(origin + '/login?mode=signup');
    await page.locator('#signupUsername').fill('customername');
    await page.locator('#signupEmail').fill(email);
    await page.locator('#signupPassword').fill('Testing123!');
    await page.locator('#signupConfirmPassword').fill('Testing123!');
    await page.getByRole('textbox', { name: 'CAPTCHA answer' }).fill('5');
    await page.locator('button[type="submit"]').click();
  };
  for (const email of [
    'customer@mailinator.com', 'customer@googlemail.com', 'v.jzh.z.hdb.b.d.u.d.hj.db@gmail.com',
    's.lo.t.hfuln.m.w@gmail.com', 'slothfulnmw@gmail.com', 'slothfulnmw+new@gmail.com',
    'ma.ss.i.v.e.cvn@gmail.com', 'massivecvn+new@gmail.com',
    'kajaahahaggjahagafa+kemp@gmail.com', 'kajaahahaggjahagafa@gmail.com',
    'bajaahahaggjahagafa+another@gmail.com', 'kjhgfdsmnbv@gmail.com',
  ]) {
    await signup(email);
    await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => window.securityFixture.registrations.length), 0);
  }
  console.log('PASS Signup form rejects disposable domains, googlemail, suspicious patterns and the reported public Gmail inbox with all aliases');
  for (const email of ['customer.name@gmail.com', 'juan.delacruz1995@gmail.com', 'john.smith+kemp@gmail.com']) {
    await signup(email);
    await page.getByRole('dialog').waitFor();
    await page.locator('.auth-terms-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
    await page.getByRole('dialog').getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Agree and Continue' }).click();
    await page.locator('button[type="submit"]').click();
    await page.getByRole('heading', { name: 'Check Your Email', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.securityFixture.registrations), [email]);
  }
  console.log('PASS Legitimate dotted Gmail completes signup and reaches email verification');
  for (const message of [
    'Too many attempts. Please wait a moment and try again.',
    'We could not send your verification email. Please try again later or contact the shop for help.',
  ]) {
    await signup('customer.name@gmail.com');
    await page.getByRole('dialog').waitFor();
    await page.locator('.auth-terms-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
    await page.getByRole('dialog').getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Agree and Continue' }).click();
    await page.evaluate((message) => { window.securityFixture.registrationMessage = message; }, message);
    await page.locator('button[type="submit"]').click();
    await page.getByText(message, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.securityFixture.registrations.length), 0);
  }
  console.log('PASS Signup preserves safe rate-limit and verification-email guidance from the auth layer');
  await page.goto(origin + '/addresses');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  for (const phone of ['09123', '09001234567', '0917abc4567']) {
    await page.locator('input[name="phoneNumber"]').fill(phone);
    assert.equal(await page.locator('input[name="phoneNumber"]').evaluate((input) => input.checkValidity()), false);
    await page.locator('.saved-address-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await page.getByText('Enter a valid Philippine mobile number with 11 digits, starting with 09.').waitFor();
    assert.equal(await page.evaluate(() => window.securityFixture.addressWrites.length), 0);
  }
  console.log('PASS Saved-address form rejects incomplete numbers, unsupported prefixes and letters');
  for (const status of [404, 500]) {
    failureStatus = status;
    await page.goto(origin + '/errors');
    await page.getByRole('button', { name: 'Load information' }).click();
    await page.waitForFunction(() => document.querySelector('p[role="alert"]').textContent.length > 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /Error 404|Error 500|SQLSTATE|database|PRIVATE|HTTP|api_key|secret\.env/i);
    if (status === 404) await page.getByText('Sorry, the requested page or information is currently unavailable. Please try again.', { exact: true }).waitFor();
  }
  console.log('PASS Error forms and the global status banner hide technical details and show friendly messages');
  assert.deepEqual(pageErrors, []);
} finally { await browser?.close(); await vite?.close(); }

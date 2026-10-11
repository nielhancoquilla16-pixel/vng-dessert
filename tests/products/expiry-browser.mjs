// Real catalog, home page, recommendations and product provider; isolated API fixtures.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an installed playwright/index.mjs path.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const root = fileURLToPath(new URL('../../frontend/', import.meta.url)).replaceAll('\\', '/');
const fixturesId = `${root}__product-expiry-fixtures.jsx`;
const entryId = `${root}__product-expiry-entry.jsx`;
const cutoff = Date.parse('2026-10-04T14:00:00+08:00');
const startTime = cutoff - 60000;
const fixtures = `
const listeners = new Set();
const future = '2026-10-12T14:00:00+08:00';
const row = (id, name, overrides = {}) => ({ id, productName: name, category: 'Dessert', price: 120, stockQuantity: 5, availability: 'available', expiryStatus: 'fresh', expirationAt: future, ...overrides });
export const fixture = window.catalogFixture = {
  reads: 0,
  products: [row('fresh', 'Fresh Flan'), row('due', 'Due Dessert', { expirationAt: '2026-10-04T14:00:00+08:00' }), row('old', 'Old Dessert', { expirationAt: '2026-10-03T14:00:00+08:00', category: 'Expired only' }), row('hidden', 'Hidden Dessert', { availability: 'hidden' }), row('sold-out', 'Sold Out Dessert', { stockQuantity: 0, availability: 'out of stock' })],
  restock() { this.products = this.products.map(product => product.id === 'due' ? { ...product, expirationAt: future } : product); listeners.forEach(fn => fn()); },
};
const customer = { id: 'test-customer', fullName: 'Test Customer', phoneNumber: '09123456789' };
export const useAuth = () => ({ session: null, userRole: 'customer', isAuthLoading: false, isAdmin: false, loggedInCustomer: customer });
export const useCart = () => ({ cartItems: [], addToCart: async () => {} });
export const useShopSettings = () => ({ shopSettings: { openingTime: '00:00', closingTime: '23:59', preorderTimeSlots: [] }, isShopOpen: true, isShopSettingsLoading: false, shopSettingsError: '', operatingHoursLabel: 'All day', closingTimeLabel: '11:59 PM' });
export const usePreOrders = () => ({ createPreOrder: async () => { throw new Error('Unexpected pre-order write'); } });
export const useContent = () => ({ siteVideos: [], defaultVideos: [] });
export const isBackendIssueError = () => false;
export const apiRequest = async (url) => {
  if (url === '/api/products') { fixture.reads++; return fixture.products.map(product => ({ ...product })); }
  if (url === '/api/orders/best-sellers') return { items: fixture.products.map((product, index) => ({ ...product, name: product.productName, soldCount: 10 - index, rank: index + 1 })) };
  throw new Error('Unexpected API request: ' + url);
};
export const subscribeToDatabaseChanges = ({ onChange }) => { listeners.add(onChange); return () => listeners.delete(onChange); };
`;
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProductProvider, useProducts } from '/src/context/ProductContext.jsx';
import { AIProvider, useAI } from '/src/context/AIContext.jsx';
import Products from '/src/pages/Products.jsx';
import Home from '/src/pages/Home.jsx';
import '/src/index.css';
const Probe = () => {
  const { products } = useProducts();
  const { getSmartRecommendations } = useAI();
  return <div hidden><output data-testid="staff-products">{JSON.stringify(products)}</output><output data-testid="recommendations">{getSmartRecommendations('fresh').map(product => product.name).join(',')}</output></div>;
};
createRoot(document.getElementById('root')).render(<BrowserRouter><ProductProvider><AIProvider><Probe /><Routes><Route path="/products" element={<Products />} /><Route path="/" element={<Home />} /></Routes></AIProvider></ProductProvider></BrowserRouter>);
`;

let vite;
let browser;
const failures = [];
const passed = (label) => console.log(`PASS ${label}`);
try {
  vite = await createServer({
    root, configFile: path.join(root, 'vite.config.js'),
    cacheDir: path.join(root, '../tmp/product-expiry-vite-cache'),
    optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'react-router-dom', 'lucide-react'] },
    server: { host: '127.0.0.1', port: 0, open: false },
    plugins: [{
      name: 'isolated-product-expiry-fixtures', enforce: 'pre',
      resolveId(source) {
        if (source === fixturesId || source === entryId) return source;
        if (/\/(AuthContext|CartContext|ShopSettingsContext|PreOrderContext|ContentContext)(\.jsx?)?$/.test(source)
          || /\/lib\/(api|realtime)(\.js)?$/.test(source)) return fixturesId;
        if (source === '/__product-expiry-entry.jsx') return entryId;
      },
      load(id) { if (id === fixturesId) return fixtures; if (id === entryId) return entry; },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!['/', '/products'].includes(req.url?.split('?')[0])) return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(await server.transformIndexHtml(req.url, '<html><body><div id="root"></div><script type="module" src="/__product-expiry-entry.jsx"></script></body></html>'));
        });
      },
    }],
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ timezoneId: 'America/New_York', viewport: { width: 1280, height: 900 } });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    if (/^https:\/\/(fonts\.|www\.openstreetmap\.org)/.test(url)) return route.fulfill({ body: '' });
    failures.push(`Unexpected external request: ${url}`);
    return route.abort();
  });
  const openPage = async (url) => {
    const page = await context.newPage();
    page.on('pageerror', (error) => failures.push(error.message));
    page.setDefaultTimeout(15000);
    await page.clock.install({ time: startTime });
    await page.clock.pauseAt(startTime);
    await page.goto(origin + url);
    await page.getByRole('heading', { name: 'Fresh Flan', exact: true }).first().waitFor();
    return page;
  };
  const catalog = await openPage('/products?product=old');
  assert.equal(await catalog.locator('.shop-product-card').count(), 3);
  assert.equal(await catalog.getByRole('dialog').count(), 0);
  assert.equal(await catalog.getByRole('heading', { name: 'Old Dessert', exact: true }).count(), 0);
  assert.equal(await catalog.getByRole('heading', { name: 'Hidden Dessert', exact: true }).count(), 0);
  assert.equal(await catalog.getByRole('option', { name: 'Expired only', exact: true }).count(), 0);
  assert.equal(await catalog.getByRole('button', { name: 'Out of stock: Sold Out Dessert', exact: true }).isDisabled(), true);
  passed('expired and hidden products are absent from catalog, categories and expired deep links');

  await catalog.getByRole('button', { name: 'View Due Dessert', exact: true }).click();
  assert.equal(await catalog.getByRole('dialog').count(), 1);
  const reads = await catalog.evaluate(() => window.catalogFixture.reads);
  await catalog.clock.runFor(60001);
  await catalog.waitForFunction(() => document.querySelectorAll('.shop-product-card').length === 2);
  assert.equal(await catalog.getByRole('dialog').count(), 0);
  assert.ok(await catalog.evaluate(() => window.catalogFixture.reads) >= reads);
  const staffRows = JSON.parse(await catalog.getByTestId('staff-products').textContent());
  assert.equal(staffRows.length, 5);
  assert.equal(staffRows.find(product => product.id === 'due').availability, 'expired');
  assert.equal(staffRows.find(product => product.id === 'due').stock, 5);
  assert.doesNotMatch(await catalog.getByTestId('recommendations').textContent(), /Due Dessert|Old Dessert|Hidden Dessert/);
  passed('expiry automatically removes the card and detail dialog while public catalog polling preserves staff data');

  await catalog.evaluate(() => window.catalogFixture.restock());
  await catalog.clock.runFor(15001);
  await catalog.getByRole('heading', { name: 'Due Dessert', exact: true }).first().waitFor();
  passed('extending the expiry restores the product through the existing refresh');

  const preOrder = await openPage('/products');
  await preOrder.getByRole('button', { name: 'Pre-order: Due Dessert', exact: true }).click();
  assert.equal(await preOrder.getByRole('dialog').count(), 1);
  await preOrder.clock.runFor(60001);
  await preOrder.waitForFunction(() => document.querySelector('[role="dialog"]') === null);
  passed('an open pre-order closes when the selected product expires');

  const home = await openPage('/');
  assert.doesNotMatch(await home.locator('body').innerText(), /Old Dessert|Hidden Dessert/);
  await home.clock.runFor(60001);
  await home.waitForFunction(() => !document.body.innerText.includes('Due Dessert'));
  passed('home-page best sellers and recommendations stop showing expired products');

  const resumed = await openPage('/products');
  await resumed.clock.setSystemTime(cutoff + 1000);
  await resumed.evaluate(() => window.dispatchEvent(new Event('focus')));
  await resumed.waitForFunction(() => document.querySelectorAll('.shop-product-card').length === 2);
  passed('returning to a suspended tab rechecks expiry');
  assert.deepEqual(failures, []);
} finally {
  await browser?.close();
  await vite?.close();
}

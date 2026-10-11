// Run the real POS component and styles with isolated product/order hooks.
// Usage: set PLAYWRIGHT_MODULE to an installed playwright/index.mjs, then
// node tests/pos/browser.mjs. No accounts, live orders, or database writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an installed playwright/index.mjs path.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const root = fileURLToPath(new URL('../../frontend/', import.meta.url)).replaceAll('\\', '/');
const hooksId = `${root}__pos-hooks.jsx`;
const entryId = `${root}__pos-fixture.jsx`;
const products = [
  { id: 'flan', name: 'Ube Flan', price: 90, stock: 20, category: 'Leche Flan' },
  { id: 'graham', name: 'Mango Graham Float', price: 120, stock: 20, category: 'Special Desserts' },
  { id: 'bars', name: 'Choco Caramel Bars', price: 90, stock: 20, category: 'Pastries' },
  { id: 'cake', name: 'Chocolate Cake', price: 250.5, stock: 20, category: 'Cakes' },
  { id: 'crinkles', name: 'Chocolate Crinkles', price: 35.25, stock: 20, category: 'Cringkles' },
  { id: 'custom', name: 'A new dessert with a long product name', price: 65, stock: 20, category: 'New Category' },
  { id: 'limited', name: 'Last Pastries', price: 50, stock: 2, category: 'Pastries' },
  { id: 'sold-out', name: 'Sold Out Dessert', price: 10, stock: 0, category: 'Leche Flan' },
].map(product => ({ ...product, image: '/logo.png', type: 'product' }));
const hooksSource = `
import { useState } from 'react';
export const useProducts = () => {
  const [products, setProducts] = useState(${JSON.stringify(products)});
  window.setPOSProducts = setProducts;
  return { products, refreshProducts: async () => products, validateStockAvailability: () => ({ isAvailable: true }) };
};
export const useOrders = () => ({
  addOrder: async () => { throw new Error('Checkout is outside this fixture'); },
  updateOrderItems: async () => { throw new Error('Checkout is outside this fixture'); },
});
`;
const entrySource = `
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/tailwind.css';
import '/src/index.css';
import '/src/components/AdminLayout.css';
import AdminPOS from '/src/pages/AdminPOS.jsx';
createRoot(document.getElementById('root')).render(
  <StrictMode><div className="admin-layout"><aside className="admin-sidebar" />
    <main className="admin-main admin-main--pos"><AdminPOS /></main>
  </div></StrictMode>
);
`;
let vite;
let browser;
const pageErrors = [];
const unexpectedRequests = [];
const pass = message => console.log(`PASS ${message}`);
const money = value => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, '')}`;
try {
  vite = await createServer({
    root, configFile: path.join(root, 'vite.config.js'),
    cacheDir: path.join(root, '../tmp/pos-vite-cache'),
    optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'lucide-react'] },
    server: { host: '127.0.0.1', port: 0, open: false },
    plugins: [{
      name: 'isolated-pos-fixture', enforce: 'pre',
      resolveId(source) {
        if (source === hooksId || source === entryId) return source;
        if (/\/context\/(ProductContext|OrderContext)(\.jsx?)?$/.test(source)) return hooksId;
        if (source === '/__pos-fixture.jsx') return entryId;
      },
      load(id) { if (id === hooksId) return hooksSource; if (id === entryId) return entrySource; },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/admin/pos') return next();
          const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__pos-fixture.jsx"></script></body></html>';
          res.setHeader('Content-Type', 'text/html');
          res.end(await server.transformIndexHtml(req.url, html));
        });
      },
    }],
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1920, height: 900 } });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin) && !url.includes('/api/')) return route.continue();
    if (url.startsWith('https://fonts.googleapis.com/')) return route.fulfill({ contentType: 'text/css', body: '' });
    unexpectedRequests.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => pageErrors.push(error.message));
  let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.goto(`${origin}/admin/pos`);
  const rows = page.locator('.pos-cart-item');
  const row = name => rows.filter({ has: page.getByText(name, { exact: true }) });
  const add = name => page.getByRole('button', { name: `Add ${name} to cart`, exact: true });
  const plus = name => page.getByRole('button', { name: `Increase quantity of ${name}`, exact: true });
  const minus = name => page.getByRole('button', { name: `Decrease quantity of ${name}`, exact: true });
  const checkTotals = async value => {
    assert.equal(await page.locator('.pos-total-price-large').innerText(), money(value));
    assert.equal(await page.locator('.pos-subtotal-row span').last().innerText(), money(value));
  };
  const checkItem = async (product, quantity) => {
    const item = row(product.name);
    assert.equal(await item.count(), 1, 'Each product has exactly one cart row');
    assert.ok((await item.innerText()).includes(`${money(product.price)} x ${quantity}`), `${product.name} should show its unit price and quantity ${quantity}`);
    assert.equal(await item.locator('.pos-cart-item-total').innerText(), `Subtotal: ${money(product.price * quantity)}`);
  };
  const checkCartLayout = async () => {
    const geometry = await page.locator('.pos-cart-list').evaluate(list => ({
      height: list.getBoundingClientRect().height,
      contentHeight: list.scrollHeight,
      overflow: getComputedStyle(list).overflowY,
    }));
    assert.ok(geometry.height > 40, `Cart list collapsed: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.height >= geometry.contentHeight - 1 || geometry.overflow === 'visible', 'Cart rows must not be clipped');
  };
  await page.getByText('Cart is empty', { exact: true }).waitFor();
  await checkCartLayout();
  await checkTotals(0);
  for (const product of products.slice(0, 3)) await add(product.name).click();
  await checkCartLayout();
  for (const product of products.slice(0, 3)) await checkItem(product, 1);
  await checkTotals(300);
  pass('Product clicks immediately display names, prices, quantities, and the ₱300 total');

  await add('Ube Flan').click();
  await checkItem(products[0], 2);
  assert.equal(await rows.count(), 3);
  await plus('Ube Flan').click();
  await checkItem(products[0], 3);
  await checkTotals(480);
  await minus('Ube Flan').click();
  await checkItem(products[0], 2);
  await checkTotals(390);
  await minus('Ube Flan').click();
  await minus('Ube Flan').click();
  assert.equal(await row('Ube Flan').count(), 0);
  await checkTotals(210);
  pass('Repeat clicks merge; + and − update totals; quantity zero removes the row');

  await page.getByRole('button', { name: 'Clear Cart', exact: true }).click();
  for (const product of products.filter(product => product.stock > 0)) {
    await add(product.name).click();
    await checkItem(product, 1);
  }
  const allTotal = products.filter(product => product.stock > 0).reduce((sum, product) => sum + product.price, 0);
  await checkTotals(allTotal);
  await page.getByRole('button', { name: 'Cakes', exact: true }).click();
  await add('Chocolate Cake').click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByPlaceholder('Search Dessert...').fill('crinkles');
  await add('Chocolate Crinkles').click();
  await page.getByPlaceholder('Search Dessert...').fill('');
  await checkItem(products[3], 2);
  await checkItem(products[4], 2);
  await checkTotals(allTotal + 250.5 + 35.25);
  pass('All in-stock products, category/search filters, and decimal subtotals work');

  await add('Sold Out Dessert').click();
  assert.equal(await row('Sold Out Dessert').count(), 0);
  await plus('Last Pastries').click();
  await plus('Last Pastries').click();
  await checkItem(products[6], 2);
  await page.evaluate(() => window.setPOSProducts(products => products.map(product => product.id === 'limited' ? { ...product, stock: 3 } : product)));
  await plus('Last Pastries').click();
  await checkItem(products[6], 3);
  await page.evaluate(() => window.setPOSProducts(products => products.map(product => product.id === 'limited' ? { ...product, stock: 1 } : product)));
  await plus('Last Pastries').click();
  await checkItem(products[6], 3);
  await minus('Last Pastries').click();
  await checkItem(products[6], 2);
  pass('Stock limits remain enforced and + uses refreshed stock; − always removes one');

  await page.getByRole('button', { name: 'Cash', exact: true }).click();
  await checkCartLayout();
  await plus('Chocolate Cake').click();
  await checkItem(products[3], 3);
  for (const viewport of [{ width: 1536, height: 720 }, { width: 1920, height: 700 }, { width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await checkCartLayout();
    await minus('Chocolate Cake').click();
    await plus('Chocolate Cake').click();
    await checkItem(products[3], 3);
  }
  pass('Cart stays visible and usable in the cash view and desktop/mobile layouts');

  await page.getByRole('button', { name: 'Clear Cart', exact: true }).click();
  await page.setViewportSize({ width: 1920, height: 900 });
  await add('Ube Flan').evaluate(button => { for (let index = 0; index < 30; index++) button.click(); });
  await checkItem(products[0], 20);
  await checkTotals(1800);
  await page.getByRole('button', { name: 'Remove Ube Flan from cart', exact: true }).click();
  await add('Chocolate Cake').focus();
  await page.keyboard.press('Enter');
  await checkItem(products[3], 1);
  await add('Chocolate Cake').focus();
  await page.keyboard.press('Space');
  await checkItem(products[3], 2);
  await minus('Chocolate Cake').click();
  await minus('Chocolate Cake').click();
  await page.getByText('Cart is empty', { exact: true }).waitFor();
  await checkTotals(0);
  pass('Rapid clicks respect stock; keyboard activation and removing the final item work');

  for (const product of products.slice(0, 3)) await add(product.name).click();
  await checkCartLayout();
  await page.locator('.pos-right').evaluate(panel => { panel.scrollTop = 0; });
  const artifactDir = path.join(root, '../tmp/pos-review');
  await fs.mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, 'cart-desktop.png'), fullPage: true });
  assert.equal(navigations, 1, 'Cart interactions must not reload the page');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(unexpectedRequests, []);
  pass('No page reloads, runtime errors, or backend requests during cart interactions');
} finally {
  await browser?.close();
  await vite?.close();
}

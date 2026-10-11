// Real form + ProductProvider; isolated API storage, no accounts or production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an installed playwright/index.mjs.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const root = fileURLToPath(new URL('../../frontend/', import.meta.url)).replaceAll('\\', '/');
const preview = fileURLToPath(new URL('../../tmp/product-modal-preview/', import.meta.url));
await fs.mkdir(preview, { recursive: true });
const fixtureId = root + '__product-modal-hooks.jsx';
const entryId = root + '__product-modal-entry.jsx';
const fixture = `
const role = new URL(location.href).searchParams.get('role') || 'admin';
const session = { access_token: 'isolated-session' };
export const useAuth = () => ({ userRole: role, session, isAuthLoading: false });
export const subscribeToDatabaseChanges = () => () => {};
export const isBackendIssueError = () => false;
export const apiRequest = async (url, options = {}) => {
  const response = await fetch('/fixture-api' + url, { ...options, headers: { 'Content-Type': 'application/json', 'x-fixture-role': role } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
};`;
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProductProvider } from '/src/context/ProductContext.jsx';
import AdminProducts from '/src/pages/AdminProducts.jsx';
import '/src/index.css';
import '/src/components/AdminLayout.css';
createRoot(document.getElementById('root')).render(<div className="admin-layout"><main className="admin-main"><ProductProvider><AdminProducts /></ProductProvider></main></div>);`;
const rows = [];
const writes = [];
const errors = [];
let origin;
let vite;
let browser;
try {
  vite = await createServer({ root, configFile: path.join(root, 'vite.config.js'),
    cacheDir: path.join(preview, 'vite-cache'), optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'lucide-react'] },
    server: { host: '127.0.0.1', port: 0, open: false },
    plugins: [{ name: 'isolated-product-modal', enforce: 'pre',
      resolveId(source) {
        if ([fixtureId, entryId].includes(source)) return source;
        if (/\/(AuthContext)(\.jsx?)?$/.test(source) || /\/lib\/(api|realtime)(\.js)?$/.test(source)) return fixtureId;
        if (source === '/__product-modal-entry.jsx') return entryId;
      },
      load(id) { if (id === fixtureId) return fixture; if (id === entryId) return entry; },
      configureServer(server) { server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url?.startsWith('/fixture-api')) {
          res.setHeader('Content-Type', 'application/json');
          const apiPath = url.replace('/fixture-api', '');
          if (apiPath === '/api/inventory') return res.end('[]');
          if (req.method === 'GET') {
            return res.end(JSON.stringify(rows.map(row => {
              const product = { ...row };
              if (req.headers['x-fixture-role'] !== 'admin') delete product.costPrice;
              return product;
            })));
          }
          let body = '';
          for await (const chunk of req) body += chunk;
          const payload = JSON.parse(body);
          writes.push(payload);
          let row = rows.find(row => apiPath.endsWith('/' + row.id));
          const created = !row;
          if (!row) { row = { id: 'saved-' + rows.length }; rows.push(row); }
          Object.assign(row, { productName: payload.product_name, price: payload.price, stockQuantity: payload.stock_quantity,
            category: payload.category, description: payload.description, discountEnabled: payload.discount_enabled,
            discountTiers: payload.discount_tiers, imageUrl: payload.image_url?.startsWith('data:') ? origin + '/logo.png' : payload.image_url,
            dateCreated: payload.date_created, expirationDate: payload.expiration_date, expirationTime: payload.expiration_time,
            availability: 'available', ...(Object.hasOwn(payload, 'cost_price') ? { costPrice: payload.cost_price } : {}) });
          res.statusCode = created ? 201 : 200;
          return res.end(JSON.stringify(row));
        }
        if (url !== '/admin/products') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__product-modal-entry.jsx"></script></body></html>'));
      }); },
    }],
  });
  await vite.listen();
  origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1700 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(origin + '/admin/products');
  await page.getByRole('button', { name: 'Add Items' }).click();
  const modal = page.getByRole('dialog');
  await modal.waitFor();
  assert.equal(await page.locator('#product-name').evaluate(element => element === document.activeElement), true);
  await page.getByLabel('Product Name', { exact: false }).fill('Leche Flan Cake (Choco 450g)');
  await page.getByLabel('Cost Price', { exact: false }).fill('80');
  await page.getByLabel('Selling Price', { exact: false }).fill('140');
  await page.locator('#product-stock').fill('50');
  await page.getByRole('switch', { name: 'Enable Discount' }).click();
  assert.equal(await page.locator('.product-preview-badge').count(), 0, 'An incomplete discount is not previewed as free');
  await page.getByLabel('Discounted Price', { exact: false }).fill('125');
  for (const [selector, value] of [['#product-cost', '80'], ['#product-price', '140'], ['#discount-price-0', '125']]) {
    const input = page.locator(selector);
    assert.equal(await input.getAttribute('step'), '1');
    assert.equal(await input.getAttribute('inputmode'), 'numeric');
    await input.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('.');
    assert.equal(await input.inputValue(), value, 'Decimal key is blocked');
    await input.fill('90.05');
    assert.equal(await input.inputValue(), value, 'Decimal changes are rejected');
    await input.evaluate(element => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', '129.99');
      const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer });
      element.dispatchEvent(paste);
      if (!paste.defaultPrevented) throw new Error('Decimal paste was allowed');
      element.stepUp();
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(await input.inputValue(), String(Number(value) + 1), 'Spinner increments by one peso');
    await input.fill(value);
  }
  console.log('PASS whole-peso price fields block decimal typing, changes and paste; spinner increments by one');
  const profit = page.locator('.product-profit-values');
  assert.match(await profit.innerText(), /₱60/);
  assert.match(await profit.innerText(), /42.86%/);
  assert.match(await profit.innerText(), /₱45/);
  assert.match(await profit.innerText(), /₱225/);
  assert.match(await page.locator('.product-preview-savings').innerText(), /Save ₱75/);
  assert.doesNotMatch(await page.locator('.product-live-preview').innerText(), /cost|profit|margin/i);
  await page.getByLabel('Image URL', { exact: true }).fill(origin + '/logo.png');
  await page.waitForFunction(() => document.querySelector('.product-preview-image img')?.naturalWidth > 0);
  await page.getByLabel('Description', { exact: true }).fill('A creamy leche flan cake with rich chocolate.');

  for (const width of [1440, 1024, 768, 540, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1700 : 900 });
    const violations = await modal.evaluate(dialog => {
      const errors = [];
      const bounds = dialog.getBoundingClientRect();
      if (bounds.left < 0 || bounds.right > innerWidth || bounds.bottom > innerHeight + 1) errors.push('Dialog outside viewport');
      if (dialog.scrollWidth > dialog.clientWidth + 1) errors.push('Dialog horizontal overflow');
      const footer = dialog.querySelector('.product-modal-footer').getBoundingClientRect();
      if (footer.bottom > innerHeight || footer.top < 0) errors.push('Footer inaccessible');
      for (const field of dialog.querySelectorAll('input, select, textarea, button')) {
        if (!field.getClientRects().length) continue;
        const box = field.getBoundingClientRect();
        if (box.left < bounds.left - 1 || box.right > bounds.right + 1) errors.push('Control overflow: ' + field.id);
      }
      return errors;
    });
    assert.deepEqual(violations, [], 'Responsive modal at ' + width);
    if (width === 1440 || width === 390) await page.screenshot({ path: path.join(preview, width === 1440 ? 'desktop.png' : 'mobile.png') });
  }
  console.log('PASS reference layout, profit values and accessible footer at 320–1440px');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Add Tier', exact: true }).click();
  await page.locator('#discount-quantity-1').fill('10');
  await page.locator('#discount-price-1').fill('115');
  await page.getByRole('button', { name: 'Advanced Discount Tiers', exact: false }).click();
  await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  assert.equal(writes[0].cost_price, 80);
  assert.deepEqual(writes[0].discount_tiers, [{ minQuantity: 5, price: 125 }, { minQuantity: 10, price: 115 }]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(await page.locator('#product-cost').inputValue(), '80');
  assert.equal(await page.locator('#discount-price-1').inputValue(), '115');
  assert.equal(await page.locator('#product-image-url').inputValue(), origin + '/logo.png');
  await page.locator('#product-cost').fill('130');
  assert.match(await page.locator('.product-profit-warning').innerText(), /below cost/);
  await page.locator('#product-stock').fill('0');
  assert.match(await page.locator('.product-preview-availability').innerText(), /Out of stock/);
  await page.locator('#discount-price-1').fill('130');
  await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  assert.match(await page.locator('.product-form-error').innerText(), /lower price/);
  assert.equal(writes.length, 1);

  await page.locator('#discount-price-1').fill('115');
  await page.locator('#product-cost').fill('80');
  await page.getByRole('button', { name: 'Upload Image', exact: true }).click();
  await page.locator('#product-image-file').setInputFiles({ name: 'dessert.jpg', mimeType: 'image/jpeg', buffer: await fs.readFile(path.join(root, 'public/logo.png')) });
  await page.waitForFunction(() => document.querySelector('.product-preview-image img')?.src.startsWith('data:image/jpeg'));
  await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  assert.ok(writes[1].image_url.startsWith('data:image/jpeg;base64,'));
  console.log('PASS cost/tier/image persistence, edit loading, live stock, loss warning and validation');

  await page.getByRole('button', { name: 'Add Items' }).click();
  await page.locator('#product-name').fill('New dessert without a photo');
  await page.locator('#product-price').fill('90');
  await page.locator('#product-stock').fill('7');
  await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  assert.equal(writes[2].image_url, '');
  assert.equal(writes[2].cost_price, null);
  assert.equal(writes[2].price, 90);
  await page.getByRole('button', { name: 'Add Items' }).click();
  await page.getByRole('button', { name: 'Save Product', exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: 'Close product form' }).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Add Items' }).evaluate(element => element === document.activeElement), true);
  console.log('PASS optional cost/photo, whole-peso prices, focus trap and Escape focus restoration');

  await page.goto(origin + '/admin/products?role=staff');
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  assert.equal(await page.locator('#product-cost').count(), 0);
  assert.equal(await page.locator('.product-profit-panel').count(), 0);
  await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  assert.equal(Object.hasOwn(writes.at(-1), 'cost_price'), false);
  assert.deepEqual(errors, []);
  console.log('PASS staff can manage products without receiving or writing internal costs');
} finally {
  await browser?.close();
  await vite?.close();
}


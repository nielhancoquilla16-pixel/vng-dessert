// Real catalog, cart, checkout, POS and receipt; isolated APIs and existing photos.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an installed playwright/index.mjs.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const root = fileURLToPath(new URL('../../frontend/', import.meta.url)).replaceAll('\\', '/');
const preview = fileURLToPath(new URL('../../tmp/catalog-card-preview/', import.meta.url));
await fs.mkdir(preview, { recursive: true });
let products;
try { products = JSON.parse(await fs.readFile(path.join(preview, 'products.json'), 'utf8')); }
catch { products = [
  ['flan', 'Lecheflan', 90], ['oval', 'Lecheflan Oval', 90], ['round', 'Lecheflan Flat Tub Round', 85],
  ['ube', 'Ube Flan', 105], ['graham', 'Graham de Leche', 110], ['graham-ube', 'Graham de Leche Ube', 130],
  ['halaya', 'Ube Halaya', 90], ['oreo', 'Oreo Graham Float', 110],
].map(([id, productName, price]) => ({ id, productName, price, stockQuantity: 200, imageUrl: '/logo.png' })); }
products = products.map(product => ({ ...product, category: 'Puddings', availability: 'available',
  expirationAt: '2099-12-31T15:59:00Z', expiryStatus: 'fresh' }));
const flan = products.find(product => /^(?:lecheflan|leche flan)(?:\s*\(|$)/i.test(product.productName));
assert.ok(flan);
products.sort((a, b) => a.id === flan.id ? -1 : b.id === flan.id ? 1 : 0);
products.push({ id: 'trio-four', productName: 'MOIST CRINKLES TRIO big 4pcs', price: 75, stockQuantity: 200,
  imageUrl: '/logo.png', availability: 'available', category: 'Crinkles' });
products.push({ id: 'choco-six', productName: 'MOIST CRINKLES CHOCO big 6pcs', price: 80, stockQuantity: 200,
  imageUrl: '/logo.png', availability: 'available', category: 'Crinkles' });
products.push({ id: 'mango-tiramisu', productName: 'Mango Graham TIRAMUSU (500ml Tub)', price: 130, stockQuantity: 200,
  imageUrl: '/logo.png', availability: 'available', category: 'Dessert' });
const fixturesId = `${root}__card-pricing-fixtures.jsx`;
const entryId = `${root}__card-pricing-entry.jsx`;
const blankId = `${root}__card-pricing-blank.jsx`;
const fixtures = `
const customer = { id: 'fixture-customer', fullName: 'Test Customer', phoneNumber: '09123456789', address: 'Test address' };
const settings = { openingTime: '00:00', closingTime: '23:59', preorderTimeSlots: ['10:00'] };
export const fixture = window.pricingFixture = { products: ${JSON.stringify(products)}, orders: [] };
export const useAuth = () => ({ session: null, userRole: 'customer', isAuthLoading: false, isAdmin: false, profile: customer, loggedInCustomer: customer, updateLoggedInCustomer: async () => customer });
export const useShopSettings = () => ({ shopSettings: settings, isShopOpen: true, isShopSettingsLoading: false, shopSettingsError: '', operatingHoursLabel: 'All day', closingTimeLabel: '11:59 PM', refreshShopSettings: async () => settings });
export const useAI = () => ({ queryProductAI: async () => 'Fixture answer' });
export const usePreOrders = () => ({ createPreOrder: async () => { throw new Error('Unexpected pre-order submission'); } });
export const useCustomerAddresses = () => ({ addresses: [], defaultAddress: null, isAddressesLoading: false, hasLoadedAddresses: true });
const saveOrder = async payload => { fixture.orders.push(payload); return { ...payload, id: 'fixture-order', orderCode: 'VG12345', changeAmount: (payload.cashReceived || payload.totalAmount) - payload.totalAmount, updatedAt: new Date().toISOString() }; };
export const useOrders = () => ({ addOrder: saveOrder, updateOrderItems: async (id, payload) => saveOrder(payload) });
export const subscribeToDatabaseChanges = () => () => {};
export const isBackendIssueError = () => false;
export const apiRequest = async url => {
  if (url === '/api/products') return fixture.products.map(product => ({ ...product }));
  if (url === '/api/payments/status') return { configured: true, paymentMethodTypes: ['gcash'] };
  throw new Error('Unexpected API request: ' + url);
};`;
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProductProvider } from '/src/context/ProductContext.jsx';
import { CartProvider, useCart } from '/src/context/CartContext.jsx';
import Header from '/src/components/Header.jsx';
import Products from '/src/pages/Products.jsx';
import Cart from '/src/pages/Cart.jsx';
import Checkout from '/src/pages/Checkout.jsx';
import AdminPOS from '/src/pages/AdminPOS.jsx';
import '/src/index.css';
import '/src/components/Layout.css';
import '/src/components/AdminLayout.css';
const Probe = () => { const { cartItems, cartTotal } = useCart(); return <output hidden data-testid="cart-state">{JSON.stringify({ cartItems, cartTotal })}</output>; };
createRoot(document.getElementById('root')).render(<BrowserRouter><ProductProvider><CartProvider><div className="app-container"><Header/><main className="main-content"><Probe/><Routes>
<Route path="/products" element={<Products/>}/><Route path="/cart" element={<Cart/>}/><Route path="/checkout" element={<Checkout/>}/><Route path="/admin/pos" element={<AdminPOS/>}/>
</Routes></main></div></CartProvider></ProductProvider></BrowserRouter>);`;
let vite;
let browser;
const failures = [];
const pass = message => console.log('PASS ' + message);
try {
  vite = await createServer({ root, configFile: path.join(root, 'vite.config.js'),
    cacheDir: path.join(root, '../tmp/card-pricing-vite-cache'),
    optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'react-router-dom', 'lucide-react'] },
    server: { host: '127.0.0.1', port: 0, open: false },
    plugins: [{ name: 'isolated-card-pricing', enforce: 'pre',
      resolveId(source) {
        if ([fixturesId, entryId, blankId].includes(source)) return source;
        if (/\/(AuthContext|ShopSettingsContext|AIContext|PreOrderContext|CustomerAddressesContext|OrderContext)(\.jsx?)?$/.test(source)
          || /\/lib\/(api|realtime)(\.js)?$/.test(source)) return fixturesId;
        if (/\/(FloatingAI|LocationPinPicker)(\.jsx?)?$/.test(source)) return blankId;
        if (source === '/__card-pricing-entry.jsx') return entryId;
      },
      load(id) { if (id === fixturesId) return fixtures; if (id === entryId) return entry; if (id === blankId) return 'export default function Blank() { return null; }'; },
      configureServer(server) { server.middlewares.use(async (req, res, next) => {
        if (!['/products', '/cart', '/checkout', '/admin/pos'].includes(req.url?.split('?')[0])) return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__card-pricing-entry.jsx"></script></body></html>'));
      }); },
    }],
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => failures.push(error.message));
  page.on('dialog', async dialog => { failures.push(dialog.message()); await dialog.dismiss(); });
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    const product = products.find(product => product.imageUrl && !product.imageUrl.startsWith('/')
      && new URL(product.imageUrl).pathname.split('/').at(-1) === new URL(url).pathname.split('/').at(-1));
    if (product) {
      try { return await route.fulfill({ contentType: 'image/jpeg', body: await fs.readFile(path.join(preview, product.id + '.image')) }); }
      catch { return route.abort(); }
    }
    return route.abort();
  });
  await page.goto(origin + '/products');
  await page.locator('.shop-product-card').first().waitFor();
  for (const image of await page.locator('.shop-product-image').all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(element => element.complete && element.naturalWidth > 0
      ? Promise.resolve() : new Promise(resolve => { element.onload = resolve; element.onerror = resolve; }));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const width of [320, 390, 540, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.evaluate(() => {
      const violations = [];
      const box = element => element.getBoundingClientRect();
      for (const card of document.querySelectorAll('.shop-product-card')) {
        const bounds = box(card);
        const actions = [...card.querySelectorAll('.shop-product-actions button')];
        const [add, preorder] = actions.map(box);
        const quantity = box(card.querySelector('.shop-product-quantity'));
        const image = card.querySelector('.shop-product-image');
        const name = card.querySelector('.shop-product-name button');
        if (bounds.left < -1 || bounds.right > innerWidth + 1) violations.push('Card outside viewport');
        if (Math.abs(add.top - preorder.top) > 1 || Math.abs(add.height - preorder.height) > 1) violations.push('Buttons misaligned');
        if (add.right > preorder.left || preorder.right > bounds.right || add.left < bounds.left) violations.push('Buttons overlap or extend outside card');
        if (quantity.bottom >= add.top) violations.push('Quantity overlaps buttons');
        if (getComputedStyle(image).objectFit !== 'contain') violations.push('Image cropped');
        if (name.scrollHeight > name.clientHeight + 1) violations.push('Name truncated');
        if (actions.some(button => button.scrollWidth > button.clientWidth + 1)) violations.push('Button content clipped');
      }
      return { violations, overflow: document.documentElement.scrollWidth > innerWidth,
        cardBackground: getComputedStyle(document.querySelector('.shop-product-card')).backgroundColor,
        pageBackground: getComputedStyle(document.querySelector('.app-container')).backgroundColor,
        primaryButton: getComputedStyle(document.querySelector('.shop-add-button')).backgroundImage,
        preorderBackground: getComputedStyle(document.querySelector('.shop-preorder-button')).backgroundColor };
    });
    assert.deepEqual(layout.violations, [], `Layout at ${width}px`);
    assert.equal(layout.overflow, false);
    assert.equal(layout.cardBackground, 'rgb(255, 255, 255)');
    assert.equal(layout.pageBackground, 'rgb(255, 250, 243)');
    assert.ok(layout.primaryButton.includes('255, 179, 36') && layout.primaryButton.includes('255, 150, 27'));
    assert.equal(layout.preorderBackground, 'rgb(255, 247, 232)');
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: path.join(preview, width === 390 ? 'mobile.png' : 'desktop.png'), fullPage: true });
      if (width === 390) await page.screenshot({ path: path.join(preview, 'mobile-viewport.png') });
    }
    pass(`Cards fit at ${width}px with the existing colors, full names, whole images and aligned controls`);
  }
  const card = page.locator('.shop-product-card').filter({ has: page.getByRole('heading', { name: flan.productName, exact: true }) });
  const quantity = card.getByRole('spinbutton');
  const price = card.locator('.shop-product-price > span').first();
  const subtotal = card.locator('.shop-product-selection-total strong');
  for (const [count, unit, amount] of [[1, 90, 90], [4, 90, 360], [5, 77, 385], [6, 77, 462]]) {
    await quantity.fill(String(count));
    assert.equal(await price.textContent(), `₱${unit}`);
    assert.equal(await subtotal.textContent(), `₱${amount}`);
  }
  await quantity.fill('4');
  await card.getByRole('button', { name: `Increase quantity of ${flan.productName}` }).click();
  assert.equal(await price.textContent(), '₱77');
  await card.getByRole('button', { name: `Decrease quantity of ${flan.productName}` }).click();
  assert.equal(await price.textContent(), '₱90');
  pass('Manual entry and +/− update price and subtotal immediately for 1, 4, 5 and 6 packs');
  const trio = page.locator('.shop-product-card').filter({ has: page.getByRole('heading', { name: 'MOIST CRINKLES TRIO big 4pcs', exact: true }) });
  for (const [count, unit, amount] of [[1, 75, 75], [4, 75, 300], [5, 63, 315], [6, 63, 378]]) {
    await trio.getByRole('spinbutton').fill(String(count));
    assert.equal(await trio.locator('.shop-product-price > span').first().textContent(), `₱${unit}`);
    assert.equal(await trio.locator('.shop-product-selection-total strong').textContent(), `₱${amount}`);
  }
  pass('The corrected 4-piece Trio uses ₱75 / ₱63, with correct subtotals');
  for (const [name, cases] of [
    ['MOIST CRINKLES CHOCO big 6pcs', [[1, 85, 85], [4, 85, 340], [5, 65, 325], [6, 65, 390]]],
    ['Mango Graham TIRAMUSU (500ml Tub)', [[1, 145, 145], [4, 145, 580], [5, 130, 650], [6, 130, 780]]],
  ]) {
    const correctedCard = page.locator('.shop-product-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
    for (const [count, unit, amount] of cases) {
      await correctedCard.getByRole('spinbutton').fill(String(count));
      assert.equal(await correctedCard.locator('.shop-product-price > span').first().textContent(), `₱${unit}`);
      assert.equal(await correctedCard.locator('.shop-product-selection-total strong').textContent(), `₱${amount}`);
    }
  }
  pass('The confirmed Choco 6-piece and Mango Tiramusu price pairs update correctly at every boundary');
  await quantity.fill('5');
  await card.getByRole('button', { name: `Pre-order: ${flan.productName}` }).click();
  assert.equal(await page.locator('input[name="quantity"]').inputValue(), '5');
  assert.match(await page.getByRole('dialog').textContent(), /₱77 each/);
  await page.getByRole('button', { name: /Close pre-order/ }).click();
  const heart = card.locator('.shop-product-favorite');
  await heart.click();
  assert.equal(await heart.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.reload();
  assert.equal(await card.locator('.shop-product-favorite').getAttribute('aria-pressed'), 'true');
  pass('Pre-order receives the selected pack quantity; favorites persist without opening details');
  await quantity.fill('5');
  await card.getByRole('button', { name: `Add to Cart: ${flan.productName}` }).click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="cart-state"]').textContent).cartTotal === 385);
  await page.goto(origin + '/cart');
  assert.match(await page.locator('.cart-item-price').textContent(), /₱77 each/);
  assert.equal(await page.locator('.cart-item-total').textContent(), '₱385');
  await page.getByRole('button', { name: `Decrease quantity of ${flan.productName}` }).click();
  assert.match(await page.locator('.cart-item-price').textContent(), /₱90 each/);
  assert.equal(await page.locator('.cart-item-total').textContent(), '₱360');
  await page.getByRole('button', { name: `Increase quantity of ${flan.productName}` }).click();
  await page.getByRole('button', { name: 'Proceed to Checkout', exact: true }).click();
  assert.equal(await page.locator('.summary-item-price').textContent(), '₱385');
  assert.match(await page.locator('.checkout-summary').textContent(), /₱435/);
  pass('Cart and Checkout use the same wholesale subtotal and delivery-inclusive total');
  await page.goto(origin + '/admin/pos');
  const posProduct = page.locator('button').filter({ has: page.getByText(flan.productName, { exact: true }) });
  for (let count = 1; count <= 6; count++) {
    await posProduct.click();
    assert.equal(await page.locator('.pos-total-price-large').textContent(), `₱${count < 5 ? 90 * count : 77 * count}`);
  }
  pass('POS quantity changes apply the same regular and wholesale tiers');
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
  await page.locator('#pos-cash-received').fill('1000');
  await page.getByRole('button', { name: 'Complete Order', exact: true }).click();
  await page.locator('.receipt-table-row').waitFor();
  assert.equal(await page.locator('.receipt-table-row .receipt-cell--amount').nth(0).textContent(), '₱77');
  assert.equal(await page.locator('.receipt-table-row .receipt-cell--amount').nth(1).textContent(), '₱462');
  assert.equal(await page.locator('.receipt-summary-row--total strong').textContent(), '₱462');
  const order = await page.evaluate(() => window.pricingFixture.orders.at(-1));
  assert.equal(order.lineItems[0].price, 77);
  assert.equal(order.lineItems[0].quantity, 6);
  assert.equal(order.totalAmount, 462);
  pass('POS submission and the rendered receipt preserve the wholesale unit price, line amount and total');
  assert.deepEqual(failures, []);
} finally {
  await browser?.close();
  await vite?.close();
}

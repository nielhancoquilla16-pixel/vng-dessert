import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root = fileURLToPath(new URL('../../frontend/', import.meta.url)).replaceAll('\\', '/');
const entry = root + '__error-fixture.jsx';
const auth = root + '__error-auth.js';
const code = [
  "import React, { useEffect, useState } from 'react';",
  "import { createRoot } from 'react-dom/client';",
  "import ApiStatusBanner from './src/components/ApiStatusBanner.jsx';",
  "import AppErrorBoundary from './src/components/AppErrorBoundary.jsx';",
  "import { apiRequest } from './src/lib/api.js';",
  "import './src/index.css';",
  "function Crash() { throw new Error('PRIVATE_STACK Supabase SUPABASE_URL=https://secret.example'); }",
  "function Fixture() {",
  " const [error, setError] = useState('');",
  " useEffect(() => { apiRequest('/api/error-fixture').catch(e => setError(e.message)); }, []);",
  " return <><ApiStatusBanner /><p>{error}</p></>;",
  "}",
  "createRoot(document.getElementById('root')).render(<AppErrorBoundary>{location.pathname === '/crash' ? <Crash /> : <Fixture />}</AppErrorBoundary>);",
].join('\n');
const vite = await createServer({
  root,
  configFile: root + 'vite.config.js',
  cacheDir: path.resolve('tmp/error-ui-vite-cache'),
  optimizeDeps: { entries: [], noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react'] },
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
  plugins: [{
    name: 'error-fixture',
    enforce: 'pre',
    resolveId(source) {
      if (source === '/__error-fixture.jsx' || source === entry) return entry;
      if (source.endsWith('/supabase') || source === auth) return auth;
    },
    load(id) {
      if (id === entry) return code;
      if (id === auth) return 'export const supabase = null; export const isSupabaseConfigured = false;';
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!['/', '/crash'].includes(req.url)) return next();
        const html = await server.transformIndexHtml(req.url, '<div id="root"></div><script type="module" src="/__error-fixture.jsx"></script>');
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
      });
    },
  }],
});
let browser;
try {
  await vite.listen();
  const origin = 'http://127.0.0.1:5198';
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext();
  let responseCode = 503;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/error-fixture') {
      return route.fulfill({
        status: responseCode,
        contentType: 'application/json',
        body: JSON.stringify(responseCode === 200 ? { ok: true } : {
          error: 'Supabase SUPABASE_URL https://private.example DNS PRIVATE_STACK',
          stack: 'PRIVATE_STACK',
        }),
      });
    }
    if (url.origin === origin) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  await mkdir('tmp/error-ui', { recursive: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(origin);
    await page.getByText('Error 503', { exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(), /Supabase|SUPABASE|DNS|https|PRIVATE_STACK/);
    await page.getByRole('button', { name: 'Try Again', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: 'tmp/error-ui/banner-' + width + '.png' });
  }
  await page.evaluate(() => localStorage.setItem('sb-fixture-auth', 'keep'));
  responseCode = 200;
  await Promise.all([
    page.waitForNavigation(),
    page.getByRole('button', { name: 'Try Again', exact: true }).click(),
  ]);
  assert.equal(await page.locator('.api-status-banner').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('sb-fixture-auth')), 'keep');
  responseCode = 500;
  await page.goto(origin);
  await page.getByText('Error 500', { exact: true }).waitFor();
  await page.goto(origin + '/crash');
  await page.getByRole('heading', { name: 'Error 500', exact: true }).waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE_STACK|Supabase|SUPABASE|componentStack|https/);
  assert.equal(await page.evaluate(() => localStorage.getItem('sb-fixture-auth')), 'keep');
  console.log('PASS: 503 and 500 banners, mobile layout, retry reload, retained session, and hidden crash diagnostics.');
} finally {
  if (browser) await browser.close();
  await vite.close();
}

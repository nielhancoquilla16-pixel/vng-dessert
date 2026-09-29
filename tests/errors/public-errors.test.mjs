import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import express from '../../dessert-ai-system/node_modules/express/index.js';
import { publicErrorResponses } from '../../dessert-ai-system/server/middleware/publicErrorResponses.js';
import * as serverPolicy from '../../dessert-ai-system/server/lib/publicErrors.js';
import * as clientPolicy from '../../frontend/src/lib/publicErrors.js';

const internal = 'Backend cannot reach Supabase. Set SUPABASE_URL=https://private.example then restart. EACCES at read (server/file.js:10:2)';
const logs = [];
const app = express();
app.use(publicErrorResponses);
app.get('/failure/:status', (req, res) => res.status(Number(req.params.status)).json({
  error: internal,
  checks: [{ table: 'profiles', error: internal }],
  stack: 'PRIVATE_STACK',
  config: { secret: 'PRIVATE_KEY' },
}));
app.get('/validation', (req, res) => res.status(409).json({
  error: 'There is not enough stock for this order.',
  shortages: [{ productName: 'Leche Flan', available: 1, requested: 3, diagnostic: 'PRIVATE_KEY' }],
  attemptsRemaining: 2,
  cooldownSeconds: 60,
  stack: 'PRIVATE_STACK',
}));
app.get('/email-delivery-failure', (req, res) => res.status(503).json({
  error: internal,
  errorCode: 'AUTH_EMAIL_DELIVERY_UNAVAILABLE',
  stack: 'PRIVATE_STACK',
  cooldownSeconds: 60,
}));

for (const [label, policy] of [['server', serverPolicy], ['client', clientPolicy]]) {
  test(label + ': hides unexpected diagnostics and preserves status-specific guidance', () => {
    for (const status of [400, 401, 403, 404, 429, 500, 502, 503, 504]) {
      const message = policy.publicErrorMessage(internal, status);
      assert.doesNotMatch(message, /Supabase|SUPABASE|private|EACCES|server|https|profiles|stack/i);
    }
    assert.equal(policy.publicErrorMessage('PRIVATE_FAILURE', 500), 'Something went wrong. Please try again later.');
    assert.match(policy.publicErrorMessage('', 503), /temporarily unavailable/);
    assert.match(policy.publicErrorMessage('', 404), /could not find/);
    assert.equal(policy.publicErrorMessage('Enter a valid email address.', 400), 'Enter a valid email address.');
    assert.equal(policy.publicErrorMessage('permission denied for table profiles', 403), 'You do not have permission to do that.');
    assert.equal(policy.httpErrorStatus('503'), 503);
    assert.equal(policy.httpErrorStatus('ENOTFOUND'), 500);
  });
  test(label + ': only exposes known business error details', () => {
    assert.deepEqual(policy.publicErrorDetails({
      attemptsRemaining: 0, cooldownSeconds: 20, error: internal, stack: internal,
      shortages: [{ productName: 'Flan', available: 2, requested: 3, secret: 'PRIVATE_KEY' }],
    }, 409), {
      attemptsRemaining: 0, cooldownSeconds: 20,
      shortages: [{ productName: 'Flan', available: 2, requested: 3 }],
    });
    assert.equal(policy.publicErrorDetails({ stack: internal, cooldownSeconds: 1 }, 500), null);
  });
  test(label + ': known email failures use fixed guidance and never expose provider diagnostics', () => {
    const errorCode = 'AUTH_EMAIL_DELIVERY_UNAVAILABLE';
    assert.equal(policy.publicErrorMessage(internal, 503, errorCode),
      'We could not send your verification email. Please try again later or contact the shop for help.');
    assert.deepEqual(policy.publicErrorDetails({ errorCode, stack: internal, cooldownSeconds: 60 }, 503), { errorCode });
    assert.equal(policy.publicErrorDetails({ errorCode: 'PRIVATE_FAILURE', stack: internal }, 503), null);
    assert.equal(policy.publicErrorDetails({ errorCode }, 500), null);
    assert.equal(policy.publicErrorMessage(internal, 503, 'PRIVATE_FAILURE'), policy.publicErrorMessage('', 503));
    assert.equal(policy.publicErrorMessage(internal, 500, errorCode), policy.publicErrorMessage('', 500));
  });
}

test('HTTP responses hide diagnostics while server logs retain the cause', async (t) => {
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const status of [400, 404, 500, 503]) {
    const response = await fetch(origin + '/failure/' + status);
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, status);
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE|Supabase|SUPABASE|profiles|https|EACCES|stack|config|checks/i);
  }
  assert.ok(logs.some((entry) => entry[1].diagnostic.error === internal));
  const validation = await (await fetch(origin + '/validation')).json();
  assert.equal(validation.error, 'There is not enough stock for this order.');
  assert.equal(validation.attemptsRemaining, 2);
  assert.deepEqual(validation.shortages, [{ productName: 'Leche Flan', available: 1, requested: 3 }]);
  assert.doesNotMatch(JSON.stringify(validation), /PRIVATE|stack|diagnostic/);
  const emailFailure = await (await fetch(origin + '/email-delivery-failure')).json();
  assert.equal(emailFailure.errorCode, 'AUTH_EMAIL_DELIVERY_UNAVAILABLE');
  assert.match(emailFailure.message, /could not send your verification email/i);
  assert.doesNotMatch(JSON.stringify(emailFailure), /PRIVATE|Supabase|SUPABASE|https|stack|cooldownSeconds/i);
});

// Provide Vite's environment and an inert auth client without contacting external systems.
const loadApi = async () => {
  let source = await readFile(new URL('../../frontend/src/lib/api.js', import.meta.url), 'utf8');
  source = source.replace(/import \{ supabase, isSupabaseConfigured \} from '.\/supabase';/, 'const supabase = null; const isSupabaseConfigured = false;');
  source = source.replace("'./publicErrors'", JSON.stringify(new URL('../../frontend/src/lib/publicErrors.js', import.meta.url).href));
  source = source.replaceAll('import.meta.env', '({ DEV: true, VITE_API_BASE_URL: "http://localhost:3001" })');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
};

test('client retains HTTP codes, protects details and does not dismiss failures after unrelated success', async (t) => {
  const api = await loadApi();
  const mockFetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: internal, checks: [{ error: internal }], stack: internal,
  }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(api.apiRequest('/api/products'), (error) => {
    assert.equal(error.status, 503);
    assert.match(error.message, /^Error 503: /);
    assert.doesNotMatch(error.message, /Supabase|SUPABASE|EACCES|https/);
    assert.equal(error.details, null);
    return true;
  });
  assert.equal(api.getApiStatus().code, 503);
  mockFetch.mock.mockImplementation(async () => new Response('{"status":"ok"}', { headers: { 'Content-Type': 'application/json' } }));
  await api.apiRequest('/api/another-page');
  await api.probeApiHealth();
  assert.equal(api.getApiStatus().code, 503, 'unrelated successes must not erase a failed data request');
  await api.apiRequest('/api/products');
  assert.equal(api.getApiStatus().level, 'idle');
  mockFetch.mock.mockImplementation(async () => new Response('{invalid diagnostic JSON', { status: 500, headers: { 'Content-Type': 'application/json' } }));
  t.mock.method(console, 'error', () => {});
  await assert.rejects(api.apiRequest('/api/broken-response'), (error) => {
    assert.equal(error.status, 500);
    assert.equal(error.userMessage, 'Something went wrong. Please try again later.');
    return true;
  });
  mockFetch.mock.mockImplementation(async () => new Response('Cannot GET /api/private-route', { status: 404 }));
  await assert.rejects(api.apiRequest('/api/missing'), (error) => {
    assert.equal(error.status, 404);
    assert.match(error.message, /^Error 404: /);
    assert.doesNotMatch(error.message, /api|private-route/i);
    return true;
  });
  mockFetch.mock.mockImplementation(async () => { throw new TypeError('fetch failed: PRIVATE_HOST'); });
  await assert.rejects(api.apiRequest('/api/offline', {}, { skipRecovery: true }), (error) => {
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /PRIVATE|fetch/);
    return true;
  });
  api.clearApiStatus();
});

test('email delivery failures stay on the signup form without hiding unrelated service failures', async (t) => {
  const api = await loadApi();
  api.clearApiStatus();
  t.after(() => api.clearApiStatus());
  const mockFetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: internal, errorCode: 'AUTH_EMAIL_DELIVERY_UNAVAILABLE', stack: internal,
  }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
  for (const path of ['/api/auth/register', '/api/auth/register/resend-link']) {
    await assert.rejects(api.apiRequest(path, { method: 'POST' }), (error) => {
      assert.equal(error.status, 503);
      assert.match(error.userMessage, /could not send your verification email/i);
      assert.deepEqual(error.details, { errorCode: 'AUTH_EMAIL_DELIVERY_UNAVAILABLE' });
      assert.doesNotMatch(error.message, /Supabase|PRIVATE|https|EACCES/i);
      return true;
    });
    assert.equal(api.getApiStatus().level, 'idle');
  }
  mockFetch.mock.mockImplementation(async () => new Response(JSON.stringify({ error: internal }), {
    status: 500, headers: { 'Content-Type': 'application/json' },
  }));
  await assert.rejects(api.apiRequest('/api/products'));
  assert.equal(api.getApiStatus().code, 500);
  mockFetch.mock.mockImplementation(async () => new Response(JSON.stringify({
    error: internal, errorCode: 'AUTH_EMAIL_DELIVERY_UNAVAILABLE',
  }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(api.apiRequest('/api/auth/register'));
  assert.equal(api.getApiStatus().code, 500);
  assert.equal(api.getApiStatus().path, '/api/products');
  mockFetch.mock.mockImplementation(async () => new Response(JSON.stringify({ error: internal }), {
    status: 500, headers: { 'Content-Type': 'application/json' },
  }));
  await assert.rejects(api.apiRequest('/api/auth/register'));
  assert.equal(api.getApiStatus().path, '/api/auth/register');
});

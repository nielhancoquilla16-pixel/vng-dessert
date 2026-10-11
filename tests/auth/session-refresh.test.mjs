import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let moduleId = 0;
const loadApi = async (client, clearStorage) => {
  const key = `__sessionRefreshTest${++moduleId}`;
  globalThis[key] = { client, clearStorage };
  let source = await readFile(new URL('../../frontend/src/lib/api.js', import.meta.url), 'utf8');
  source = source.replace(/import \{ supabase, isSupabaseConfigured, clearSupabaseSessionStorage \} from '.\/supabase';/,
    `const supabase = globalThis[${JSON.stringify(key)}].client; const clearSupabaseSessionStorage = globalThis[${JSON.stringify(key)}].clearStorage; const isSupabaseConfigured = true;`);
  source = source.replace("'./publicErrors'", JSON.stringify(new URL('../../frontend/src/lib/publicErrors.js', import.meta.url).href));
  source = source.replaceAll('import.meta.env', '({ DEV: true, VITE_API_BASE_URL: "https://vng-dessert-production.up.railway.app" })');
  const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  delete globalThis[key];
  return api;
};
const sessionFixture = async () => {
  const state = { session: { access_token: 'current-token' }, refreshes: 0, signOuts: 0, clears: 0 };
  const auth = {
    getSession: async () => ({ data: { session: state.session }, error: null }),
    refreshSession: async () => {
      state.refreshes++;
      state.session = { access_token: 'fresh-token' };
      return { data: { session: state.session }, error: null };
    },
    signOut: async (options) => {
      assert.equal(options.scope, 'local');
      state.signOuts++;
      state.session = null;
      return { error: null };
    },
  };
  return { state, auth, api: await loadApi({ auth }, () => { state.clears++; }) };
};
const response = (status) => new Response(JSON.stringify(status === 200 ? { ok: true } : { error: 'Please sign in to continue.' }), {
  status, headers: { 'Content-Type': 'application/json' },
});

test('requests use the current session instead of a token captured in React', async (t) => {
  const { api } = await sessionFixture();
  const sentTokens = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sentTokens.push(options.headers.get('Authorization'));
    return response(200);
  });
  await api.apiRequest('/api/orders/mine', {}, { auth: true, accessToken: 'old-react-token' });
  assert.deepEqual(sentTokens, ['Bearer current-token']);
});

test('concurrent 401 responses share one refresh and retry with the renewed token', async (t) => {
  const { api, auth, state } = await sessionFixture();
  let completeRefresh;
  auth.refreshSession = async () => {
    state.refreshes++;
    await new Promise((resolve) => { completeRefresh = resolve; });
    state.session = { access_token: 'fresh-token' };
    return { data: { session: state.session }, error: null };
  };
  const tokens = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const token = options.headers.get('Authorization');
    tokens.push(token);
    return response(token === 'Bearer fresh-token' ? 200 : 401);
  });
  const requests = Promise.all([
    api.apiRequest('/api/orders/mine', {}, { auth: true, accessToken: 'old-react-token' }),
    api.apiRequest('/api/inventory', {}, { auth: true, accessToken: 'old-react-token' }),
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.refreshes, 1);
  completeRefresh();
  assert.deepEqual(await requests, [{ ok: true }, { ok: true }]);
  assert.equal(tokens.filter((token) => token === 'Bearer fresh-token').length, 2);
  assert.equal(state.signOuts, 0);
});

test('a delayed rejection reuses an already renewed session without another refresh', async (t) => {
  const { api, state } = await sessionFixture();
  let releaseDelayed;
  const delayed = new Promise((resolve) => { releaseDelayed = resolve; });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.headers.get('Authorization') === 'Bearer fresh-token') return response(200);
    if (url.endsWith('/two')) await delayed;
    return response(401);
  });
  const first = api.apiRequest('/one', {}, { auth: true });
  const second = api.apiRequest('/two', {}, { auth: true });
  await first;
  releaseDelayed();
  await second;
  assert.equal(state.refreshes, 1);
  assert.equal(state.signOuts, 0);
});

test('an invalid refresh token clears the local session and stops stale-token requests', async (t) => {
  const { api, auth, state } = await sessionFixture();
  auth.refreshSession = async () => {
    state.refreshes++;
    return { data: { session: null }, error: { status: 400, code: 'refresh_token_not_found' } };
  };
  const fetch = t.mock.method(globalThis, 'fetch', async () => response(401));
  await assert.rejects(api.apiRequest('/api/orders/mine', {}, { auth: true }), { status: 401 });
  assert.equal(state.signOuts, 1);
  assert.equal(state.clears, 1);
  await assert.rejects(api.apiRequest('/api/orders/mine', {}, { auth: true, accessToken: 'old-react-token' }), { status: 401 });
  assert.equal(fetch.mock.callCount(), 1);
});

test('a renewed token rejected by the backend gets at most one retry', async (t) => {
  const { api, state } = await sessionFixture();
  const fetch = t.mock.method(globalThis, 'fetch', async () => response(401));
  await assert.rejects(api.apiRequest('/api/orders/mine', {}, { auth: true }), { status: 401 });
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(state.refreshes, 1);
  assert.equal(state.signOuts, 1);
});

test('temporary refresh failures preserve the session and report service unavailability', async (t) => {
  const { api, auth, state } = await sessionFixture();
  auth.refreshSession = async () => ({ data: { session: null }, error: { status: 503, name: 'AuthRetryableFetchError' } });
  const fetch = t.mock.method(globalThis, 'fetch', async () => response(401));
  await assert.rejects(api.apiRequest('/api/orders/mine', {}, { auth: true }), { status: 503 });
  assert.equal(state.signOuts, 0);
  assert.equal(state.clears, 0);
  assert.equal(fetch.mock.callCount(), 1);
});

test('permission denials and public login failures do not refresh or sign out', async (t) => {
  const { api, state } = await sessionFixture();
  const fetch = t.mock.method(globalThis, 'fetch', async () => response(403));
  await assert.rejects(api.apiRequest('/api/profiles/staff', {}, { auth: true }), { status: 403 });
  fetch.mock.mockImplementation(async () => response(401));
  await assert.rejects(api.apiRequest('/api/auth/resolve-login'), { status: 401 });
  assert.equal(state.refreshes, 0);
  assert.equal(state.signOuts, 0);
});

test('a delayed 401 does not clear a newer session after the retry limit', async (t) => {
  const { api, state } = await sessionFixture();
  t.mock.method(globalThis, 'fetch', async () => {
    state.session = { access_token: 'newer-sign-in-token' };
    return response(401);
  });
  await assert.rejects(api.apiRequest('/api/orders/mine', {}, { auth: true, skipSessionRefresh: true }), { status: 401 });
  assert.equal(state.signOuts, 0);
  assert.equal(state.clears, 0);
});

import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from '../../dessert-ai-system/node_modules/express/index.js';
import * as realSupabase from '../../dessert-ai-system/server/lib/supabaseAdmin.js';

let supabaseCalls = 0;
mock.module('../../dessert-ai-system/server/lib/supabaseAdmin.js', {
  namedExports: {
    ...realSupabase,
    getSupabaseAdmin: () => {
      supabaseCalls += 1;
      throw new Error('Profile update must stop before accessing Supabase.');
    },
  },
});
mock.module('../../dessert-ai-system/server/middleware/requireAuth.js', {
  namedExports: {
    requireAuth: (req, res, next) => {
      req.authUser = { id: 'test-customer', user_metadata: {} };
      req.profile = { id: 'test-customer', role: 'customer', phone_number: '09123456789' };
      next();
    },
  },
});

const { default: profilesRouter } = await import('../../dessert-ai-system/server/routes/profiles.js');
const app = express();
app.use(express.json());
app.use('/api/profiles', profilesRouter);
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
let server;
let origin;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('customer profile route rejects malformed phone numbers before writing the profile', async () => {
  for (const phoneNumber of ['0962897165', '096289716599', '0962897165a', '09628 971659', '+9628971659', '']) {
    const response = await fetch(`${origin}/api/profiles/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phoneNumber }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Phone number must contain exactly 11 digits.',
    });
  }
  assert.equal(supabaseCalls, 0);
});

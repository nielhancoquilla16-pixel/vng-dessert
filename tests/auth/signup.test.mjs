// Run with node --experimental-test-module-mocks --test tests/auth/signup.test.mjs
import test, { before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from '../../dessert-ai-system/node_modules/express/index.js';
import * as realSupabase from '../../dessert-ai-system/server/lib/supabaseAdmin.js';
import { normalizeAuthEmailError } from '../../dessert-ai-system/server/lib/authEmailErrors.js';
import { publicErrorMessage } from '../../dessert-ai-system/server/lib/publicErrors.js';
import { publicErrorResponses } from '../../dessert-ai-system/server/middleware/publicErrorResponses.js';
import { httpErrorStatus } from '../../dessert-ai-system/server/lib/publicErrors.js';

let signupError;
let resendError;
let existingProfile;
let calls;
let caughtErrors;
const profile = {
  id: 'new-customer', username: 'newcustomer', email: 'new@gmail.com',
  full_name: 'New Customer', role: 'customer', email_verified: false,
  email_verification_sent_at: '2020-01-01T00:00:00Z',
};
const deliveryMessage = 'We could not send your verification email. Please try again later or contact the shop for help.';

const database = {
  from(table) {
    let action = 'select';
    let value;
    const query = {
      select: () => query,
      ilike: () => query,
      eq: () => query,
      maybeSingle: () => query,
      single: () => query,
      insert: (input) => { action = 'insert'; value = input; return query; },
      update: (input) => { action = 'update'; value = input; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (table === 'audit_logs') {
            if (action === 'insert') calls.auditLogs.push(value);
            return { data: null, error: null };
          }
          assert.equal(table, 'profiles');
          if (action === 'insert') {
            calls.profileInserts.push(value);
            return { data: { ...value, created_at: '2026-09-29T00:00:00Z' }, error: null };
          }
          if (action === 'update') {
            calls.profileUpdates.push(value);
            return { data: null, error: null };
          }
          return { data: existingProfile, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  },
  auth: {
    admin: {
      listUsers: async () => ({ data: { users: [] }, error: null }),
      deleteUser: async (id) => { calls.userDeletes.push(id); return { error: null }; },
    },
  },
};
const anon = {
  auth: {
    signUp: async (input) => {
      calls.signups.push(input);
      return signupError
        ? { data: { user: null }, error: signupError }
        : { data: { user: { id: profile.id } }, error: null };
    },
    resend: async (input) => { calls.resends.push(input); return { error: resendError }; },
  },
};

mock.module('../../dessert-ai-system/server/lib/supabaseAdmin.js', {
  namedExports: { ...realSupabase, getSupabaseAdmin: () => database, getSupabaseAnon: () => anon },
});
const { default: authRouter } = await import('../../dessert-ai-system/server/routes/auth.js');
const app = express();
app.use(express.json());
app.use(publicErrorResponses);
app.use('/api/auth', authRouter);
app.use((error, req, res, next) => {
  caughtErrors.push(error);
  res.locals.errorLogged = true;
  res.status(httpErrorStatus(error?.status)).json({ error: error?.message, errorCode: error?.errorCode });
});
let server;
let origin;
before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
  signupError = null;
  resendError = null;
  existingProfile = null;
  caughtErrors = [];
  calls = { signups: [], resends: [], profileInserts: [], profileUpdates: [], userDeletes: [], auditLogs: [] };
});

const post = async (path, body) => {
  const response = await fetch(origin + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const register = async ({ email = profile.email, full_name = profile.full_name } = {}) => {
  const captcha = await (await fetch(origin + '/api/auth/captcha')).json();
  const answer = captcha.question.split(' + ').reduce((sum, value) => sum + Number(value), 0);
  return post('/api/auth/register', {
    email, username: profile.username, password: 'Testing123!',
    full_name, terms_accepted: true,
    captcha_id: captcha.id, captcha_answer: String(answer),
  });
};

test('successful signup stores an unverified customer and requires email verification', async () => {
  const result = await register();
  assert.equal(result.status, 201);
  assert.equal(result.body.needsVerification, true);
  assert.equal(result.body.emailVerified, false);
  assert.equal(calls.signups.length, 1);
  assert.equal(calls.profileInserts.length, 1);
  assert.equal(calls.profileInserts[0].email_verified, false);
  assert.ok(calls.profileInserts[0].email_verification_sent_at);
  assert.equal(calls.userDeletes.length, 0);
  assert.equal(caughtErrors.length, 0);
});

test('invalid Gmail formats and non-Gmail domains are recorded for admin review', async () => {
  for (const email of ['customer@gmail.con', 'rojog59907@caps7.com']) {
    const result = await register({ email, full_name: 'Juan Dela Cruz' });
    assert.equal(result.status, 400);
    assert.equal(result.body.errorCode, 'INVALID_GMAIL_REGISTRATION');
    assert.match(publicErrorMessage(result.body.error, result.status, result.body.errorCode), /Gmail address/);
  }

  assert.equal(calls.signups.length, 0);
  assert.equal(calls.auditLogs.length, 2);
  assert.equal(calls.auditLogs[0].action, 'invalid_gmail_registration');
  assert.equal(calls.auditLogs[0].metadata.customerName, 'Juan Dela Cruz');
  assert.equal(calls.auditLogs[0].metadata.email, 'customer@gmail.con');
  assert.match(calls.auditLogs[0].metadata.status, /Invalid/);
  assert.ok(calls.auditLogs[0].metadata.registrationAttemptAt);
});

test('confirmation email failure returns safe guidance without profile writes or account deletion', async () => {
  signupError = Object.assign(new Error('Error sending confirmation email'), { status: 500, code: 'unexpected_failure' });
  const result = await register();
  assert.equal(result.status, 503);
  assert.equal(result.body.errorCode, 'AUTH_EMAIL_DELIVERY_UNAVAILABLE');
  assert.equal(result.body.error, deliveryMessage);
  assert.equal(result.body.needsVerification, undefined);
  assert.equal(result.body.success, undefined);
  assert.equal(calls.profileInserts.length, 0);
  assert.equal(calls.userDeletes.length, 0);
  assert.equal(caughtErrors[0].cause, signupError);
  assert.equal(calls.auditLogs.length, 1);
  assert.equal(calls.auditLogs[0].metadata.status, 'Unverified/unconfirmed Gmail address');
  assert.match(calls.auditLogs[0].metadata.reason, /does not prove.*fake/i);
  assert.doesNotMatch(JSON.stringify(result.body), /unexpected_failure|Error sending confirmation|Testing123|new@example|stack|cause/);
});

test('an email provider rejection of a Gmail address is recorded as invalid', async () => {
  signupError = Object.assign(new Error('Email address invalid'), {
    status: 400,
    code: 'email_address_invalid',
  });
  const result = await register();
  assert.equal(result.status, 400);
  assert.equal(calls.auditLogs.length, 1);
  assert.equal(calls.auditLogs[0].metadata.status, 'Invalid Gmail address');
  assert.match(calls.auditLogs[0].metadata.reason, /provider rejected/i);
});

test('signup rate limiting preserves its original status and error', async () => {
  signupError = Object.assign(new Error('Please wait before requesting another verification email.'), {
    status: 429, code: 'over_email_send_rate_limit',
  });
  const result = await register();
  assert.equal(result.status, 429);
  assert.equal(result.body.error, signupError.message);
  assert.equal(result.body.errorCode, undefined);
  assert.equal(caughtErrors[0], signupError);
  assert.equal(calls.profileInserts.length, 0);
});

test('resend failure leaves the last successful send timestamp unchanged', async () => {
  existingProfile = { ...profile };
  resendError = Object.assign(new Error('Error sending confirmation email'), { status: 500 });
  const result = await post('/api/auth/register/resend-link', { email: profile.email });
  assert.equal(result.status, 503);
  assert.equal(result.body.errorCode, 'AUTH_EMAIL_DELIVERY_UNAVAILABLE');
  assert.equal(result.body.error, deliveryMessage);
  assert.equal(calls.resends.length, 1);
  assert.equal(calls.profileUpdates.length, 0);
  assert.equal(calls.auditLogs.length, 1);
  assert.equal(calls.auditLogs[0].metadata.status, 'Unverified/unconfirmed Gmail address');
  assert.equal(existingProfile.email_verification_sent_at, profile.email_verification_sent_at);
  assert.equal(result.body.success, undefined);
  assert.equal(caughtErrors[0].cause, resendError);
});

test('only recognized auth email delivery failures are normalized', () => {
  for (const original of [
    Object.assign(new Error('Recipient not permitted'), { code: 'email_address_not_authorized', status: 403 }),
    Object.assign(new Error('Error sending magic link email'), { status: 500 }),
  ]) {
    const result = normalizeAuthEmailError(original);
    assert.equal(result.status, 503);
    assert.equal(result.errorCode, 'AUTH_EMAIL_DELIVERY_UNAVAILABLE');
    assert.equal(result.cause, original);
  }
  for (const original of [
    Object.assign(new Error('Database error saving new user'), { status: 500, code: 'unexpected_failure' }),
    Object.assign(new Error('Email rate limit exceeded'), { status: 429, code: 'over_email_send_rate_limit' }),
    Object.assign(new Error('Signups not allowed'), { status: 403, code: 'signup_disabled' }),
    Object.assign(new Error('Error sending recovery email'), { status: 500 }),
    null,
  ]) {
    assert.equal(normalizeAuthEmailError(original), original);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalGmailAddress, isBlockedGmailMailbox, validateRegistrationEmail } from '../../dessert-ai-system/shared/registrationEmail.js';
import { isBlockedCustomerMailbox, validateCustomerRegistrationEmail } from '../../dessert-ai-system/server/lib/registrationEmail.js';
import { createRegistrationGuard } from '../../dessert-ai-system/server/middleware/registrationGuard.js';
import { createRequestLimiter } from '../../dessert-ai-system/server/middleware/rateLimit.js';

test('normal names, dots, years, accents transliterated to ASCII and Gmail aliases remain accepted', () => {
  for (const address of [
    'customername@gmail.com', 'customer.name@gmail.com', 'juan.delacruz1995@gmail.com',
    'maria.josephine.delacruz@gmail.com', 'h.a.n.i.e.l.c.o.q.u.i.l.a@gmail.com',
    'krzysztof.kowalski@gmail.com', 'nguyenvanthanh@gmail.com', 'a.b.c.d.e.f@gmail.com',
    'mariadelosangelesdelacruz@gmail.com', 'johnsmith19871231@gmail.com',
    ' John.Smith@gmail.com ', 'john.smith+orders@gmail.com',
    'j.o.h.n.s.m.i.t.h.j.r@gmail.com', 'slothful.customer@gmail.com',
    'j.o.h.n.s.c.h.w.a.r.t.z@gmail.com', 'john.smith+kemp@gmail.com',
    'annamariaannamaria@gmail.com', 'maria.maria.annamaria@gmail.com',
    'massive.customer@gmail.com',
  ]) assert.equal(validateRegistrationEmail(address).valid, true, address);
});

test('both newly reported mailboxes and every canonical alias are blocked', () => {
  for (const base of ['massivecvn', 'kajaahahaggjahagafa']) {
    for (const local of [base, [...base].join('.'), base.toUpperCase(), base + '+kemp', [...base].join('.') + '+different']) {
      const email = local + '@gmail.com';
      const result = validateRegistrationEmail(email);
      assert.equal(result.valid, false, email);
      assert.equal(result.reason, 'disposable_mailbox');
      assert.equal(result.canonicalEmail, base + '@gmail.com');
      assert.equal(isBlockedCustomerMailbox(email), true);
    }
  }
});

test('new generated username checks reject unseen keyboard-mashed and short consonant-heavy usernames', () => {
  for (const base of ['bajaahahaggjahagafa', 'hajaahahaggjahagafa', 'kjhgfdsmnbv']) {
    for (const local of [base, [...base].join('.'), base + '+kemp', base + '2026']) {
      const result = validateRegistrationEmail(local + '@gmail.com');
      assert.equal(result.valid, false, local);
      assert.equal(result.reason, 'suspicious_pattern');
      assert.ok(result.signals.length >= 2);
    }
  }
  const result = validateRegistrationEmail('bajaahahaggjahagafa@gmail.com');
  assert.deepEqual(result.signals, ['low_character_diversity', 'dominant_character', 'repeated_short_sequences']);
});

test('reported public Gmail inbox is blocked regardless of dots, case or delivery aliases', () => {
  for (const email of [
    's.lo.t.hfuln.m.w@gmail.com', 'slothfulnmw@gmail.com',
    'SLOTHFULNMW@gmail.com', 's.l.o.t.h.f.u.l.n.m.w+signup@gmail.com',
    'slothfulnmw+another123@gmail.com',
  ]) {
    const result = validateRegistrationEmail(email);
    assert.equal(result.valid, false, email);
    assert.equal(result.reason, 'disposable_mailbox');
    assert.deepEqual(result.signals, ['known_disposable_mailbox']);
    assert.equal(result.canonicalEmail, 'slothfulnmw@gmail.com');
    assert.equal(isBlockedGmailMailbox(email), true);
  }
  assert.equal(validateRegistrationEmail('slothfulnmw@gmail.com', { blockedMailboxes: [] }).valid, false);
  assert.equal(validateRegistrationEmail('slothful.customer@gmail.com').valid, true);
});

test('backend mailbox intelligence is canonical and cannot replace built-in blocks', (t) => {
  const previous = process.env.REGISTRATION_BLOCKED_GMAIL_MAILBOXES;
  t.after(() => {
    if (previous === undefined) delete process.env.REGISTRATION_BLOCKED_GMAIL_MAILBOXES;
    else process.env.REGISTRATION_BLOCKED_GMAIL_MAILBOXES = previous;
  });
  process.env.REGISTRATION_BLOCKED_GMAIL_MAILBOXES = 'public.inbox@gmail.com; another.public@gmail.com';
  assert.equal(validateRegistrationEmail('publicinbox@gmail.com').valid, true);
  assert.equal(validateCustomerRegistrationEmail('p.u.b.l.i.c.i.n.b.o.x+new@gmail.com').reason, 'disposable_mailbox');
  assert.equal(isBlockedCustomerMailbox('ANOTHERPUBLIC@gmail.com'), true);
  assert.equal(validateCustomerRegistrationEmail('slothfulnmw@gmail.com').valid, false);
  assert.equal(validateCustomerRegistrationEmail('customer.name@gmail.com').valid, true);
});

test('only multiple suspicious signals trigger a pattern rejection', () => {
  for (const address of [
    'v.jzh.z.hdb.b.d.u.d.hj.db@gmail.com',
    'x7k2m9q4r8v1z6b3n0d5s2t8@gmail.com',
    'qxjzvbnmrtslkdfghwpc@gmail.com',
    'a1b2c3d4e5f6a7b8c9d0e1f2@gmail.com',
  ]) {
    const result = validateRegistrationEmail(address);
    assert.equal(result.valid, false, address);
    assert.equal(result.reason, 'suspicious_pattern');
    assert.ok(result.signals.length >= 2);
  }
});

test('disposable, googlemail, lookalike domains, malformed and oversized input are rejected', () => {
  for (const value of [
    'customer@mailinator.com', 'customer@10minutemail.com', 'customer@sub.yopmail.com',
    'customer@guerrillamail.com', 'customer@googlemail.com', 'customer@gmail.com.evil.test',
    'customer@ɡmail.com', 'customer@GMAIL.COM\nBcc: other@gmail.com',
    '.customer@gmail.com', 'customer.@gmail.com', 'customer..name@gmail.com',
    'customer_name@gmail.com', 'customer-name@gmail.com', 'customer@@gmail.com',
    'customer name@gmail.com', 'a'.repeat(31) + '@gmail.com', ['customer@gmail.com'], {}, null,
  ]) assert.equal(validateRegistrationEmail(value).valid, false, String(value));
});

test('dot and plus aliases have the same mailbox key', () => {
  const canonical = 'customername@gmail.com';
  for (const value of ['customer.name@gmail.com', 'CUSTOMERNAME@gmail.com', 'c.u.s.t.o.m.e.r.n.a.m.e+orders@gmail.com']) {
    assert.equal(canonicalGmailAddress(value), canonical);
  }
});

test('rate limits have a bounded memory size and reopen after the window', () => {
  let time = 0;
  const limiter = createRequestLimiter({ limit: 2, windowMs: 1000, maxEntries: 2, now: () => time });
  assert.equal(limiter.consume('one').allowed, true);
  assert.equal(limiter.consume('one').allowed, true);
  assert.equal(limiter.consume('one').allowed, false);
  assert.equal(limiter.consume('two').allowed, true);
  assert.equal(limiter.consume('three').allowed, false);
  time = 1001;
  assert.equal(limiter.consume('one').allowed, true);
  assert.equal(limiter.consume('three').allowed, true);
});

const guardFixture = (history = []) => {
  let time = Date.parse('2026-10-08T04:00:00Z');
  const records = structuredClone(history);
  const client = { from: () => {
    let filters = [];
    let inserted;
    const query = {
      select: () => query,
      eq: (field, value) => { filters.push((row) => (field === 'metadata->>emailKey' ? row.metadata?.emailKey : row[field]) === value); return query; },
      gte: (field, value) => { filters.push((row) => row[field] >= value); return query; },
      limit: () => query,
      insert: (value) => { inserted = value; return query; },
      then: (resolve, reject) => Promise.resolve().then(() => {
        if (inserted) records.push({ ...inserted, created_at: new Date(time).toISOString() });
        return { data: records.filter((row) => filters.every((check) => check(row))), error: null };
      }).then(resolve, reject),
    };
    return query;
  } };
  const guard = createRegistrationGuard({ getSupabase: () => client, now: () => time });
  const attempt = async (email, ip = '192.0.2.10', extra = {}) => {
    let status;
    let body;
    let passed = false;
    const headers = {};
    await guard.middleware({ ip, headers: { 'user-agent': 'test', ...extra }, method: 'POST', path: '/register', body: { email } }, {
      locals: {}, set: (name, value) => { headers[name] = value; },
      status: (value) => { status = value; return { json: (value) => { body = value; } }; },
    }, () => { passed = true; });
    return { passed, status, body, headers };
  };
  return { guard, attempt, records, advance: (ms) => { time += ms; } };
};

test('IP registration limit catches rotating mailboxes and cannot be bypassed with a supplied forwarding header', async () => {
  const fixture = guardFixture();
  for (let index = 0; index < 10; index++) assert.equal((await fixture.attempt(`customer${index}@gmail.com`)).passed, true);
  const result = await fixture.attempt('anothercustomer@gmail.com', '192.0.2.10', { 'x-forwarded-for': '198.51.100.20' });
  assert.equal(result.status, 429);
  assert.ok(Number(result.headers['Retry-After']) > 0);
});

test('persisted mailbox attempts prevent restart and different-IP bypasses', async () => {
  const fixture = guardFixture();
  for (let index = 0; index < 3; index++) assert.equal((await fixture.attempt('customer.name@gmail.com', `192.0.2.${index}`)).passed, true);
  fixture.guard.clear();
  assert.equal((await fixture.attempt('customername+new@gmail.com', '198.51.100.20')).status, 429);
  fixture.advance(60 * 60000 + 1);
  fixture.guard.clear();
  assert.equal((await fixture.attempt('customername@gmail.com')).passed, true);
});

test('suspicious pattern velocity is audited and limited without storing submitted passwords or full emails', async () => {
  const fixture = guardFixture();
  for (const email of ['qxjzvbnmrtslkdfghwpc@gmail.com', 'v.jzh.z.hdb.b.d.u.d.hj.db@gmail.com', 'x7k2m9q4r8v1z6b3n0d5s2t8@gmail.com']) {
    assert.equal((await fixture.attempt(email)).passed, true);
  }
  assert.equal((await fixture.attempt('x7k2m9q4r8v1z6b3n0d5s2t9@gmail.com')).status, 429);
  assert.ok(fixture.records.every((row) => row.metadata.suspicious));
  assert.doesNotMatch(JSON.stringify(fixture.records), /@gmail.com|password|captcha_answer/);
});

test('confirmed disposable Gmail aliases count as suspicious abuse attempts and persist across restarts', async () => {
  const fixture = guardFixture();
  for (const email of ['s.lo.t.hfuln.m.w@gmail.com', 'slothfulnmw+new@gmail.com', 'SLOTHFULNMW@gmail.com']) {
    assert.equal((await fixture.attempt(email)).passed, true);
  }
  assert.ok(fixture.records.every((row) => row.metadata.suspicious && row.metadata.reason === 'disposable_mailbox'));
  assert.equal(new Set(fixture.records.map((row) => row.metadata.emailKey)).size, 1);
  fixture.guard.clear();
  assert.equal((await fixture.attempt('slothfulnmw+again@gmail.com', '198.51.100.20')).status, 429);
  assert.doesNotMatch(JSON.stringify(fixture.records), /@gmail.com/);
});

test('registration stops safely if durable abuse tracking is unavailable', async (t) => {
  const diagnostic = new Error('private database credentials at internal-host');
  const log = t.mock.method(console, 'error', () => {});
  const guard = createRegistrationGuard({ getSupabase: () => { throw diagnostic; } });
  let body;
  const res = { locals: {}, status: (status) => { assert.equal(status, 503); return { json: (value) => { body = value; } }; } };
  await guard.middleware({ ip: '192.0.2.10', headers: {}, body: { email: 'customername@gmail.com' } }, res, () => assert.fail());
  assert.doesNotMatch(JSON.stringify(body), /credentials|database|internal-host/);
  assert.equal(log.mock.calls[0].arguments[1], diagnostic);
});

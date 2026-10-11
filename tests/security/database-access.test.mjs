// Uses an isolated PostgreSQL WASM instance, never the production database.
// npm install --prefix tmp/security-verification --no-save --package-lock=false @electric-sql/pglite
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../tmp/security-verification/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const customer = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000003';
const unverified = '10000000-0000-4000-8000-000000000004';
const directSignup = '10000000-0000-4000-8000-000000000005';
const staff = '10000000-0000-4000-8000-000000000006';
const asRole = (role, id, sql, parameters = []) => db.transaction(async (tx) => {
  assert.ok(['anon', 'authenticated', 'service_role', 'supabase_auth_admin'].includes(role));
  await tx.exec(`SET LOCAL ROLE ${role}`);
  await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [id || '']);
  return tx.query(sql, parameters);
});
const snapshot = () => db.query("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position");
let structure;

before(async () => {
  await db.exec(`
    SET TIME ZONE 'UTC';
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE supabase_auth_admin;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid primary key, email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  `);
  const schema = (await readFile(new URL('../../supabase/schema.sql', import.meta.url), 'utf8'))
    .replace('create extension if not exists "pgcrypto";', ''); // gen_random_uuid is built into PostgreSQL.
  await db.exec(schema);
  await db.exec(await readFile(new URL('../../supabase/migrations/add_shop_customer_support.sql', import.meta.url), 'utf8'));
  await db.exec(`
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
    INSERT INTO auth.users VALUES
      ('${customer}', now()), ('${other}', now()), ('${admin}', now()),
      ('${unverified}', null), ('${directSignup}', now()), ('${staff}', now());
    INSERT INTO public.profiles (id, username, email, role, email_verified) VALUES
      ('${customer}', 'customer', 'customer@gmail.com', 'customer', true),
      ('${other}', 'other', 'other@gmail.com', 'customer', true),
      ('${admin}', 'admin', 'admin@gmail.com', 'admin', true),
      ('${unverified}', 'unverified', 'unverified@gmail.com', 'customer', true),
      ('${staff}', 'staff', 'staff@gmail.com', 'staff', true);
    ALTER TABLE public.products ADD COLUMN private_cost numeric, ADD COLUMN private_profit numeric, ADD COLUMN private_supplier text;
    INSERT INTO public.products (id, product_name, price, category, stock_quantity, private_cost, private_profit, private_supplier)
      VALUES ('20000000-0000-4000-8000-000000000001', 'Public Dessert', 100, 'Dessert', 8, 30, 70, 'PRIVATE_SUPPLIER');
    INSERT INTO public.orders (user_id, customer_name, total_price) VALUES ('${customer}', 'Own order', 100), ('${other}', 'Other order', 100);
    INSERT INTO public.carts (user_id) VALUES ('${customer}'), ('${other}');
  `);
  structure = (await snapshot()).rows;
  const migration = await readFile(new URL('../../supabase/migrations/harden_customer_data_access.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Deployment can safely apply the same migration again.
  const signupHook = await readFile(new URL('../../supabase/migrations/require_backend_signup_approval.sql', import.meta.url), 'utf8');
  await db.exec(signupHook);
});
after(async () => db.close());

test('the permission migration preserves table structure, customer records and order records', async () => {
  assert.deepEqual((await snapshot()).rows, structure);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.profiles')).rows[0].count, 5);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.orders')).rows[0].count, 2);
});

test('customers and guests cannot query raw product costs, profits, suppliers or settings', async () => {
  for (const [role, id] of [['anon', null], ['authenticated', customer]]) {
    for (const table of ['products', 'shop_settings', 'inventory', 'sales_reports', 'sales_report_items', 'product_recipes', 'product_recipe_items', 'audit_logs']) {
      assert.equal((await asRole(role, id, `SELECT * FROM public.${table}`)).rows.length, 0, role + ' ' + table);
    }
  }
});

test('customer cannot promote their role or verification flag by writing directly to the database', async () => {
  await assert.rejects(asRole('authenticated', customer, "UPDATE public.profiles SET role = 'admin', email_verified = true WHERE id = $1", [customer]), { code: '42501' });
  assert.equal((await asRole('authenticated', customer, 'SELECT public.get_my_role() AS role')).rows[0].role, 'customer');
});

test('direct inserts cannot bypass server contact validation, payment status or product availability checks', async () => {
  for (const table of ['orders', 'order_items', 'pre_orders', 'payment_checkouts', 'carts', 'cart_items', 'customer_addresses', 'order_issue_reports', 'return_refund_requests']) {
    // PostgreSQL checks the missing INSERT privilege before validation/defaults.
    await assert.rejects(asRole('authenticated', customer, `INSERT INTO public.${table} DEFAULT VALUES`), { code: '42501' }, table);
  }
});

test('customers can still read their own order and cart, without accessing another customer records', async () => {
  const orders = await asRole('authenticated', customer, 'SELECT customer_name FROM public.orders');
  assert.deepEqual(orders.rows, [{ customer_name: 'Own order' }]);
  const carts = await asRole('authenticated', customer, 'SELECT user_id FROM public.carts');
  assert.deepEqual(carts.rows, [{ user_id: customer }]);
});

test('a forged profile verification flag and direct provider signup grant no protected access', async () => {
  for (const id of [unverified, directSignup]) {
    assert.equal((await asRole('authenticated', id, 'SELECT * FROM public.profiles')).rows.length, 0);
    assert.equal((await asRole('authenticated', id, 'SELECT public.is_verified_app_user() AS allowed')).rows[0].allowed, false);
  }
});

test('authorized staff retain product and internal settings access', async () => {
  for (const id of [admin, staff]) {
    const products = await asRole('authenticated', id, 'SELECT private_cost, private_profit, private_supplier FROM public.products');
    assert.ok(products.rows.some((row) => row.private_supplier === 'PRIVATE_SUPPLIER'));
    assert.equal((await asRole('authenticated', id, 'SELECT * FROM public.shop_settings')).rows.length, 1);
  }
});

test('the backend service retains validated write access after customer write privileges are revoked', async () => {
  const update = await asRole('service_role', null, 'UPDATE public.profiles SET phone_number = $1 WHERE id = $2 RETURNING phone_number', ['09171234567', customer]);
  assert.equal(update.rows[0].phone_number, '09171234567');
});

const callSignupHook = (event) => asRole('supabase_auth_admin', null, 'SELECT public.require_backend_signup_approval($1::jsonb) AS result', [JSON.stringify(event)]);
test('direct Auth signup is rejected even with forged customer metadata or a guessed approval', async () => {
  for (const email of ['customer@mailinator.com', 'customer@googlemail.com', 'v.jzh.z.hdb.b.d.u.d.hj.db@gmail.com', 'ordinarycustomer@gmail.com']) {
    const { rows } = await callSignupHook({ user: { email, user_metadata: { role: 'admin', registration_approval: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } } });
    assert.equal(rows[0].result.error.http_code, 400);
    assert.doesNotMatch(rows[0].result.error.message, /SQL|hook|audit|approval|database/);
  }
});

test('a backend approval is one-use, bound to its validated email, and not callable from a customer session', async () => {
  const approval = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await asRole('service_role', null, 'INSERT INTO public.audit_logs(action, metadata) VALUES ($1, $2::jsonb)', ['customer_signup_approved', JSON.stringify({ approval, email: 'customer.name@gmail.com' })]);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.audit_logs WHERE action = 'customer_signup_approved' AND created_at > now() - interval '10 minutes'")).rows[0].count, 1);
  const event = { user: { email: 'customer.name@gmail.com', user_metadata: { registration_approval: approval } } };
  assert.equal((await callSignupHook({ user: { ...event.user, email: 'attacker@gmail.com' } })).rows[0].result.error.http_code, 400);
  await assert.rejects(asRole('authenticated', customer, 'SELECT public.require_backend_signup_approval($1::jsonb)', [JSON.stringify(event)]), { code: '42501' });
  assert.deepEqual((await callSignupHook(event)).rows[0].result, {});
  assert.equal((await callSignupHook(event)).rows[0].result.error.http_code, 400);
});

test('expired backend signup approvals cannot activate new accounts', async () => {
  const approval = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await asRole('service_role', null, "INSERT INTO public.audit_logs(action, metadata, created_at) VALUES ($1, $2::jsonb, now() - interval '11 minutes')", ['customer_signup_approved', JSON.stringify({ approval, email: 'customer.name@gmail.com' })]);
  const result = await callSignupHook({ user: { email: 'customer.name@gmail.com', user_metadata: { registration_approval: approval } } });
  assert.equal(result.rows[0].result.error.http_code, 400);
});

test('staff provisioning uses trusted app metadata and retains non-Gmail staff account support', async () => {
  const event = { user: { email: 'staff@shop.example', app_metadata: { provisioned_by_backend: true, application_role: 'staff' } } };
  assert.deepEqual((await callSignupHook(event)).rows[0].result, {});
});

// Runs real PostgreSQL policies and triggers in an isolated WASM database.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../tmp/security-verification/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const ids = { admin: '10000000-0000-4000-8000-000000000001', staff: '10000000-0000-4000-8000-000000000002',
  customer: '10000000-0000-4000-8000-000000000003', product: '20000000-0000-4000-8000-000000000001',
  order: '30000000-0000-4000-8000-000000000001', item: '40000000-0000-4000-8000-000000000001' };
const asRole = (role, id, sql, values = []) => db.transaction(async tx => {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await tx.exec('SET LOCAL ROLE ' + role);
  await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [id || '']);
  return tx.query(sql, values);
});
before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid primary key, email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  `);
  const schema = (await readFile(new URL('../../supabase/schema.sql', import.meta.url), 'utf8'))
    .replace('create extension if not exists "pgcrypto";', '');
  await db.exec(schema);
  await db.exec(`
    GRANT SELECT ON public.profiles TO authenticated;
    GRANT ALL ON public.products, public.order_items, public.orders TO service_role;
    INSERT INTO auth.users VALUES ('${ids.admin}', now()), ('${ids.staff}', now()), ('${ids.customer}', now());
    INSERT INTO public.profiles (id, username, role) VALUES
      ('${ids.admin}', 'admin', 'admin'), ('${ids.staff}', 'staff', 'staff'), ('${ids.customer}', 'customer', 'customer');
    INSERT INTO public.products (id, product_name, price, category, stock_quantity)
      VALUES ('${ids.product}', 'Cake', 140, 'Puddings', 50);
    INSERT INTO public.product_costs (product_id, cost_price) VALUES ('${ids.product}', 80);
    INSERT INTO public.orders (id, user_id, total_price) VALUES ('${ids.order}', '${ids.customer}', 625);
  `);
  const migration = await readFile(new URL('../../supabase/migrations/add_product_discounts_and_private_costs.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
});
after(() => db.close());

test('private costs are readable by admins and service only', async () => {
  for (const role of ['staff', 'customer']) {
    assert.equal((await asRole('authenticated', ids[role], 'SELECT * FROM public.product_costs')).rows.length, 0);
  }
  await assert.rejects(asRole('anon', null, 'SELECT * FROM public.product_costs'), { code: '42501' });
  assert.equal((await asRole('authenticated', ids.admin, 'SELECT cost_price FROM public.product_costs')).rows[0].cost_price, '80.00');
  for (const role of ['admin', 'staff', 'customer']) {
    await assert.rejects(asRole('authenticated', ids[role], 'UPDATE public.product_costs SET cost_price = 1'), { code: '42501' });
  }
});

test('sale inserts automatically snapshot cost and subsequent price/cost edits retain it', async () => {
  await asRole('service_role', null, 'INSERT INTO public.order_items (id, order_id, product_id, quantity, price) VALUES ($1, $2, $3, 5, 125)', [ids.item, ids.order, ids.product]);
  assert.equal((await db.query('SELECT unit_cost FROM public.order_item_costs WHERE order_item_id = $1', [ids.item])).rows[0].unit_cost, '80.00');
  await asRole('service_role', null, 'UPDATE public.product_costs SET cost_price = 90 WHERE product_id = $1', [ids.product]);
  await asRole('service_role', null, 'UPDATE public.order_items SET quantity = 6, price = 120 WHERE id = $1', [ids.item]);
  assert.equal((await db.query('SELECT unit_cost FROM public.order_item_costs WHERE order_item_id = $1', [ids.item])).rows[0].unit_cost, '80.00');
});

test('sale snapshots are hidden from customers and staff and cannot be forged in the browser', async () => {
  for (const role of ['staff', 'customer']) {
    assert.equal((await asRole('authenticated', ids[role], 'SELECT * FROM public.order_item_costs')).rows.length, 0);
  }
  assert.equal((await asRole('authenticated', ids.admin, 'SELECT * FROM public.order_item_costs')).rows.length, 1);
  for (const role of ['admin', 'staff', 'customer']) {
    await assert.rejects(asRole('authenticated', ids[role], 'UPDATE public.order_item_costs SET unit_cost = 0'), { code: '42501' });
    await assert.rejects(asRole('authenticated', ids[role], 'SELECT public.capture_order_item_cost()'), { code: '42501' });
  }
});

test('missing costs remain unknown and deleting an item removes its private snapshot', async () => {
  await db.query('DELETE FROM public.product_costs WHERE product_id = $1', [ids.product]);
  await asRole('service_role', null, 'INSERT INTO public.order_items (order_id, product_id, quantity, price) VALUES ($1, $2, 1, 140)', [ids.order, ids.product]);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.order_item_costs')).rows[0].count, 1);
  await asRole('service_role', null, 'DELETE FROM public.order_items WHERE id = $1', [ids.item]);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.order_item_costs')).rows[0].count, 0);
});


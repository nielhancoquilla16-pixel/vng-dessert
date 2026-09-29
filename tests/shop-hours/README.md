# Shop hours verification

The database singleton `shop_settings` supplies the operating hours. Admin saves
publish to `/api/shop-settings/events` after the database write succeeds. Open
customer pages receive the update without navigation or authentication changes.
Database Realtime notifications and uncached HTTP polling cover reconnects and
servers/proxies that do not stream. The server stream also checks for writes on
other backend instances. The browser clock is aligned to API `serverTime`, with
operating-hour comparisons in `Asia/Manila` and a timer at each minute boundary.

The frontend rejects older database revisions and late HTTP responses. Until
hours are verified, new immediate purchases are disabled. The backend reads the
database again for cart additions/increases, customer order creation, and new
payment checkouts. Existing orders, payment callbacks, and cart removals remain
available. Preorder validation retains its existing rules; changing shop hours
does not erase its separately configured time slots.

## Midnight and overnight hours

The previous frontend, API validation and database constraint assumed opening
must be earlier than closing on the same calendar date. Consequently `00:00`
could be rejected on save, rejected when receiving updated settings, or treated
as closed. Both runtimes now compare complete operating intervals in Manila:
Monday `08:00–00:00` opens Monday at 08:00 and closes Tuesday at 00:00. Closing
is exclusive; ordering remains closed until Tuesday's 08:00 opening. Equal
opening/closing times remain invalid rather than implying 24-hour operation.

The independently deployed API and frontend use matching interval helpers,
with parity tests across date boundaries. The database row remains the shared
source of schedule values. Frontend status is recalculated from those values
and the API-aligned clock, not a persisted closed flag. Overnight labels identify
the closing time as next day. Preorder slots and minimum-date rules are retained;
overnight time fields use the same slot validation without a reversed HTML
`min`/`max` range.

The purchase-flow check also exposed a cart-cleanup race: the backend removes
ordered cart rows, then the client removes them again. Already-missing rows now
count as removed, and completed checkout navigation cannot be overwritten by
the empty-cart redirect. Other cart API errors still propagate.

## Automated tests

From the repository root:

```text
node --test frontend/src/utils/shopHours.test.js tests/shop-hours/backend.test.mjs tests/shop-hours/midnight.test.mjs
npm --prefix frontend run build
```

For the browser integration check, install Playwright in a test environment and
set `PLAYWRIGHT_MODULE` to its absolute `playwright/index.mjs` path. Set
`CHROMIUM_EXECUTABLE` if using a locally installed Chromium instead of
Playwright's default browser. Optionally set `EDGE_EXECUTABLE` to an installed
Edge binary to test with a second browser.

```text
node tests/shop-hours/browser-check.mjs
node --experimental-test-module-mocks tests/shop-hours/midnight-browser.mjs
```

This check starts an isolated Vite server and uses the production settings API
router and event stream with an in-memory database adapter and test accounts.
It does **not** connect to the production database, charge payments, or place
real orders. Artifacts go to `tmp/shop-hours/`.

The second check needs Node with experimental test module mocking (tested with
Node 25.8.1). It runs the real authentication, settings, cart and order route
handlers and React application, replacing database storage with an isolated
adapter and injecting the API clock. It completes a cash pickup checkout and
visits Orders. It does not emulate PostgreSQL inventory triggers or exercise a
live payment gateway. Artifacts go to `tmp/shop-hours-midnight/`.

Verified locally on 2026-09-08 in headless Chromium 149.0.7827.55 (Admin
Dashboard) and Microsoft Edge 152.0.4191.66 (customer Products, Cart and Checkout):

- 8 PM to 10 PM extension after closure reopens ordering across separate sessions.
- An earlier closing time updates displayed hours and disables ordering controls.
- Sold-out and expired products stay disabled after hours are extended.
- Closing occurs at the time boundary while the page remains open.
- Failed saves never report success; background refresh preserves admin drafts.
- Polling without EventSource and loss/recovery of the settings service work.
- The customer device uses New York time while shop comparisons use Manila time.
- Card Pre-order actions remain visible, open the selected product's form, and
  preserve the guest login requirement. Closing hours and expiry disable them;
  sold-out products retain their separate future-order flow.
- Pre-order buttons have at least 44px touch targets without horizontal overflow
  at widths 320, 375, 390, 430, 768, 1024, and 1440. The expanded browser suite
  has eleven checks; `preorder-products-390.png` and `preorder-products-1440.png`
  show the restored buttons using isolated test products.

Seven additional midnight purchase-flow checks verify:

- At simulated Monday 22:30 Manila time, the old 22:00 closing blocks the UI and
  direct cart/order API requests.
- Saving 00:00 updates the original Products tab by server event, displays
  12:00 AM (next day), and enables eligible Add to Cart actions.
- Cart additions persist through the actual cart route; cash pickup checkout
  saves the order through the actual order route and reaches the Orders page.
- Sold-out, expired, hidden and excessive-quantity requests remain rejected.
- Shortening to 21:00 and re-extending to 00:00 updates Products, saved Cart and
  already-open Checkout together, without clearing the cart or changing orders.
- Products, Cart and Checkout automatically close at midnight; direct requests
  remain blocked at midnight and 07:59:59 the following morning.
- The next 08:00 opening accepts purchases again and preserves existing orders.

Thirteen unit tests additionally check strict time validation, database reads per
purchase, missing settings, stale snapshots, event recovery/cleanup, preserved
preorder slots, exclusive midnight closure, month/year/leap-date rollovers, and
frontend/API parity across 3,840 schedule/time combinations. Targeted frontend
ESLint and the production build pass (existing large-bundle warning remains).

## Live rollout check still required

For an existing database, apply **`supabase/migrations/allow_overnight_shop_hours.sql`**
before saving midnight or overnight hours. The old database check
`opening_time < closing_time` must be replaced with `opening_time <> closing_time`.
This migration changes only that constraint and its documentation; it preserves
saved settings, orders, inventory, and preorder slots. It handles both the
original unnamed `shop_settings_check` constraint and the new named constraint.
Fresh schema/bootstrap definitions also contain the corrected check.

Apply this specific SQL file in the Supabase SQL Editor or an authenticated
database migration session; do not bulk-push unrelated pending migrations.
Then deploy/restart both the backend and frontend. No live migration or
deployment was performed during local verification: the available Supabase CLI
has no authenticated access token. The existing `expiry_refunds_shop_settings.sql`
setup supplies the singleton row, RLS, update timestamp trigger and Realtime
publication; running it again alone does not replace an existing table's check.

Using a staging database, keep the Admin Dashboard and customer Products/Cart/
Checkout pages open in separate browsers or devices. Save an earlier and later
closing time and repeat the cases above. Confirm the saved `closing_time` in
Supabase and that the hosting proxy delivers the event stream promptly. Repeat
22:00 → 00:00 at 22:30 Manila and the midnight boundary specifically. Live
Supabase/hosting, database triggers, online payment checkout, Safari, Firefox,
and physical iPhone/Android behavior have not been verified by these isolated
tests.

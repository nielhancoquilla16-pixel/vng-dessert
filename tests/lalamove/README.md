# OpenStreetMap pins and Lalamove

The app saves selected latitude/longitude values with each customer address and
order. Lalamove receives those coordinates and the written addresses in its
quotation request, then the sender/recipient contacts in the booking request.
No Google Maps key or geocoding request is needed for these flows.

## Using the local app

1. In Shop Settings, check the business address, phone number and **Store pickup
   pin**, then save changes. The existing configured pin is retained until edited.
2. Customers enter the complete address in Saved Addresses or Checkout and select
   its exact entrance on OpenStreetMap. They can tap the map, drag the marker, use
   browser location, or enter known coordinates manually. Save Address is optional
   at checkout; selected coordinates still travel with the order.
3. For an existing order with missing coordinates (including `0, 0`), staff select
   **Customer delivery pin** in Admin Orders before clicking **Book Now**. The
   corrected coordinates are saved to that order by the booking endpoint.
4. A successful booking opens the provider's returned tracking link. A rejected
   request displays its error by the booking controls. An uncertain submission
   remains locked against duplicate courier dispatch, as before.

Editing geographic address text clears its pin so the user must confirm the new
location. Editing the recipient or phone preserves the selected pin. The initial
map center is only a viewing position: it is never saved as a customer location
without selection. Staff pin corrections survive background order refreshes.

Lalamove credentials, market, environment, and pickup contact configuration remain
server-side. Sandbox credentials create test bookings; this change does not switch
the environment or book any delivery. Existing database address/coordinate columns
are reused, so this change requires no new database migration.

The Leaflet map loads standard OpenStreetMap tiles with visible attribution.
Address details are entered manually; there is no address-search/geocoding service
in this flow. Browser location requires permission and localhost or HTTPS. Normal
map selection is available without browser location permission.

## Verification

From the repository root:

```powershell
node --experimental-test-module-mocks --test tests/lalamove/*.test.mjs tests/shop-hours/backend.test.mjs tests/shop-hours/midnight.test.mjs
npm.cmd --prefix frontend run build
```

For the browser checks, point `PLAYWRIGHT_MODULE` to an installed
`playwright/index.mjs` and optionally `CHROMIUM_EXECUTABLE` to an installed browser:

```powershell
node tests/lalamove/pins-browser.mjs
```

The browser checks run the real forms and Leaflet using isolated context fixtures;
tile images and the provider tracking page are intercepted. They cover explicit
selection, marker dragging, coordinate validation, disabled controls, saved-address
and checkout persistence, store pickup updates, legacy-order correction, background
refresh, error visibility, popup navigation and responsive attribution. The backend
tests exercise actual quotation/order HTTP payloads against a loopback fixture.
They do not contact a live database or dispatch a courier.

Provider references: [Lalamove delivery stops](https://developers.lalamove.com/#delivery-stop),
[Leaflet](https://leafletjs.com/reference.html), and
[OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).

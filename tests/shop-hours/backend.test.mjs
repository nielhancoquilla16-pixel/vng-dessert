import test from 'node:test';
import assert from 'node:assert/strict';
import { assertShopOpen, buildShopSettingsUpdate, getShopSettings, isAvailablePreorderTime, isWithinOperatingHours, mapShopSettings } from '../../dessert-ai-system/server/lib/shopSettings.js';
import { createShopSettingsEvents } from '../../dessert-ai-system/server/lib/shopSettingsEvents.js';

const saved = { id: 1, shop_name: 'V & G', address: 'Las Pinas', opening_time: '08:00:00', closing_time: '20:00:00', preorder_time_slots: ['10:00', '21:00'], updated_at: '2026-09-07T00:00:00Z' };
const clientFor = (read) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: read }) }) }) });

test('backend validates the latest database hours on every purchase attempt', async () => {
  let row = { ...saved };
  let reads = 0;
  const database = clientFor(async () => { reads += 1; return { data: { ...row }, error: null }; });
  const atNinePM = new Date('2026-09-07T13:00:00Z');
  await assert.rejects(assertShopOpen(database, atNinePM), { status: 403, code: 'SHOP_CLOSED' });
  row.closing_time = '22:00:00';
  assert.equal((await assertShopOpen(database, atNinePM)).closingTime, '22:00');
  row.closing_time = '18:00:00';
  await assert.rejects(assertShopOpen(database, atNinePM), { status: 403 });
  assert.equal(reads, 3);
});

test('database errors or missing settings never authorize using fallback opening hours', async () => {
  await assert.rejects(getShopSettings(clientFor(async () => ({ data: null, error: null }))), { status: 503 });
  await assert.rejects(assertShopOpen(clientFor(async () => ({ data: null, error: new Error('database offline') }))), /database offline/);
});

test('backend treats the exact closing instant as closed in Manila', () => {
  const hours = mapShopSettings(saved);
  assert.equal(isWithinOperatingHours(hours, new Date('2026-09-07T11:59:59.999Z')), true);
  assert.equal(isWithinOperatingHours(hours, new Date('2026-09-07T12:00:00Z')), false);
});

test('admin can move closing earlier/later, with strict validation and preserved preorder slots', () => {
  const current = mapShopSettings(saved);
  assert.equal(buildShopSettingsUpdate({ closingTime: '22:00' }, current).closing_time, '22:00');
  const earlier = mapShopSettings(buildShopSettingsUpdate({ closing_time: '18:00' }, current));
  assert.equal(earlier.closingTime, '18:00');
  assert.deepEqual(earlier.preorderTimeSlots, ['10:00', '21:00']);
  assert.equal(isAvailablePreorderTime(earlier, '21:00'), false);
  assert.equal(isAvailablePreorderTime({ ...earlier, closingTime: '22:00' }, '21:00'), true);
  assert.equal(isAvailablePreorderTime({ ...earlier, closingTime: '22:00' }, '20:30'), false);
  assert.equal(buildShopSettingsUpdate({ closingTime: '00:00' }, current).closing_time, '00:00');
  assert.equal(buildShopSettingsUpdate({ closingTime: '07:00' }, current).closing_time, '07:00');
  for (const invalid of ['25:00', 'not a time', '', '08:00']) {
    assert.throws(() => buildShopSettingsUpdate({ closingTime: invalid }, current), { status: 400 });
  }
});

test('stream pushes to separate clients, rejects old reads and recovers after database errors', async () => {
  const timers = new Map();
  let timerId = 0;
  let nextRead;
  const events = createShopSettingsEvents({
    loadSettings: () => nextRead,
    now: () => new Date('2026-09-07T13:00:00Z'),
    schedule: (callback) => { const id = ++timerId; timers.set(id, callback); return id; },
    unschedule: (id) => timers.delete(id),
  });
  const messages = [[], []];
  const clients = messages.map((buffer) => ({ write: (message) => { buffer.push(message); return true; } }));
  const oldSettings = mapShopSettings(saved);
  const unsubscribe = clients.map((client) => events.subscribe(client, oldSettings));
  const updated = { ...oldSettings, closingTime: '22:00', updatedAt: '2026-09-07T00:01:00Z' };
  events.publish(updated);
  for (const buffer of messages) assert.match(buffer.at(-1), /"closingTime":"22:00".*"isOpen":true/);
  const count = messages[0].length;
  events.publish(oldSettings);
  assert.equal(messages[0].length, count);

  let resolveRead;
  nextRead = new Promise((resolve) => { resolveRead = resolve; });
  timers.get(1)();
  const latest = { ...updated, closingTime: '18:00', updatedAt: '2026-09-07T00:02:00Z' };
  events.publish(latest);
  resolveRead(updated);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(messages[0].at(-1), /"closingTime":"18:00"/);

  nextRead = Promise.reject(new Error('offline'));
  timers.get(1)();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(messages[0].at(-1), /shop-settings-unavailable/);
  nextRead = Promise.resolve(latest);
  timers.get(1)();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(messages[0].at(-1), /event: shop-settings\n/);
  unsubscribe.forEach((stop) => stop());
  assert.equal(timers.size, 0);
});

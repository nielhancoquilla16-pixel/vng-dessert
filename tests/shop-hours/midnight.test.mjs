import test from 'node:test';
import assert from 'node:assert/strict';
import * as frontend from '../../frontend/src/utils/shopHours.js';
import * as backend from '../../dessert-ai-system/server/lib/operatingHours.js';
import { assertShopOpen, buildShopSettingsUpdate, mapShopSettings } from '../../dessert-ai-system/server/lib/shopSettings.js';

const hours = { openingTime: '08:00', closingTime: '00:00', preorderTimeSlots: [] };

test('Monday 08:00 to midnight is a complete interval ending Tuesday, and reopens Tuesday at 08:00', () => {
  for (const implementation of [frontend, backend]) {
    const interval = implementation.getShopOperatingInterval(hours, '2026-09-07T22:30:00+08:00');
    assert.equal(new Date(interval.opensAt).toISOString(), '2026-09-07T00:00:00.000Z');
    assert.equal(new Date(interval.closesAt).toISOString(), '2026-09-07T16:00:00.000Z');
    for (const [time, expected] of [
      ['2026-09-07T07:59:59.999+08:00', false],
      ['2026-09-07T08:00:00+08:00', true],
      ['2026-09-07T22:30:00+08:00', true],
      ['2026-09-07T23:59:59.999+08:00', true],
      ['2026-09-08T00:00:00+08:00', false],
      ['2026-09-08T00:30:00+08:00', false],
      ['2026-09-08T07:59:59.999+08:00', false],
      ['2026-09-08T08:00:00+08:00', true],
    ]) assert.equal(implementation.isWithinOperatingHours(hours, time), expected, time);
  }
  assert.equal(frontend.formatShopTime('00:00:00'), '12:00 AM');
});

test('extending the saved 22:00 close to midnight reopens backend authorization at 22:30; shortening closes it', async () => {
  let row = { id: 1, address: 'Las Pinas', opening_time: '08:00', closing_time: '22:00', preorder_time_slots: ['10:00', '23:00'] };
  const database = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) };
  const at1030PM = new Date('2026-09-07T22:30:00+08:00');
  await assert.rejects(assertShopOpen(database, at1030PM), { status: 403, code: 'SHOP_CLOSED' });
  row = buildShopSettingsUpdate({ closingTime: '00:00' }, mapShopSettings(row));
  assert.equal((await assertShopOpen(database, at1030PM)).closingTime, '00:00');
  assert.deepEqual(row.preorder_time_slots, ['10:00', '23:00']);
  await assert.rejects(assertShopOpen(database, new Date('2026-09-08T00:00:00+08:00')), { status: 403 });
  row = buildShopSettingsUpdate({ closingTime: '21:00' }, mapShopSettings(row));
  await assert.rejects(assertShopOpen(database, at1030PM), { status: 403 });
});

test('overnight intervals survive month/year rollover and still exclude the closing instant', () => {
  for (const implementation of [frontend, backend]) {
    const overnight = { openingTime: '20:00', closingTime: '02:00' };
    for (const [time, expected] of [
      ['2026-12-31T23:30:00+08:00', true],
      ['2027-01-01T01:59:59.999+08:00', true],
      ['2027-01-01T02:00:00+08:00', false],
      ['2028-03-01T01:00:00+08:00', true],
      ['2028-03-01T19:59:59+08:00', false],
      ['2028-03-01T20:00:00+08:00', true],
    ]) assert.equal(implementation.isWithinOperatingHours(overnight, time), expected, time);
    assert.equal(implementation.isWithinOperatingHours(overnight, 'invalid'), false);
    assert.equal(implementation.hasValidShopHours({ openingTime: '00:00', closingTime: '00:00' }), false);
  }
});

test('preorder scheduling retains configured slots and excludes midnight closing', () => {
  for (const implementation of [frontend, backend]) {
    const configured = { ...hours, preorderTimeSlots: ['10:00', '23:00', '00:00'] };
    assert.equal(implementation.isAvailablePreorderTime(configured, '23:00'), true);
    assert.equal(implementation.isAvailablePreorderTime(configured, '22:30'), false);
    assert.equal(implementation.isAvailablePreorderTime(configured, '00:00'), false);
    assert.equal(implementation.isAvailablePreorderTime(hours, '23:45'), true);
    assert.equal(implementation.isAvailablePreorderTime(hours, '07:00'), false);
    assert.equal(implementation.isAvailablePreorderTime({ ...hours, closingTime: '02:00' }, '01:00'), true);
  }
});

test('frontend and backend agree across daily schedules, UTC dates, and overnight boundaries', () => {
  for (const openingTime of ['00:00', '08:00', '08:15', '20:00']) {
    for (const closingTime of ['00:00', '02:00', '08:00', '22:00', '23:45']) {
      for (let minutes = 0; minutes < 48 * 60; minutes += 15) {
        const date = new Date(Date.parse('2026-12-31T00:00:00Z') + minutes * 60000);
        const settings = { openingTime, closingTime };
        assert.equal(frontend.isWithinOperatingHours(settings, date), backend.isWithinOperatingHours(settings, date));
        assert.deepEqual(frontend.getShopOperatingInterval(settings, date), backend.getShopOperatingInterval(settings, date));
      }
    }
  }
});

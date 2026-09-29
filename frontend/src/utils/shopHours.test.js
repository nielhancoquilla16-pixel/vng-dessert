import test from 'node:test';
import assert from 'node:assert/strict';
import { formatShopTime, isWithinOperatingHours, normalizeShopSettings, shouldAcceptShopSettings } from './shopHours.js';

test('closing is exclusive and extensions reopen in Asia/Manila, independent of device timezone', () => {
  const settings = { openingTime: '08:00', closingTime: '20:00' };
  assert.equal(isWithinOperatingHours(settings, '2026-09-07T11:59:59.999Z'), true);
  assert.equal(isWithinOperatingHours(settings, '2026-09-07T12:00:00Z'), false);
  assert.equal(isWithinOperatingHours({ ...settings, closingTime: '22:00' }, '2026-09-07T13:00:00Z'), true);
  assert.equal(isWithinOperatingHours({ ...settings, closingTime: '18:00' }, '2026-09-07T11:00:00Z'), false);
  assert.equal(isWithinOperatingHours(settings, '2026-09-06T23:59:59Z'), false);
  assert.equal(isWithinOperatingHours(settings, '2026-09-07T00:00:00Z'), true);
});

test('unknown/invalid hours never become an invented open schedule', () => {
  assert.equal(normalizeShopSettings().closingTime, '');
  assert.equal(isWithinOperatingHours(normalizeShopSettings()), false);
  assert.equal(isWithinOperatingHours({ openingTime: '08:00', closingTime: 'garbage' }), false);
  assert.equal(isWithinOperatingHours({ openingTime: '08:00', closingTime: '20:00' }, 'invalid'), false);
  assert.equal(normalizeShopSettings({ opening_time: '08:00:00', closing_time: '22:00:00' }).closingTime, '22:00');
  assert.equal(formatShopTime('22:00:00'), '10:00 PM');
});

test('late cached reads cannot undo a saved closing time or a newer server event', () => {
  const earlier = { updatedAt: '2026-09-07T10:00:00Z', closingTime: '20:00' };
  const later = { updatedAt: '2026-09-07T10:01:00Z', closingTime: '22:00' };
  assert.equal(shouldAcceptShopSettings(later, earlier, 2, 3), false);
  assert.equal(shouldAcceptShopSettings(later, later, 2, 1), false);
  assert.equal(shouldAcceptShopSettings(earlier, later, 2, 1), true);
  assert.equal(shouldAcceptShopSettings(later, later, 2, 3), true);
});

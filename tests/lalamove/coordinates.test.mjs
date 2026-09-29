import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCustomerAddressValidationError,
  normalizeCustomerAddressInput,
} from '../../dessert-ai-system/server/lib/customerAddresses.js';
import { isValidDeliveryCoordinates } from '../../dessert-ai-system/server/lib/orderUtils.js';
import { isValidLocation } from '../../frontend/src/lib/deliveryLocation.js';
import { buildShopSettingsUpdate } from '../../dessert-ai-system/server/lib/shopSettings.js';

test('missing or zero-zero destination pins are rejected before Lalamove booking', () => {
  for (const coordinates of [
    { latitude: null, longitude: null },
    { latitude: '', longitude: '' },
    { latitude: 0, longitude: 0 },
    { latitude: ' ', longitude: ' ' },
    { latitude: 91, longitude: 121 },
    { latitude: 14, longitude: 181 },
    { latitude: 'unknown', longitude: 121 },
  ]) {
    assert.equal(isValidDeliveryCoordinates(coordinates), false);
    assert.equal(isValidLocation({
      destinationLatitude: coordinates.latitude,
      destinationLongitude: coordinates.longitude,
    }), false);
  }
});

test('valid destination pins remain eligible for booking', () => {
  const coordinates = { latitude: 14.46, longitude: 120.97 };
  assert.equal(isValidDeliveryCoordinates(coordinates), true);
  assert.equal(isValidLocation({
    destinationLatitude: coordinates.latitude,
    destinationLongitude: coordinates.longitude,
  }), true);
});

test('blank saved-address coordinates stay null and cannot pass address validation as zero', () => {
  const address = normalizeCustomerAddressInput({
    recipientName: 'Customer',
    phoneNumber: '09123456789',
    streetAddress: '1 Sample Street',
    city: 'Las Pinas City',
    province: 'Metro Manila',
    formattedAddress: '1 Sample Street, Las Pinas City',
    latitude: '',
    longitude: '',
  });

  assert.equal(address.latitude, null);
  assert.equal(address.longitude, null);
  assert.match(getCustomerAddressValidationError(address), /location on the map/i);
  assert.match(getCustomerAddressValidationError({
    ...address,
    latitude: 0,
    longitude: 0,
  }), /location on the map/i);
});

test('shop pickup pins must be a valid pair while schedules can still be saved without a pin', () => {
  const settings = { address: 'Store address', openingTime: '08:00', closingTime: '22:00' };
  const noPin = buildShopSettingsUpdate({}, settings);
  assert.equal(noPin.latitude, null);
  assert.equal(noPin.longitude, null);
  const valid = buildShopSettingsUpdate({ latitude: '14.455378', longitude: '120.974665' }, settings);
  assert.equal(valid.latitude, 14.455378);
  assert.equal(valid.longitude, 120.974665);
  for (const pin of [
    { latitude: 0, longitude: 0 },
    { latitude: 14.45, longitude: '' },
    { latitude: '', longitude: 120.97 },
    { latitude: 100, longitude: 120.97 },
    { latitude: 14.45, longitude: -181 },
    { latitude: false, longitude: 120.97 },
  ]) assert.throws(() => buildShopSettingsUpdate(pin, settings), { status: 400 });
});

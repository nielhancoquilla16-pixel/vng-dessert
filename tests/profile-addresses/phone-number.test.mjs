import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPhoneNumberValidationMessage as getFrontendMessage,
  sanitizePhoneNumber,
  PHONE_NUMBER_VALIDATION_MESSAGE,
} from '../../frontend/src/utils/phoneNumber.js';
import {
  getPhoneNumberValidationMessage as getBackendMessage,
} from '../../dessert-ai-system/server/lib/phoneNumber.js';

test('frontend strips non-digits and caps phone input at 11 digits', () => {
  assert.equal(sanitizePhoneNumber('09628971659dadasd'), '09628971659');
  assert.equal(sanitizePhoneNumber('+63 (962) 897-1659'), '63962897165');
  assert.equal(sanitizePhoneNumber('١٢٣٤٥٦٧٨٩٠١'), '');
});

test('frontend accepts only exactly 11 ASCII digits', () => {
  assert.equal(getFrontendMessage('09628971659'), '');
  for (const value of ['0962897165', '096289716599', '0962897165a', '09628 971659', '+9628971659', '']) {
    assert.equal(getFrontendMessage(value), PHONE_NUMBER_VALIDATION_MESSAGE);
  }
});

test('backend rejects any customer phone number other than exactly 11 digits', () => {
  assert.equal(getBackendMessage('09628971659'), '');
  for (const value of ['0962897165', '096289716599', '0962897165a', '09628 971659', '+9628971659', '']) {
    assert.equal(getBackendMessage(value), PHONE_NUMBER_VALIDATION_MESSAGE);
  }
});

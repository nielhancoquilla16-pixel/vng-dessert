export const PHONE_NUMBER_DIGITS_REQUIRED = 11;
export const PHONE_NUMBER_VALIDATION_MESSAGE = 'Enter a valid Philippine mobile number with 11 digits, starting with 09.';

export const sanitizePhoneNumber = (value = '') => String(value ?? '');

// The accepted mobile ranges follow Google's current Philippine mobile-number
// metadata, with the required national 09 prefix and 11-digit local format.
export const PHILIPPINE_MOBILE_NUMBER_PATTERN_SOURCE = '09(?:0[5-9]|1[0-24-9]|[235-7]\\d|4[2-9]|8[135-9]|9[1-9])\\d{7}';
const PHILIPPINE_MOBILE_NUMBER_PATTERN = new RegExp(`^${PHILIPPINE_MOBILE_NUMBER_PATTERN_SOURCE}$`);

export const isValidPhilippinePhoneNumber = (value = '') => (
  PHILIPPINE_MOBILE_NUMBER_PATTERN.test(String(value ?? ''))
);

export const getPhoneNumberValidationMessage = (value = '') => (
  isValidPhilippinePhoneNumber(value) ? '' : PHONE_NUMBER_VALIDATION_MESSAGE
);

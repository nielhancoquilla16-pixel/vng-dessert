export const PHONE_NUMBER_VALIDATION_MESSAGE = 'Enter a valid Philippine mobile number with 11 digits, starting with 09.';

// Keep this aligned with the frontend validator. Numbers must be entered in
// local 09XXXXXXXXX format; spaces, punctuation, country codes, and letters
// are rejected instead of silently normalized.
const PHILIPPINE_MOBILE_NUMBER_PATTERN = /^09(?:0[5-9]|1[0-24-9]|[235-7]\d|4[2-9]|8[135-9]|9[1-9])\d{7}$/;

export const isValidPhilippinePhoneNumber = (value = '') => (
  PHILIPPINE_MOBILE_NUMBER_PATTERN.test(String(value ?? ''))
);

export const getPhoneNumberValidationMessage = (value = '') => (
  isValidPhilippinePhoneNumber(value) ? '' : PHONE_NUMBER_VALIDATION_MESSAGE
);

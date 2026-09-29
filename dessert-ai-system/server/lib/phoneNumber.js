export const PHONE_NUMBER_VALIDATION_MESSAGE = 'Phone number must contain exactly 11 digits.';

export const getPhoneNumberValidationMessage = (value = '') => (
  /^\d{11}$/.test(String(value ?? '')) ? '' : PHONE_NUMBER_VALIDATION_MESSAGE
);

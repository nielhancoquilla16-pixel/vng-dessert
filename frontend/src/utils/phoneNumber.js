export const PHONE_NUMBER_DIGITS_REQUIRED = 11;
export const PHONE_NUMBER_VALIDATION_MESSAGE = 'Phone number must contain exactly 11 digits.';

export const sanitizePhoneNumber = (value = '') => String(value ?? '')
  .replace(/\D/g, '')
  .slice(0, PHONE_NUMBER_DIGITS_REQUIRED);

export const getPhoneNumberValidationMessage = (value = '') => (
  /^\d{11}$/.test(String(value ?? '')) ? '' : PHONE_NUMBER_VALIDATION_MESSAGE
);

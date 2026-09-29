// Only known email delivery failures receive the public verification-email code.
// Keep the original provider error as the cause for server-side diagnostics.
export const normalizeAuthEmailError = (error) => {
  if (
    error?.code !== 'email_address_not_authorized'
    && !/^Error sending (?:confirmation|magic link) email$/i.test(String(error?.message || '').trim())
  ) {
    return error;
  }

  const deliveryError = new Error('Unable to send the account verification email.', { cause: error });
  deliveryError.status = 503;
  deliveryError.errorCode = 'AUTH_EMAIL_DELIVERY_UNAVAILABLE';
  return deliveryError;
};

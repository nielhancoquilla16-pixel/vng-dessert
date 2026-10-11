import { isBlockedGmailMailbox, validateRegistrationEmail } from '../../shared/registrationEmail.js';

// Operators can add confirmed abusive/public Gmail inboxes without publishing
// them to customers. Only the backend environment supplies this list.
const configuredMailboxes = () => String(process.env.REGISTRATION_BLOCKED_GMAIL_MAILBOXES || '')
  .split(/[,;\s]+/).filter(Boolean);

export const validateCustomerRegistrationEmail = (value) => validateRegistrationEmail(value, {
  blockedMailboxes: configuredMailboxes(),
});

export const isBlockedCustomerMailbox = (value) => isBlockedGmailMailbox(value, configuredMailboxes());
export const BLOCKED_CUSTOMER_MESSAGE = 'This account cannot continue. Please contact the shop for help.';

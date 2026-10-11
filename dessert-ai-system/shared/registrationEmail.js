// One policy for the signup form and the API. Dots and plus aliases refer to
// the same Gmail mailbox for duplicate detection, never to separate accounts.
export const GMAIL_VALIDATION_MESSAGE = 'Enter a valid Gmail address ending in @gmail.com.';
export const SUSPICIOUS_EMAIL_MESSAGE = 'We could not accept this email address. Please use your usual Gmail address or contact the shop for help.';
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'caps7.com',
  'dispostable.com', 'emailondeck.com', 'fakeinbox.com', 'getnada.com',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
  'maildrop.cc', 'mailinator.com', 'mailnesia.com', 'mohmal.com', 'sharklasers.com',
  'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'tempmail.net', 'throwawaymail.com',
  'trashmail.com', 'trashmail.net', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
]);
// Public temporary inboxes and abusive mailboxes reported by the shop owner.
// A disposable service can use a real Gmail mailbox; a domain list cannot
// identify it. Keep mailbox intelligence separate from username heuristics.
const DISPOSABLE_GMAIL_MAILBOXES = new Set([
  'slothfulnmw@gmail.com',
  'massivecvn@gmail.com',
  'kajaahahaggjahagafa@gmail.com',
]);
export const normalizeRegistrationEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const canonicalGmailAddress = (value) => {
  const email = normalizeRegistrationEmail(value);
  const [local = '', domain = ''] = email.split('@');
  return ['gmail.com', 'googlemail.com'].includes(domain)
    ? `${local.split('+')[0].replaceAll('.', '')}@gmail.com` : email;
};

export const isBlockedGmailMailbox = (value, additionalMailboxes = []) => {
  const canonical = canonicalGmailAddress(value);
  return DISPOSABLE_GMAIL_MAILBOXES.has(canonical)
    || additionalMailboxes.some((mailbox) => canonicalGmailAddress(mailbox) === canonical);
};

export const validateRegistrationEmail = (value, { blockedMailboxes = [] } = {}) => {
  const email = normalizeRegistrationEmail(value);
  const [local = '', domain = '', ...extra] = email.split('@');
  const invalid = (reason, message = GMAIL_VALIDATION_MESSAGE) => ({ valid: false, email, reason, message, signals: [], score: 0 });
  if (!email || email.length > 254 || extra.length || !local || !domain) return invalid('invalid_format');
  if (DISPOSABLE_DOMAINS.has(domain) || [...DISPOSABLE_DOMAINS].some((item) => domain.endsWith(`.${item}`))) return invalid('disposable_domain');
  if (domain === 'googlemail.com') return invalid('googlemail_domain');
  if (domain !== 'gmail.com') return invalid('non_gmail_domain');
  // Accept ordinary Gmail usernames and delivery aliases, with no whitespace,
  // consecutive dots, Unicode lookalikes, or punctuation Gmail cannot use.
  if (!/^[a-z0-9]+(?:\.[a-z0-9]+)*(?:\+[a-z0-9]+(?:[._-][a-z0-9]+)*)?$/.test(local) || local.length > 64) return invalid('invalid_format');
  const base = local.split('+')[0];
  const compact = base.replaceAll('.', '');
  if (compact.length > 30) return invalid('username_too_long', SUSPICIOUS_EMAIL_MESSAGE);
  if (isBlockedGmailMailbox(email, blockedMailboxes)) {
    return {
      ...invalid('disposable_mailbox', SUSPICIOUS_EMAIL_MESSAGE),
      canonicalEmail: canonicalGmailAddress(email),
      signals: ['known_disposable_mailbox'], score: 6, pattern: compact,
    };
  }
  const letters = compact.replace(/\d/g, '');
  const digits = compact.length - letters.length;
  const vowels = (letters.match(/[aeiouy]/g) || []).length;
  const segments = base.split('.');
  const transitions = (compact.match(/(?:[a-z](?=\d)|\d(?=[a-z]))/g) || []).length;
  const characterCounts = new Map();
  for (const letter of letters) characterCounts.set(letter, (characterCounts.get(letter) || 0) + 1);
  const dominantCharacterRatio = letters.length
    ? Math.max(...characterCounts.values()) / letters.length : 0;
  const pairs = Array.from({ length: Math.max(0, letters.length - 1) }, (_, index) => letters.slice(index, index + 2));
  const repeatedPairRatio = pairs.length ? 1 - new Set(pairs).size / pairs.length : 0;
  const signals = [];
  let score = 0;
  const signal = (condition, name, weight) => { if (condition) { signals.push(name); score += weight; } };
  signal(compact.length >= 22, 'long_username', 1);
  signal(compact.length >= 20 && new Set(compact).size / compact.length >= 0.6, 'high_character_diversity', 1);
  signal(letters.length >= 10 && vowels / letters.length < 0.15, 'few_vowels', 2);
  signal(/[bcdfghjklmnpqrstvwxz]{8,}/.test(letters), 'long_consonant_sequence', 3);
  signal(digits >= 10 && digits / compact.length >= 0.45, 'many_digits', 2);
  signal(transitions >= 8 && digits >= 4 && letters.length >= 4, 'repeated_letter_digit_switches', 2);
  signal(segments.length >= 6 && segments.filter((part) => part.length <= 2).length / segments.length >= 0.7, 'fragmented_username', 2);
  signal(compact.length >= 20 && /^[a-f0-9]+$/.test(compact) && letters.length >= 4 && digits >= 4, 'long_hex_sequence', 3);
  // Long keyboard-mashed text can contain many vowels and evade consonant
  // checks. Require several independent properties of the canonical username;
  // changing dots, an alias tag or trailing digits cannot erase these signals.
  signal(letters.length >= 16 && characterCounts.size / letters.length <= 0.4, 'low_character_diversity', 2);
  signal(letters.length >= 16 && dominantCharacterRatio >= 0.45, 'dominant_character', 2);
  signal(letters.length >= 16 && repeatedPairRatio >= 0.3, 'repeated_short_sequences', 1);
  // Length, dots, diversity, or a surname alone never trigger a rejection.
  const randomSignals = ['few_vowels', 'long_consonant_sequence', 'many_digits', 'repeated_letter_digit_switches', 'long_hex_sequence', 'dominant_character'];
  const suspicious = score >= 5 && signals.length >= 2 && signals.some((name) => randomSignals.includes(name));
  return {
    valid: !suspicious, email, canonicalEmail: canonicalGmailAddress(email),
    reason: suspicious ? 'suspicious_pattern' : '',
    message: suspicious ? SUSPICIOUS_EMAIL_MESSAGE : '', score, signals,
    // Used only as one additional velocity signal, never as a standalone ban.
    pattern: compact.replace(/\d+/g, '#'),
  };
};

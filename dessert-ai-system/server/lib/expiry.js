const DEFAULT_EXPIRY_WARNING_DAYS = 5;

const normalizeText = (value = '') => String(value ?? '').trim();

export const normalizeDateInput = (value) => {
  const text = normalizeText(value);
  const directMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) {
    return directMatch[1];
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

export const normalizeTimeInput = (value = '') => {
  const text = normalizeText(value);
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(text)
    ? text.slice(0, 5)
    : '';
};

export const normalizeExpiryAt = ({ expirationAt, expirationDate, expirationTime } = {}) => {
  const rawTimestamp = normalizeText(expirationAt);
  if (rawTimestamp) {
    const parsed = new Date(rawTimestamp);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const date = normalizeDateInput(expirationDate);
  const time = normalizeTimeInput(expirationTime) || '23:59';
  if (!date) {
    return '';
  }

  // The shop operates in Manila, so date/time form input is interpreted there.
  const parsed = new Date(`${date}T${time}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

export const splitExpiryAt = (value = '') => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { expirationDate: '', expirationTime: '' };
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed);
  const part = (type) => parts.find((entry) => entry.type === type)?.value || '';

  return {
    expirationDate: `${part('year')}-${part('month')}-${part('day')}`,
    expirationTime: `${part('hour')}:${part('minute')}`,
  };
};

export const getExpiryStatus = ({ expirationAt, expirationDate, warningDays = DEFAULT_EXPIRY_WARNING_DAYS, referenceDate = new Date() } = {}) => {
  const normalizedExpiryAt = normalizeExpiryAt({ expirationAt, expirationDate });
  if (!normalizedExpiryAt) {
    return 'no date';
  }

  const expiryTime = new Date(normalizedExpiryAt).getTime();
  const referenceTime = new Date(referenceDate).getTime();
  if (!Number.isFinite(expiryTime) || !Number.isFinite(referenceTime)) {
    return 'no date';
  }

  if (expiryTime <= referenceTime) {
    return 'expired';
  }

  const safeWarningDays = Math.max(1, Math.min(30, Number(warningDays) || DEFAULT_EXPIRY_WARNING_DAYS));
  return expiryTime - referenceTime <= safeWarningDays * 86400000 ? 'expiring soon' : 'fresh';
};

export const isExpired = (value, referenceDate = new Date()) => (
  getExpiryStatus({ expirationAt: value, referenceDate }) === 'expired'
);

export const formatExpiryForCustomer = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Expiry information is not available.';
  }

  return parsed.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

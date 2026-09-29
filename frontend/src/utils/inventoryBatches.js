export const DEFAULT_EXPIRY_WARNING_DAYS = 5;

export const INVENTORY_STATUS_META = {
  fresh: {
    label: 'Fresh',
    tone: 'fresh',
  },
  'expiring soon': {
    label: 'Expiring Soon',
    tone: 'warning',
  },
  expired: {
    label: 'Expired',
    tone: 'danger',
  },
  'no date': {
    label: 'No Date',
    tone: 'muted',
  },
};

const STATUS_PRIORITY = {
  expired: 0,
  'expiring soon': 1,
  'no date': 2,
  fresh: 3,
};

export const clampWarningDays = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_EXPIRY_WARNING_DAYS;
  }

  return Math.max(1, Math.min(30, Math.round(parsed)));
};

export const normalizeInventoryDate = (value) => {
  if (!value) {
    return '';
  }

  const text = String(value).trim();
  const directMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) {
    return directMatch[1];
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const normalizeExpirationAt = (value, fallbackDate = '') => {
  const rawValue = String(value || '').trim();
  const parsed = rawValue ? new Date(rawValue) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const date = normalizeInventoryDate(fallbackDate);
  return date ? new Date(`${date}T23:59:00+08:00`).toISOString() : '';
};

export const getExpirationTime = (expirationAt = '') => {
  const parsed = new Date(expirationAt);
  if (Number.isNaN(parsed.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed);
  const read = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${read('hour')}:${read('minute')}`;
};

export const formatInventoryDateTime = (value, fallbackDate = '') => {
  const expirationAt = normalizeExpirationAt(value, fallbackDate);
  const parsed = new Date(expirationAt);
  if (Number.isNaN(parsed.getTime())) return 'Not set';

  return parsed.toLocaleString(undefined, {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getLocalDateKey = (referenceDate = new Date()) => {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDayNumber = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) {
    return Number.NaN;
  }

  return Math.trunc(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  ) / 86400000);
};

export const getDaysUntilExpiry = (expirationDate, referenceDate = new Date()) => {
  const normalizedExpiration = normalizeInventoryDate(expirationDate);
  if (!normalizedExpiration) {
    return null;
  }

  const expiryDay = toDayNumber(normalizedExpiration);
  const todayDay = toDayNumber(getLocalDateKey(referenceDate));
  if (!Number.isFinite(expiryDay) || !Number.isFinite(todayDay)) {
    return null;
  }

  return expiryDay - todayDay;
};

export const getHoursUntilExpiry = (expirationAt, expirationDate, referenceDate = new Date()) => {
  const normalizedExpiryAt = normalizeExpirationAt(expirationAt, expirationDate);
  const expiryTime = new Date(normalizedExpiryAt).getTime();
  const referenceTime = new Date(referenceDate).getTime();
  return Number.isFinite(expiryTime) && Number.isFinite(referenceTime)
    ? (expiryTime - referenceTime) / 3600000
    : null;
};

export const getInventoryBatchStatus = (
  { dateCreated, expirationDate, expirationAt },
  warningDays = DEFAULT_EXPIRY_WARNING_DAYS,
  referenceDate = new Date(),
) => {
  const normalizedCreated = normalizeInventoryDate(dateCreated);
  const normalizedExpiration = normalizeInventoryDate(expirationDate);

  if (!normalizedCreated || !normalizedExpiration) {
    return 'no date';
  }

  const hoursUntilExpiry = getHoursUntilExpiry(expirationAt, normalizedExpiration, referenceDate);
  if (hoursUntilExpiry === null) {
    return 'no date';
  }

  const safeWarningDays = clampWarningDays(warningDays);
  if (hoursUntilExpiry <= 0) {
    return 'expired';
  }

  if (hoursUntilExpiry <= safeWarningDays * 24) {
    return 'expiring soon';
  }

  return 'fresh';
};

export const getInventoryStatusMeta = (status) => (
  INVENTORY_STATUS_META[status] || INVENTORY_STATUS_META['no date']
);

export const formatInventoryDate = (value) => {
  const normalizedDate = normalizeInventoryDate(value);
  if (!normalizedDate) {
    return 'Not set';
  }

  const [year, month, day] = normalizedDate.split('-').map(Number);
  const displayDate = new Date(year, month - 1, day);

  return displayDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const getInventoryTimingLabel = (item, referenceDate = new Date()) => {
  const daysUntilExpiry = typeof item.daysUntilExpiry === 'number'
    ? item.daysUntilExpiry
    : getDaysUntilExpiry(item.expirationDate, referenceDate);

  if (item.status === 'no date' || daysUntilExpiry === null) {
    return 'Missing batch dates';
  }

  if (item.status === 'expired') {
    const overdueDays = Math.abs(daysUntilExpiry);
    return overdueDays === 1 ? 'Expired yesterday' : `Expired ${overdueDays} days ago`;
  }

  if (daysUntilExpiry === 0) {
    return 'Expires today';
  }

  if (daysUntilExpiry === 1) {
    return 'Expires tomorrow';
  }

  return `Expires in ${daysUntilExpiry} days`;
};

export const annotateInventoryBatch = (
  item,
  warningDays = DEFAULT_EXPIRY_WARNING_DAYS,
  referenceDate = new Date(),
) => {
  const normalizedDateCreated = normalizeInventoryDate(item.dateCreated || item.createdAt);
  const normalizedExpirationDate = normalizeInventoryDate(item.expirationDate);
  const expirationAt = normalizeExpirationAt(item.expirationAt, normalizedExpirationDate);
  const status = getInventoryBatchStatus(
    {
      dateCreated: normalizedDateCreated,
      expirationDate: normalizedExpirationDate,
      expirationAt,
    },
    warningDays,
    referenceDate,
  );
  const statusMeta = getInventoryStatusMeta(status);
  const daysUntilExpiry = getDaysUntilExpiry(normalizedExpirationDate, referenceDate);

  return {
    ...item,
    productName: item.productName || item.name || 'Unnamed product',
    batchId: item.batchId || 'UNASSIGNED',
    quantity: Math.max(0, Number(item.quantity ?? item.stock ?? item.stockQuantity) || 0),
    unit: item.unit || 'pcs',
    dateCreated: normalizedDateCreated,
    expirationDate: normalizedExpirationDate,
    expirationAt,
    expirationTime: getExpirationTime(expirationAt),
    status,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    daysUntilExpiry,
    timelineLabel: getInventoryTimingLabel({
      ...item,
      status,
      expirationDate: normalizedExpirationDate,
      daysUntilExpiry,
    }, referenceDate),
    isAlertActive: status === 'expired' || status === 'expiring soon',
  };
};

export const compareInventoryBatches = (left, right) => {
  const statusDifference = (STATUS_PRIORITY[left.status] ?? 99) - (STATUS_PRIORITY[right.status] ?? 99);
  if (statusDifference !== 0) {
    return statusDifference;
  }

  const leftExpiry = toDayNumber(left.expirationDate);
  const rightExpiry = toDayNumber(right.expirationDate);
  if (Number.isFinite(leftExpiry) && Number.isFinite(rightExpiry) && leftExpiry !== rightExpiry) {
    return leftExpiry - rightExpiry;
  }

  if (Number.isFinite(leftExpiry) !== Number.isFinite(rightExpiry)) {
    return Number.isFinite(leftExpiry) ? -1 : 1;
  }

  const productDifference = String(left.productName || '').localeCompare(String(right.productName || ''));
  if (productDifference !== 0) {
    return productDifference;
  }

  return String(left.batchId || '').localeCompare(String(right.batchId || ''));
};

export const buildInventoryAlert = (item) => {
  if (!item?.isAlertActive) {
    return null;
  }

  const statusMeta = getInventoryStatusMeta(item.status);
  const expirationLabel = item.expirationDate
    ? formatInventoryDate(item.expirationDate)
    : 'Not set';
  const headline = item.status === 'expired'
    ? `${item.productName} batch ${item.batchId} has expired`
    : `${item.productName} batch ${item.batchId} is expiring soon`;
  const message = item.status === 'expired'
    ? `Expired on ${expirationLabel}.`
    : `${item.timelineLabel}. Expires on ${expirationLabel}.`;

  return {
    id: `${item.id}:${item.status}:${item.expirationDate || 'no-date'}`,
    signature: `${item.id}:${item.status}:${item.expirationDate || 'no-date'}`,
    itemId: item.id,
    productName: item.productName,
    batchId: item.batchId,
    status: item.status,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    timelineLabel: item.timelineLabel,
    expirationDate: item.expirationDate,
    quantity: item.quantity,
    unit: item.unit,
    headline,
    message,
  };
};

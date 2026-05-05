const DEFAULT_EXPIRY_WARNING_DAYS = 5;

const STATUS_PRIORITY = {
  expired: 0,
  'expiring soon': 1,
  'no date': 2,
  fresh: 3,
};

const normalizeText = (value = '') => String(value ?? '').trim();

const normalizeDateString = (value) => {
  if (!value) {
    return '';
  }

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
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

const getTodayKey = (referenceDate = new Date()) => {
  const year = referenceDate.getUTCFullYear();
  const month = String(referenceDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildFallbackBatchId = (id) => {
  const compactId = String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return compactId ? `LEGACY-${compactId}` : `LEGACY-${Date.now()}`;
};

export const getInventoryBatchStatus = ({
  dateCreated,
  expirationDate,
  warningDays = DEFAULT_EXPIRY_WARNING_DAYS,
  referenceDate = new Date(),
}) => {
  const normalizedCreated = normalizeDateString(dateCreated);
  const normalizedExpiration = normalizeDateString(expirationDate);

  if (!normalizedCreated || !normalizedExpiration) {
    return 'no date';
  }

  const expiryDay = toDayNumber(normalizedExpiration);
  const todayDay = toDayNumber(getTodayKey(referenceDate));
  if (!Number.isFinite(expiryDay) || !Number.isFinite(todayDay)) {
    return 'no date';
  }

  const daysUntilExpiry = expiryDay - todayDay;
  const safeWarningDays = Math.max(1, Math.min(30, Number(warningDays) || DEFAULT_EXPIRY_WARNING_DAYS));

  if (daysUntilExpiry < 0) {
    return 'expired';
  }

  if (daysUntilExpiry <= safeWarningDays) {
    return 'expiring soon';
  }

  return 'fresh';
};

export const sanitizeInventoryPayload = (payload = {}, existingRow = null) => {
  const productName = normalizeText(
    payload.product_name
    ?? payload.productName
    ?? payload.ingredient_name
    ?? payload.ingredientName
    ?? existingRow?.product_name
    ?? existingRow?.ingredient_name
  );

  const batchId = normalizeText(
    payload.batch_id
    ?? payload.batchId
    ?? payload.tray_id
    ?? payload.trayId
    ?? existingRow?.batch_id
  );

  const quantity = Math.max(0, Number(
    payload.quantity
    ?? payload.stock_quantity
    ?? payload.stockQuantity
    ?? existingRow?.stock_quantity
    ?? 0
  ) || 0);

  const unit = normalizeText(payload.unit ?? existingRow?.unit) || 'pcs';

  const dateCreated = normalizeDateString(
    payload.date_created
    ?? payload.dateCreated
    ?? existingRow?.date_created
    ?? existingRow?.created_at
  );

  const expirationDate = normalizeDateString(
    payload.expiration_date
    ?? payload.expirationDate
    ?? existingRow?.expiration_date
  );

  const productId = payload.product_id ?? payload.productId ?? existingRow?.product_id ?? null;

  return {
    productName,
    batchId,
    quantity,
    unit,
    dateCreated,
    expirationDate,
    productId,
    status: getInventoryBatchStatus({
      dateCreated,
      expirationDate,
    }),
  };
};

export const mapInventoryItem = (row, options = {}) => {
  const productName = normalizeText(row.product_name || row.ingredient_name);
  const batchId = normalizeText(row.batch_id) || buildFallbackBatchId(row.id);
  const quantity = Math.max(0, Number(row.stock_quantity ?? row.quantity) || 0);
  const dateCreated = normalizeDateString(row.date_created || row.created_at);
  const expirationDate = normalizeDateString(row.expiration_date);

  return {
    id: row.id,
    productName,
    ingredientName: productName,
    batchId,
    quantity,
    stockQuantity: quantity,
    unit: normalizeText(row.unit) || 'pcs',
    status: getInventoryBatchStatus({
      dateCreated,
      expirationDate,
      warningDays: options.warningDays,
    }),
    dateCreated,
    expirationDate,
    imageUrl: row.image_url || null,
    productId: row.product_id || null,
    category: normalizeText(row.category) || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const sortInventoryItems = (items = []) => (
  [...items].sort((left, right) => {
    const statusPriorityDifference = (STATUS_PRIORITY[left.status] ?? 99) - (STATUS_PRIORITY[right.status] ?? 99);
    if (statusPriorityDifference !== 0) {
      return statusPriorityDifference;
    }

    const leftExpiry = toDayNumber(left.expirationDate);
    const rightExpiry = toDayNumber(right.expirationDate);
    if (Number.isFinite(leftExpiry) && Number.isFinite(rightExpiry) && leftExpiry !== rightExpiry) {
      return leftExpiry - rightExpiry;
    }

    if (Number.isFinite(leftExpiry) !== Number.isFinite(rightExpiry)) {
      return Number.isFinite(leftExpiry) ? -1 : 1;
    }

    const productNameDifference = left.productName.localeCompare(right.productName);
    if (productNameDifference !== 0) {
      return productNameDifference;
    }

    return left.batchId.localeCompare(right.batchId);
  })
);

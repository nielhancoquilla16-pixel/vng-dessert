export const ORDER_QR_VALIDITY_MS = 6 * 60 * 1000;

export const getOrderQrExpiry = (order = {}) => {
  const explicitExpiry = Date.parse(order.qr_expires_at || order.qrExpiresAt || '');
  if (Number.isFinite(explicitExpiry)) {
    return new Date(explicitExpiry).toISOString();
  }

  const generatedAt = Date.parse(order.qr_generated_at || order.qrGeneratedAt || order.created_at || order.createdAt || '');
  return Number.isFinite(generatedAt)
    ? new Date(generatedAt + ORDER_QR_VALIDITY_MS).toISOString()
    : null;
};

export const isOrderQrExpired = (order = {}, now = Date.now()) => {
  const expiresAt = Date.parse(getOrderQrExpiry(order) || '');
  return !Number.isFinite(expiresAt) || expiresAt <= now;
};

export const canConfirmQrScannedPickup = (order = {}, now = Date.now()) => {
  const deliveryMethod = String(order.delivery_method || order.deliveryMethod || 'pickup')
    .trim()
    .toLowerCase()
    .replace(/[ _]+/g, '-');
  const isPickup = ['pickup', 'pick-up', 'collection', 'in-store'].includes(deliveryMethod);
  const status = String(order.order_status || order.status || '').trim().toLowerCase();
  const verificationMethod = String(order.verification_method || order.verificationMethod || '').trim().toLowerCase();
  const qrUsedAt = order.qr_used_at || order.qrUsedAt;
  const verifiedAt = order.verified_at || order.verifiedAt;

  return isPickup
    && status === 'confirmed'
    && order.verification_required !== false
    && order.verificationRequired !== false
    && verificationMethod === 'qr'
    && Boolean(qrUsedAt)
    && Boolean(verifiedAt)
    && !isOrderQrExpired(order, now);
};

export const createOrderQrExpiry = (generatedAt = new Date()) => {
  const generatedAtMs = new Date(generatedAt).getTime();
  if (!Number.isFinite(generatedAtMs)) {
    throw new TypeError('A valid QR generation timestamp is required.');
  }
  return new Date(generatedAtMs + ORDER_QR_VALIDITY_MS).toISOString();
};

export const ORDER_QR_EXPIRED_MESSAGE = 'This QR Code/Order ID has expired. Please generate a new one.';

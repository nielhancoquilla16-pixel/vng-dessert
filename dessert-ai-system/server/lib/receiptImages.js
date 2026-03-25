const MAX_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024;
const RECEIPT_IMAGE_DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg));base64,([a-z0-9+/=\s]+)$/i;

export const normalizeReceiptImageInput = (value = '') => {
  const trimmed = String(value || '').trim();
  return trimmed || null;
};

export const validateReceiptImageDataUrl = (value = '') => {
  const normalized = normalizeReceiptImageInput(value);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(RECEIPT_IMAGE_DATA_URL_PATTERN);
  if (!match) {
    const error = new Error('Receipt images must be uploaded as PNG or JPG/JPEG data URLs.');
    error.status = 400;
    throw error;
  }

  const base64Data = match[2].replace(/\s+/g, '');
  const buffer = Buffer.from(base64Data, 'base64');

  if (!buffer.length || buffer.length > MAX_RECEIPT_IMAGE_BYTES) {
    const error = new Error('Receipt images must be 5MB or smaller.');
    error.status = 400;
    throw error;
  }

  return normalized;
};

export const MAX_RECEIPT_IMAGE_SIZE_BYTES = MAX_RECEIPT_IMAGE_BYTES;

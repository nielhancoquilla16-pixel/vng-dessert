import { randomUUID } from 'node:crypto';

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

export const RECEIPT_IMAGES_BUCKET = 'order-receipts';
export const RECEIPT_STORAGE_PREFIX = `storage://${RECEIPT_IMAGES_BUCKET}/`;

const receiptStorageError = (message, cause) => {
  const error = new Error(message, { cause });
  error.status = 503;
  return error;
};

export const storeReceiptImage = async (supabase, orderId, imageInput) => {
  const normalized = validateReceiptImageDataUrl(imageInput);
  if (!normalized) return null;
  // In-memory route fixtures do not provide Storage.
  if (!supabase.storage) return normalized;
  if (!/^[a-z0-9-]+$/i.test(String(orderId))) throw new Error('Invalid receipt order identifier.');
  const [, contentType, base64Data] = normalized.match(RECEIPT_IMAGE_DATA_URL_PATTERN);
  const extension = contentType.toLowerCase() === 'image/png' ? 'png' : 'jpg';
  const path = `${orderId}/${randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(RECEIPT_IMAGES_BUCKET).upload(
    path, Buffer.from(base64Data.replace(/\s+/g, ''), 'base64'),
    { contentType: contentType.toLowerCase(), upsert: false },
  );
  if (error) throw receiptStorageError('Receipt image storage is temporarily unavailable.', error);
  return `${RECEIPT_STORAGE_PREFIX}${path}`;
};

// Called after routes have checked ownership/role and hydrated the selected rows.
// Store compact references in Postgres and return expiring image URLs to the UI.
export const hydrateReceiptImages = async (supabase, orders) => {
  const paths = [...new Set(orders.map((row) => row.receipt_image_url)
    .filter((value) => typeof value === 'string' && value.startsWith(RECEIPT_STORAGE_PREFIX))
    .map((value) => value.slice(RECEIPT_STORAGE_PREFIX.length)))];
  if (!paths.length) return orders;
  const { data, error } = await supabase.storage.from(RECEIPT_IMAGES_BUCKET).createSignedUrls(paths, 3600);
  if (error) throw receiptStorageError('Receipt images are temporarily unavailable.', error);
  const urlsByPath = new Map((data || []).filter((entry) => !entry.error && entry.signedUrl)
    .map((entry) => [entry.path, entry.signedUrl]));
  if (paths.some((path) => !urlsByPath.has(path))) {
    throw receiptStorageError('A receipt image could not be loaded.');
  }
  return orders.map((row) => typeof row.receipt_image_url === 'string' && row.receipt_image_url.startsWith(RECEIPT_STORAGE_PREFIX)
    ? { ...row, receipt_image_url: urlsByPath.get(row.receipt_image_url.slice(RECEIPT_STORAGE_PREFIX.length)) }
    : row);
};

import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const uploadsDir = resolve(__dirname, '../uploads/products');
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg));base64,([a-z0-9+/=\s]+)$/i;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const createImageError = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const parseHttpImageUrl = (value) => {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw createImageError('Enter a valid image URL beginning with http:// or https://.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw createImageError('Enter a valid image URL beginning with http:// or https://.');
  }

  return url.toString();
};

export const resolveProductImageValue = async ({ imageInput, requestBaseUrl }) => {
  const normalizedInput = String(imageInput || '').trim();
  if (!normalizedInput) {
    throw createImageError('Choose an image by uploading a PNG/JPG or entering an image URL.');
  }

  if (/^https?:\/\//i.test(normalizedInput)) {
    return parseHttpImageUrl(normalizedInput);
  }

  const dataUrlMatch = normalizedInput.match(DATA_URL_PATTERN);
  if (!dataUrlMatch) {
    throw createImageError('Upload a valid PNG/JPG image or enter a valid image URL.');
  }

  const mimeType = dataUrlMatch[1].toLowerCase();
  const base64Data = dataUrlMatch[2].replace(/\s+/g, '');
  const unpaddedBase64 = base64Data.replace(/=+$/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const expectedLength = Math.floor(base64Data.length * 3 / 4) - (base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0);

  if (!/^[a-z0-9+/]+$/i.test(unpaddedBase64)
    || base64Data.length - unpaddedBase64.length > 2
    || base64Data.length % 4 === 1
    || !imageBuffer.length
    || imageBuffer.length !== expectedLength
    || imageBuffer.toString('base64').replace(/=+$/, '') !== unpaddedBase64
    || imageBuffer.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw createImageError('Product images must be valid PNG/JPG files smaller than 5MB.');
  }

  const hasPngSignature = imageBuffer.length >= PNG_SIGNATURE.length
    && imageBuffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  const hasJpegSignature = imageBuffer.length >= 3
    && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff;
  if ((mimeType === 'image/png' && !hasPngSignature) || (mimeType === 'image/jpeg' && !hasJpegSignature)) {
    throw createImageError('The selected file does not match its PNG/JPG image type.');
  }

  await mkdir(uploadsDir, { recursive: true });
  const extension = mimeType === 'image/png' ? '.png' : '.jpg';
  const filename = `${randomUUID()}${extension}`;
  await writeFile(join(uploadsDir, filename), imageBuffer, { flag: 'wx' });

  const baseUrl = String(requestBaseUrl || '').replace(/\/$/, '');
  return `${baseUrl}/uploads/products/${filename}`;
};

export const removeManagedProductImage = async (value = '') => {
  let pathname = '';
  try {
    pathname = new URL(String(value)).pathname;
  } catch {
    return;
  }

  if (!pathname.startsWith('/uploads/products/')) return;
  const filename = basename(pathname);
  if (!/^[0-9a-f-]{36}\.(?:png|jpg)$/i.test(filename)) return;

  try {
    await unlink(join(uploadsDir, filename));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Unable to remove old product image:', error);
    }
  }
};

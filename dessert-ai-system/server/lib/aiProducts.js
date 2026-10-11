import { isExpired, normalizeExpiryAt } from './expiry.js';
import { publicAiText } from './aiSafety.js';

export const availableAiProducts = (products = [], now = new Date()) => (
  (Array.isArray(products) ? products : []).filter((product) => {
    if (!product || product.availability !== 'available' || !Number.isFinite(Number(product.stock)) || Number(product.stock) <= 0) return false;
    if (product.status && !['active', 'available'].includes(product.status)) return false;
    if (product.hidden || product.archived || product.removed || product.deleted || product.isExpired || product.expiryStatus === 'expired') return false;
    const expirationAt = normalizeExpiryAt({ expirationAt: product.expirationAt, expirationDate: product.expirationDate });
    if ((product.expirationAt || product.expirationDate) && !expirationAt) return false;
    return !isExpired(expirationAt, now) && Boolean(publicAiText(product.name));
  })
);

export const formatAiProductList = (products = []) => products.map((product) => {
  const name = publicAiText(product.name).replace(/[\r\n\x60*#\[\]<>]/g, ' ').replace(/\s+/g, ' ').trim();
  const price = Number.isFinite(product.price)
    ? `PHP ${product.price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'price unavailable';
  return `- ${name} = ${price}`;
}).join('\n');

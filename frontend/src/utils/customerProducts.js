import { normalizeExpirationAt } from './inventoryBatches.js';

const getProductExpirationTime = (product) => Date.parse(normalizeExpirationAt(
  product?.expirationAt || product?.expiration_at,
  product?.expirationDate || product?.expiration_date,
));

export const isProductExpired = (product, referenceTime = Date.now()) => (
  product?.availability === 'expired'
  || product?.isExpired === true
  || product?.expiryStatus === 'expired'
  || product?.expiry_status === 'expired'
  || getProductExpirationTime(product) <= referenceTime
);

export const getCustomerProducts = (products = [], referenceTime = Date.now()) => (
  products.filter((product) => (
    (!product.type || product.type === 'product')
    && product.availability !== 'hidden'
    && !isProductExpired(product, referenceTime)
  ))
);

// Keep expired rows for staff and inventory tools, and update purchase guards.
export const expireProducts = (products, referenceTime = Date.now()) => {
  let changed = false;
  const nextProducts = products.map((product) => {
    if (!isProductExpired(product, referenceTime)) return product;
    const availability = product.availability === 'hidden' ? 'hidden' : 'expired';
    if (product.availability === availability && product.isExpired && product.expiryStatus === 'expired') {
      return product;
    }
    changed = true;
    return { ...product, availability, isExpired: true, expiryStatus: 'expired' };
  });
  return changed ? nextProducts : products;
};

// A single local timer is enough; crossing an expiry needs no database request.
export const getNextProductExpiryDelay = (products, referenceTime = Date.now()) => {
  let nextExpiry = Infinity;
  for (const product of products) {
    if (isProductExpired(product, referenceTime)) continue;
    const expiry = getProductExpirationTime(product);
    if (Number.isFinite(expiry)) nextExpiry = Math.min(nextExpiry, expiry);
  }
  return Number.isFinite(nextExpiry)
    ? Math.min(2147483647, Math.max(1, nextExpiry - referenceTime + 1))
    : null;
};

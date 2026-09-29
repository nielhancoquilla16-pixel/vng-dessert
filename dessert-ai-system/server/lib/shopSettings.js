import { getSupabaseAdmin } from './supabaseAdmin.js';
import { hasValidShopHours, isWithinOperatingHours } from './operatingHours.js';
export { getShopOperatingInterval, isAvailablePreorderTime, isWithinOperatingHours } from './operatingHours.js';

export const SHOP_SETTINGS_ID = 1;
export const MANILA_TIME_ZONE = 'Asia/Manila';

const normalizeText = (value = '') => String(value ?? '').trim();
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/;

const getEnvDefault = () => ({
  id: SHOP_SETTINGS_ID,
  shopName: String(process.env.STORE_NAME || 'V&G Leche Flan').trim(),
  address: String(process.env.STORE_ADDRESS || process.env.LALAMOVE_PICKUP_ADDRESS || 'Monark Subdivision, Las Pinas, Philippines').trim(),
  phoneNumber: String(process.env.LALAMOVE_PICKUP_PHONE || '0977 385 4909').trim(),
  openingTime: '',
  closingTime: '',
  preorderTimeSlots: [],
  latitude: String(process.env.STORE_LATITUDE || process.env.LALAMOVE_PICKUP_LATITUDE || '').trim(),
  longitude: String(process.env.STORE_LONGITUDE || process.env.LALAMOVE_PICKUP_LONGITUDE || '').trim(),
  updatedAt: null,
});

const normalizeTime = (value, fallback) => {
  const normalized = normalizeText(value);
  const match = normalized.match(TIME_PATTERN);
  return match ? `${match[1]}:${match[2]}` : fallback;
};

const normalizeSlots = (value) => (
  [...new Set((Array.isArray(value) ? value : [])
    .map((slot) => normalizeTime(slot, ''))
    .filter(Boolean))]
    .sort()
);

export const mapShopSettings = (row = {}) => {
  const defaults = getEnvDefault();
  return {
    id: row.id || defaults.id,
    shopName: normalizeText(row.shop_name) || defaults.shopName,
    address: normalizeText(row.address) || defaults.address,
    phoneNumber: normalizeText(row.phone_number) || defaults.phoneNumber,
    openingTime: normalizeTime(row.opening_time, defaults.openingTime),
    closingTime: normalizeTime(row.closing_time, defaults.closingTime),
    preorderTimeSlots: normalizeSlots(row.preorder_time_slots),
    latitude: row.latitude == null || row.latitude === '' ? defaults.latitude : String(row.latitude),
    longitude: row.longitude == null || row.longitude === '' ? defaults.longitude : String(row.longitude),
    updatedAt: row.updated_at || null,
  };
};

export const getShopSettings = async (supabase = getSupabaseAdmin()) => {
  const { data, error } = await supabase
    .from('shop_settings')
    .select('*')
    .eq('id', SHOP_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const settingsError = new Error('Shop operating hours have not been configured. Please contact the shop.');
    settingsError.status = 503;
    throw settingsError;
  }
  const settings = mapShopSettings(data);
  if (!hasValidShopHours(settings)) {
    const settingsError = new Error('Saved shop operating hours are invalid. Please contact the shop.');
    settingsError.status = 503;
    throw settingsError;
  }
  return settings;
};

export const buildShopSettingsUpdate = (payload = {}, current = {}) => {
  const merged = {
    ...current,
    ...payload,
  };
  const readTime = (camelKey, snakeKey, fallback, label) => {
    const supplied = Object.prototype.hasOwnProperty.call(payload, camelKey)
      ? payload[camelKey]
      : (Object.prototype.hasOwnProperty.call(payload, snakeKey) ? payload[snakeKey] : fallback);
    const normalized = normalizeTime(supplied, '');
    if (!normalized) {
      const error = new Error(`${label} must be a valid time in HH:MM format.`);
      error.status = 400;
      throw error;
    }
    return normalized;
  };
  const openingTime = readTime('openingTime', 'opening_time', current.openingTime, 'Opening time');
  const closingTime = readTime('closingTime', 'closing_time', current.closingTime, 'Closing time');

  if (openingTime === closingTime) {
    const error = new Error('Opening and closing times must be different.');
    error.status = 400;
    throw error;
  }

  const address = normalizeText(merged.address);
  if (!address) {
    const error = new Error('Shop address is required.');
    error.status = 400;
    throw error;
  }

  const coordinate = (value, label, minimum, maximum) => {
    if (value == null || (typeof value === 'string' && !value.trim())) return null;
    const parsed = Number(value);
    if (!['string', 'number'].includes(typeof value) || !Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
      const error = new Error(`${label} must be a valid map pin coordinate between ${minimum} and ${maximum}.`);
      error.status = 400;
      throw error;
    }
    return parsed;
  };
  const latitude = coordinate(merged.latitude, 'Latitude', -90, 90);
  const longitude = coordinate(merged.longitude, 'Longitude', -180, 180);
  if ((latitude == null) !== (longitude == null) || (latitude === 0 && longitude === 0)) {
    const error = new Error('Select the actual shop pickup location on the map.');
    error.status = 400;
    throw error;
  }

  // Keep the separately configured preorder slots. The scheduling validator
  // applies current hours without permanently erasing slots when hours shorten.
  const slots = normalizeSlots(merged.preorderTimeSlots ?? merged.preorder_time_slots);

  return {
    id: SHOP_SETTINGS_ID,
    shop_name: normalizeText(merged.shopName ?? merged.shop_name) || 'V&G Leche Flan',
    address,
    phone_number: normalizeText(merged.phoneNumber ?? merged.phone_number),
    opening_time: openingTime,
    closing_time: closingTime,
    preorder_time_slots: slots,
    latitude,
    longitude,
  };
};

export const getOperatingHoursMessage = (settings) => (
  `Orders are accepted from ${settings.openingTime} to ${settings.closingTime} (Philippine time). The shop is currently closed.`
);

export const buildShopSettingsStatus = (settings, referenceDate = new Date()) => ({
  ...settings,
  serverTime: referenceDate.toISOString(),
  timeZone: MANILA_TIME_ZONE,
  isOpen: isWithinOperatingHours(settings, referenceDate),
});

// Always read the persisted schedule at the point a new purchase is requested.
// The event stream's in-memory snapshot is never used to authorize a purchase.
export const assertShopOpen = async (supabase = getSupabaseAdmin(), referenceDate) => {
  const settings = await getShopSettings(supabase);
  if (!isWithinOperatingHours(settings, referenceDate || new Date())) {
    const error = new Error(getOperatingHoursMessage(settings));
    error.status = 403;
    error.code = 'SHOP_CLOSED';
    throw error;
  }
  return settings;
};

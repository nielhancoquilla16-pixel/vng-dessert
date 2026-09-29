export const SHOP_TIME_ZONE = 'Asia/Manila';

export const normalizeShopTime = (value) => {
  const match = String(value ?? '').trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/);
  return match ? `${match[1]}:${match[2]}` : '';
};

export const getShopTime = (referenceDate = new Date()) => {
  const date = new Date(referenceDate);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHOP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return `${parts.find((part) => part.type === 'hour').value}:${parts.find((part) => part.type === 'minute').value}`;
};

const MANILA_DAY_MS = 24 * 60 * 60 * 1000;
const manilaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const hasValidShopHours = (settings) => {
  const opening = normalizeShopTime(settings?.openingTime);
  const closing = normalizeShopTime(settings?.closingTime);
  return Boolean(opening && closing && opening !== closing);
};

// Select the most recent opening date in Manila. A closing time before the
// opening time belongs to the following date, including 00:00 at day's end.
export const getShopOperatingInterval = (settings, referenceDate = new Date()) => {
  const reference = new Date(referenceDate);
  if (!hasValidShopHours(settings) || !Number.isFinite(reference.getTime())) return null;
  const parts = manilaDateFormatter.formatToParts(reference);
  const read = (type) => parts.find((part) => part.type === type).value;
  const date = `${read('year')}-${read('month')}-${read('day')}`;
  const opening = normalizeShopTime(settings.openingTime);
  const closing = normalizeShopTime(settings.closingTime);
  // Manila uses UTC+08:00; parsing an explicit offset avoids the device/server TZ.
  let opensAt = Date.parse(`${date}T${opening}:00+08:00`);
  let closesAt = Date.parse(`${date}T${closing}:00+08:00`);
  if (closing < opening) closesAt += MANILA_DAY_MS;
  if (reference.getTime() < opensAt) {
    opensAt -= MANILA_DAY_MS;
    closesAt -= MANILA_DAY_MS;
  }
  return { opensAt, closesAt };
};

export const isWithinOperatingHours = (settings, referenceDate = new Date()) => {
  const interval = getShopOperatingInterval(settings, referenceDate);
  const timestamp = new Date(referenceDate).getTime();
  return Boolean(interval && timestamp >= interval.opensAt && timestamp < interval.closesAt);
};

export const isAvailablePreorderTime = (settings, time = '') => {
  if (!hasValidShopHours(settings)) return false;
  const normalized = normalizeShopTime(time);
  if (!normalized) return false;
  const opening = normalizeShopTime(settings.openingTime);
  const closing = normalizeShopTime(settings.closingTime);
  const withinHours = opening < closing
    ? normalized >= opening && normalized < closing
    : normalized >= opening || normalized < closing;
  const slots = settings.preorderTimeSlots || [];
  return withinHours && (slots.length === 0 || slots.includes(normalized));
};

export const formatShopTime = (value) => {
  const normalized = normalizeShopTime(value);
  if (!normalized) return '';
  const [hour, minute] = normalized.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};

export const normalizeShopSettings = (settings = {}) => ({
  id: settings.id ?? 1,
  shopName: settings.shopName || settings.shop_name || 'V&G Leche Flan',
  address: settings.address || '',
  phoneNumber: settings.phoneNumber || settings.phone_number || '',
  openingTime: normalizeShopTime(settings.openingTime ?? settings.opening_time),
  closingTime: normalizeShopTime(settings.closingTime ?? settings.closing_time),
  preorderTimeSlots: Array.isArray(settings.preorderTimeSlots ?? settings.preorder_time_slots)
    ? (settings.preorderTimeSlots ?? settings.preorder_time_slots).map(normalizeShopTime).filter(Boolean) : [],
  latitude: settings.latitude ?? '',
  longitude: settings.longitude ?? '',
  updatedAt: settings.updatedAt || settings.updated_at || null,
  serverTime: settings.serverTime || null,
});

// DB revisions take priority over arrival order. An old GET must not undo a save
// or a newer push event that arrived while that GET was in flight.
export const shouldAcceptShopSettings = (current, incoming, currentSequence, incomingSequence) => {
  const previousVersion = Date.parse(current?.updatedAt) || 0;
  const nextVersion = Date.parse(incoming?.updatedAt) || 0;
  if (nextVersion < previousVersion) return false;
  return nextVersion > previousVersion || incomingSequence >= currentSequence;
};

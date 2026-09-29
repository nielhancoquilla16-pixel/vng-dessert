// Kept portable for the independently deployed API and frontend. The parity
// tests exercise both implementations across date and operating-hour boundaries.
export const normalizeShopTime = (value) => {
  const match = String(value ?? '').trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/);
  return match ? `${match[1]}:${match[2]}` : '';
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

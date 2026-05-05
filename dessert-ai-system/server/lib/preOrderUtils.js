const PRE_ORDER_STATUS_ALIASES = new Map([
  ['approve', 'confirmed'],
  ['approved', 'confirmed'],
  ['complete', 'completed'],
  ['reject', 'rejected'],
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MANILA_TIME_ZONE = 'Asia/Manila';

export const VALID_PRE_ORDER_STATUSES = ['pending', 'confirmed', 'completed', 'rejected'];
export const VALID_PRE_ORDER_METHODS = ['cod', 'pickup'];

export const preOrderSelect = `
  id,
  user_id,
  product_id,
  customer_name,
  phone_number,
  address,
  quantity,
  preferred_order_date,
  preferred_order_time,
  pickup_date,
  pickup_time,
  scheduled_date,
  scheduled_time,
  delivery_method,
  status,
  rejection_reason,
  notifications,
  status_timestamps,
  created_at,
  updated_at,
  products (
    id,
    product_name,
    category,
    image_url,
    price
  )
`;

const normalizeText = (value = '') => String(value || '').trim();

export const normalizePreOrderStatus = (value = 'pending') => {
  const normalized = normalizeText(value).toLowerCase();
  return PRE_ORDER_STATUS_ALIASES.get(normalized) || normalized;
};

export const normalizePreOrderMethod = (value = 'cod') => {
  const normalized = normalizeText(value).toLowerCase();
  return VALID_PRE_ORDER_METHODS.includes(normalized) ? normalized : 'cod';
};

export const normalizeContactNumber = (value = '') => (
  normalizeText(value).replace(/[^\d+]/g, '')
);

export const isValidContactNumber = (value = '') => (
  /^(?:\+63|0)9\d{9}$/.test(normalizeContactNumber(value))
);

export const isValidDateInput = (value = '') => DATE_PATTERN.test(normalizeText(value));
export const isValidTimeInput = (value = '') => TIME_PATTERN.test(normalizeText(value));

const getZonedDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
};

export const isAtLeastNextDay = (dateValue = '') => {
  if (!isValidDateInput(dateValue)) {
    return false;
  }

  const manilaToday = getZonedDateString(new Date());
  const manilaTomorrow = new Date(`${manilaToday}T00:00:00`);
  manilaTomorrow.setDate(manilaTomorrow.getDate() + 1);

  return dateValue >= getZonedDateString(manilaTomorrow);
};

export const normalizePreOrderNotifications = (notifications = []) => (
  Array.isArray(notifications)
    ? notifications.map((notification) => ({
        audience: String(notification?.audience || 'customer').toLowerCase(),
        type: String(notification?.type || 'info').toLowerCase(),
        message: normalizeText(notification?.message || ''),
        createdAt: notification?.createdAt || notification?.created_at || new Date().toISOString(),
      }))
    : []
);

export const buildPreOrderNotificationEntry = (audience, type, message) => ({
  audience,
  type,
  message,
  createdAt: new Date().toISOString(),
});

export const buildPreOrderStatusTimestamps = (current = {}, nextStatus, at = new Date().toISOString()) => ({
  ...(current && typeof current === 'object' ? current : {}),
  [normalizePreOrderStatus(nextStatus)]: at,
});

export const mapPreOrder = (row = {}) => {
  const product = row.products || {};
  const deliveryMethod = normalizePreOrderMethod(row.delivery_method || 'cod');
  const status = normalizePreOrderStatus(row.status || 'pending');
  const preferredOrderDate = row.preferred_order_date || '';
  const preferredOrderTime = row.preferred_order_time || '';
  const pickupDate = row.pickup_date || '';
  const pickupTime = row.pickup_time || '';
  const scheduledDate = row.scheduled_date || preferredOrderDate || pickupDate || '';
  const scheduledTime = row.scheduled_time || preferredOrderTime || pickupTime || '';
  const notifications = normalizePreOrderNotifications(row.notifications || []);
  const statusTimestamps = row.status_timestamps && typeof row.status_timestamps === 'object'
    ? row.status_timestamps
    : {};

  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id || product.id || '',
    productName: product.product_name || 'Dessert Item',
    productCategory: product.category || 'Uncategorized',
    productImageUrl: product.image_url || '',
    productPrice: Number(product.price) || 0,
    customerName: row.customer_name || '',
    phoneNumber: row.phone_number || '',
    address: row.address || '',
    quantity: Number(row.quantity) || 0,
    preferredOrderDate,
    preferredOrderTime,
    pickupDate,
    pickupTime,
    scheduledDate,
    scheduledTime,
    deliveryMethod,
    methodLabel: deliveryMethod === 'pickup' ? 'Pickup' : 'Cash on Delivery (COD)',
    status,
    rejectionReason: row.rejection_reason || '',
    notifications,
    statusTimestamps,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || row.created_at || '',
  };
};

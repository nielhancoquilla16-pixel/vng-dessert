export const PRE_ORDER_STATUSES = ['pending', 'confirmed', 'completed', 'rejected'];

const PRE_ORDER_STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  rejected: 'Rejected',
};

const PRE_ORDER_METHOD_LABELS = {
  cod: 'Cash on Delivery (COD)',
  pickup: 'Pickup',
};

export const normalizePreOrderStatus = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'approve' || normalized === 'approved') {
    return 'confirmed';
  }

  if (normalized === 'reject') {
    return 'rejected';
  }

  if (normalized === 'complete') {
    return 'completed';
  }

  return PRE_ORDER_STATUSES.includes(normalized) ? normalized : 'pending';
};

export const getPreOrderStatusLabel = (value = '') => (
  PRE_ORDER_STATUS_LABELS[normalizePreOrderStatus(value)] || 'Pending'
);

export const getPreOrderMethodLabel = (value = '') => (
  PRE_ORDER_METHOD_LABELS[String(value || '').trim().toLowerCase()] || PRE_ORDER_METHOD_LABELS.cod
);

export const normalizePhoneNumber = (value = '') => (
  String(value || '').trim().replace(/[^\d+]/g, '')
);

export const isValidPhilippinePhoneNumber = (value = '') => (
  /^(?:\+63|0)9\d{9}$/.test(normalizePhoneNumber(value))
);

export const getTomorrowDateValue = () => {
  const nextDay = new Date();
  nextDay.setDate(nextDay.getDate() + 1);

  const year = nextDay.getFullYear();
  const month = String(nextDay.getMonth() + 1).padStart(2, '0');
  const day = String(nextDay.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildDateTime = (dateValue = '', timeValue = '') => {
  if (!dateValue || !timeValue) {
    return null;
  }

  const parsed = new Date(`${dateValue}T${timeValue}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatPreOrderDateTime = (dateValue = '', timeValue = '') => {
  const parsed = buildDateTime(dateValue, timeValue);

  if (!parsed) {
    return 'Not scheduled';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const getPreOrderScheduleValue = (preOrder = {}) => (
  formatPreOrderDateTime(preOrder.scheduledDate, preOrder.scheduledTime)
);

export const getPreOrderStatusRank = (value = '') => {
  const normalized = normalizePreOrderStatus(value);
  const order = {
    pending: 0,
    confirmed: 1,
    completed: 2,
    rejected: 3,
  };

  return order[normalized] ?? 99;
};

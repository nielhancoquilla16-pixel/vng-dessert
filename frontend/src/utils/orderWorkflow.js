const ORDER_STATUS_SEQUENCE = ['pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed', 'cancelled', 'refunded'];
const ORDER_STATUS_ALIASES = new Map([
  ['processing', 'preparing'],
  ['received', 'completed'],
  ['out_for_delivery', 'out-for-delivery'],
  ['out for delivery', 'out-for-delivery'],
  ['returned/refunded', 'refunded'],
  ['returned', 'refunded'],
]);

const ORDER_STATUS_LABELS = {
  pending: 'Pending Confirmation',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  'out-for-delivery': 'Out for Delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Returned',
};

const CUSTOMER_STATUS_LABELS = {
  ...ORDER_STATUS_LABELS,
  refunded: 'Returned',
};

const REVIEW_STATUS_LABELS = {
  none: 'None',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const WORKFLOW_STEPS = ['pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed'];

export const normalizeOrderStatus = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ORDER_STATUS_ALIASES.get(normalized) || normalized;
};

export const normalizeReviewStatus = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'under review') {
    return 'under_review';
  }

  if (['none', 'under_review', 'approved', 'rejected'].includes(normalized)) {
    return normalized;
  }

  return 'none';
};

export const normalizeDeliveryMethod = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[ _]+/g, '-');
  if (['pickup', 'pick-up', 'collection', 'in-store'].includes(normalized)) {
    return 'pickup';
  }
  if (normalized === 'home-delivery') {
    return 'delivery';
  }
  return normalized;
};

export const getOrderStatusLabel = (status = '', audience = 'customer') => {
  const normalized = normalizeOrderStatus(status);
  if (audience === 'admin') {
    return ORDER_STATUS_LABELS[normalized] || normalized;
  }

  return CUSTOMER_STATUS_LABELS[normalized] || ORDER_STATUS_LABELS[normalized] || normalized;
};

export const getReviewStatusLabel = (status = '') => (
  REVIEW_STATUS_LABELS[normalizeReviewStatus(status)] || 'None'
);

export const getPaymentStatusLabel = (order = {}) => {
  const paymentMethod = String(order.paymentMethod || order.payment_method || '').toLowerCase();
  const deliveryMethod = String(order.deliveryMethod || order.delivery_method || '').toLowerCase();
  const checkoutStatus = String(
    order.paymentCheckoutStatus
    || order.payment_checkout_status
    || order.checkoutStatus
    || order.checkout_status
    || '',
  ).toLowerCase();

  if (paymentMethod === 'online') {
    if (['fulfilled', 'paid'].includes(checkoutStatus)) {
      return 'Paid online';
    }

    if (['failed', 'expired', 'cancelled'].includes(checkoutStatus)) {
      return 'Online payment failed';
    }

    if (checkoutStatus === 'created') {
      return 'Waiting for online payment';
    }

    return 'Online payment';
  }

  if (paymentMethod === 'gcash') {
    return 'GCash';
  }

  if (deliveryMethod === 'delivery') {
    return 'Cash on Delivery';
  }

  if (deliveryMethod === 'pickup') {
    return 'Pay at Store';
  }

  return 'Cash';
};

export const isTerminalOrderStatus = (status = '') => {
  const normalized = normalizeOrderStatus(status);
  return ['completed', 'cancelled', 'refunded'].includes(normalized);
};

export const isHistoryOrderStatus = (status = '') => isTerminalOrderStatus(status);

export const isDeliveryOrder = (order = {}) => normalizeDeliveryMethod(order.deliveryMethod || order.delivery_method) === 'delivery';

export const isPickupOrder = (order = {}) => normalizeDeliveryMethod(order.deliveryMethod || order.delivery_method) === 'pickup';

export const isWalkInOrder = (order) => {
  // Handle null/undefined
  if (!order || typeof order !== 'object') {
    return false;
  }

  if (typeof order.isWalkInOrder === 'boolean') {
    return order.isWalkInOrder;
  }

  if (typeof order.is_walk_in_order === 'boolean') {
    return order.is_walk_in_order;
  }

  const placedByRole = String(
    order.placedByRole
    || order.placed_by_role
    || order.customerRole
    || order.customer_role
    || order.profiles?.role
    || '',
  ).toLowerCase();
  const deliveryMethod = normalizeDeliveryMethod(order.deliveryMethod || order.delivery_method);
  const paymentMethod = String(order.paymentMethod || order.payment_method || '').toLowerCase();

  return ['admin', 'staff'].includes(placedByRole)
    && deliveryMethod === 'pickup'
    && paymentMethod !== 'online';
};

export const hasLecheFlanItems = (items = []) => (
  items.some((item) => {
    const name = String(item?.name || item?.product_name || item?.productName || '').toLowerCase();
    const category = String(item?.category || '').toLowerCase();
    const description = String(item?.description || '').toLowerCase();

    return /leche\s*flan/.test(name) || /leche\s*flan/.test(category) || /leche\s*flan/.test(description);
  })
);

export const canCustomerCancelOrder = (order = {}) => normalizeOrderStatus(order.status || order.orderStatus) === 'pending';

export const canConfirmPickupOrder = (order = {}, now = Date.now()) => {
  const status = normalizeOrderStatus(order.status || order.orderStatus || order.order_status);
  const verificationMethod = String(order.verificationMethod || order.verification_method || '').toLowerCase();
  const qrUsedAt = order.qrUsedAt || order.qr_used_at;
  const verifiedAt = order.verifiedAt || order.verified_at;
  const scannedConfirmedPickup = status === 'confirmed'
    && verificationMethod === 'qr'
    && Boolean(qrUsedAt)
    && Boolean(verifiedAt);

  if (!isPickupOrder(order) || (status !== 'ready' && !scannedConfirmedPickup)) {
    return false;
  }

  if (order.verificationRequired === false || order.verification_required === false) {
    return status === 'ready';
  }

  const expiresAt = Date.parse(order.qrExpiresAt || order.qr_expires_at || '');
  return Number.isFinite(expiresAt) && expiresAt > now;
};

export const canStaffCancelOrder = (order = {}) => !['delivered', 'completed', 'refunded', 'cancelled'].includes(normalizeOrderStatus(order.status || order.orderStatus));

export const hasCustomerConfirmationPending = (order = {}) => (
  normalizeOrderStatus(order.status || order.orderStatus) === 'delivered'
  && !order.receiptReceivedAt
  && !order.receipt_received_at
  && normalizeReviewStatus(order.reviewStatus || order.review_status) !== 'under_review'
);

export const canCustomerConfirmReceipt = (order = {}) => (
  hasCustomerConfirmationPending(order)
);

export const canCustomerReportIssue = (order = {}) => (
  normalizeOrderStatus(order.status || order.orderStatus) === 'delivered'
  && normalizeReviewStatus(order.reviewStatus || order.review_status) !== 'under_review'
  && !order.receiptReceivedAt
  && !order.receipt_received_at
);

export const normalizeReturnRefundStatus = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['pending', 'approved', 'processing', 'refunded', 'completed', 'rejected'].includes(normalized)
    ? normalized
    : 'none';
};

export const getReturnRefundStatusLabel = (value = '') => {
  const status = normalizeReturnRefundStatus(value);
  if (status === 'none') return 'No request';
  if (status === 'pending') return 'Refund Requested';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

export const canCustomerRequestReturnRefund = (order = {}) => (
  ['delivered', 'completed'].includes(normalizeOrderStatus(order.status || order.orderStatus))
  && normalizeReturnRefundStatus(order.returnRefundStatus || order.return_refund_status) === 'none'
);

export const buildOrderWorkflowProgress = (status = '') => {
  const normalized = normalizeOrderStatus(status);
  const activeIndex = WORKFLOW_STEPS.indexOf(normalized);

  return WORKFLOW_STEPS.map((step, index) => ({
    status: step,
    label: getOrderStatusLabel(step, 'admin'),
    isCurrent: step === normalized,
    isComplete: activeIndex >= 0 && index < activeIndex,
    isUpcoming: activeIndex < 0 || index > activeIndex,
  }));
};

export const getStatusChipClass = (status = '') => `status-${normalizeOrderStatus(status)}`;

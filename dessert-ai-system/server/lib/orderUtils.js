import { publicErrorMessage } from './publicErrors.js';
import { randomUUID } from 'node:crypto';
import { getExpiryStatus } from './expiry.js';
import { mapReturnRefundRequest, normalizeReturnRefundStatus } from './returnRefund.js';
import { createOrderQrExpiry, getOrderQrExpiry, isOrderQrExpired } from './orderQr.js';

const ORDER_STATUS_SEQUENCE = ['pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed', 'cancelled', 'refunded'];
const ORDER_STATUS_ALIASES = new Map([
  ['processing', 'preparing'],
  ['received', 'completed'],
  ['out_for_delivery', 'out-for-delivery'],
  ['out for delivery', 'out-for-delivery'],
  ['returned/refunded', 'refunded'],
  ['returned', 'refunded'],
]);

export const VALID_ORDER_STATUSES = ORDER_STATUS_SEQUENCE;
export const DELIVERY_FEE = 50;
export const DEFAULT_READY_NOTIFICATION_MESSAGE = 'Your order is ready for pickup. Please proceed to the cashier and present your QR code.';
export const ORDER_QR_PREFIX = 'vng-order:';
export const ADDRESS_GEOCODE_ERROR = "Select the customer's exact delivery location on the map to set a valid pin.";

const STATUS_TIMESTAMP_KEYS = {
  pending: 'pending',
  confirmed: 'confirmed',
  preparing: 'preparing',
  ready: 'ready',
  'out-for-delivery': 'out_for_delivery',
  delivered: 'delivered',
  completed: 'completed',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

export const normalizeOrderStatus = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ORDER_STATUS_ALIASES.get(normalized) || normalized;
};

export const normalizeDeliveryMethod = (value = 'pickup') => {
  const normalized = String(value || 'pickup').trim().toLowerCase().replace(/[ _]+/g, '-');
  if (['pickup', 'pick-up', 'collection', 'in-store'].includes(normalized)) {
    return 'pickup';
  }
  if (normalized === 'home-delivery') {
    return 'delivery';
  }
  return normalized;
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

export const normalizeStatusTimestamps = (value = {}) => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value).reduce((accumulator, [key, timestamp]) => {
    const normalizedKey = normalizeOrderStatus(key);
    const mappedKey = STATUS_TIMESTAMP_KEYS[normalizedKey] || key;

    if (timestamp) {
      accumulator[mappedKey] = timestamp;
    }

    return accumulator;
  }, {});
};

export const normalizeNotifications = (value = []) => (
  Array.isArray(value)
    ? value.map((entry) => ({
        id: String(entry?.id || entry?.notificationId || '').trim(),
        audience: String(entry?.audience || 'customer').toLowerCase(),
        type: String(entry?.type || 'info').toLowerCase(),
        message: String(entry?.message || entry?.title || '').trim(),
        createdAt: entry?.createdAt || entry?.created_at || new Date().toISOString(),
      }))
    : []
);

export const hasLecheFlanItems = (items = []) => (
  items.some((item) => {
    const name = String(item?.name || item?.product_name || item?.productName || '').toLowerCase();
    const category = String(item?.category || '').toLowerCase();
    const description = String(item?.description || '').toLowerCase();

    return /leche\s*flan/.test(name) || /leche\s*flan/.test(category) || /leche\s*flan/.test(description);
  })
);

export const getLecheFlanRestrictionMessage = (distanceKm) => (
  Number(distanceKm) > 3
    ? 'Leche flan delivery is limited to 3 km only.'
    : ''
);

export const isCashOnDelivery = (deliveryMethod = 'pickup', paymentMethod = 'cash') => (
  normalizeDeliveryMethod(deliveryMethod) === 'delivery'
  && String(paymentMethod || 'cash').toLowerCase() === 'cash'
);

const normalizeText = (value = '') => String(value || '').trim();

const firstText = (...values) => (
  values
    .map((value) => normalizeText(value))
    .find(Boolean) || ''
);

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

const normalizeCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildDeliveryAddressText = ({
  streetAddress = '',
  barangay = '',
  city = '',
  province = '',
  postalCode = '',
} = {}) => (
  [streetAddress, barangay, city, province, postalCode]
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
    .join(', ')
);

export const normalizeDeliveryAddressFields = (source = {}, fallback = {}) => {
  const nested = source.deliveryAddress && typeof source.deliveryAddress === 'object'
    ? source.deliveryAddress
    : {};
  const recipientName = firstText(
    source.deliveryRecipientName,
    source.delivery_recipient_name,
    source.recipientName,
    nested.recipientName,
    fallback.recipientName,
  );
  const contactNumber = firstText(
    source.deliveryContactNumber,
    source.delivery_contact_number,
    source.contactNumber,
    nested.contactNumber,
    fallback.contactNumber,
  );
  const streetAddress = firstText(
    source.deliveryStreetAddress,
    source.delivery_street_address,
    source.streetAddress,
    nested.streetAddress,
    fallback.streetAddress,
  );
  const barangay = firstText(
    source.deliveryBarangay,
    source.delivery_barangay,
    source.barangay,
    nested.barangay,
    fallback.barangay,
  );
  const city = firstText(
    source.deliveryCity,
    source.delivery_city,
    source.city,
    nested.city,
    fallback.city,
  );
  const province = firstText(
    source.deliveryProvince,
    source.delivery_province,
    source.province,
    nested.province,
    fallback.province,
  );
  const postalCode = firstText(
    source.deliveryPostalCode,
    source.delivery_postal_code,
    source.postalCode,
    nested.postalCode,
    fallback.postalCode,
  );
  const structuredAddress = buildDeliveryAddressText({
    streetAddress,
    barangay,
    city,
    province,
    postalCode,
  });
  const formattedAddress = firstText(
    source.deliveryFormattedAddress,
    source.delivery_formatted_address,
    source.formattedAddress,
    nested.formattedAddress,
    source.address,
    fallback.formattedAddress,
    fallback.address,
    structuredAddress,
  );
  const latitude = normalizeCoordinate(firstDefined(
    source.deliveryLatitude,
    source.delivery_latitude,
    source.destinationLatitude,
    source.destination_latitude,
    source.latitude,
    nested.latitude,
    fallback.latitude,
  ));
  const longitude = normalizeCoordinate(firstDefined(
    source.deliveryLongitude,
    source.delivery_longitude,
    source.destinationLongitude,
    source.destination_longitude,
    source.longitude,
    nested.longitude,
    fallback.longitude,
  ));

  return {
    recipientName,
    contactNumber,
    streetAddress,
    barangay,
    city,
    province,
    postalCode,
    formattedAddress,
    address: formattedAddress || structuredAddress,
    placeId: firstText(
      source.deliveryPlaceId,
      source.delivery_place_id,
      source.placeId,
      nested.placeId,
      fallback.placeId,
    ),
    latitude,
    longitude,
  };
};

export const isValidDeliveryCoordinates = ({ latitude, longitude } = {}) => {
  if (latitude == null || longitude == null || String(latitude).trim() === '' || String(longitude).trim() === '') {
    return false;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;
};

const LALAMOVE_STATUS_LABELS = {
  ASSIGNING_DRIVER: 'Pending Driver',
  ON_GOING: 'Driver Assigned',
  PICKED_UP: 'Picked Up',
  COMPLETED: 'Delivered',
  CANCELED: 'Cancelled',
  CANCELLED: 'Cancelled',
  REJECTED: 'Cancelled',
  EXPIRED: 'Cancelled',
};

const normalizeLalamoveStatus = (value = '') => (
  String(value || '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase()
);

const getLalamoveStatusLabel = (value = '') => {
  const normalized = normalizeLalamoveStatus(value);
  return LALAMOVE_STATUS_LABELS[normalized] || (normalized ? normalized.replace(/_/g, ' ') : 'Not Booked');
};

const normalizeLalamoveDriverInfo = (value = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const coordinates = source.coordinates && typeof source.coordinates === 'object'
    ? source.coordinates
    : {};

  return {
    driverId: source.driverId || source.driver_id || '',
    name: source.name || '',
    phone: source.phone || '',
    plateNumber: source.plateNumber || source.plate_number || '',
    photo: source.photo || '',
    coordinates: {
      latitude: coordinates.latitude || coordinates.lat || null,
      longitude: coordinates.longitude || coordinates.lng || null,
      updatedAt: coordinates.updatedAt || coordinates.updated_at || null,
    },
  };
};

export const shouldRequireOrderVerification = (deliveryMethod = 'pickup', paymentMethod = 'cash') => (
  !isCashOnDelivery(deliveryMethod, paymentMethod)
);

export const generateOrderQrToken = () => (
  `VNGQR-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`
);

export const generateFeedbackToken = () => (
  `VNGFB-${randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase()}`
);

export const buildOrderQrPayload = (token = '') => {
  const normalizedToken = String(token || '').trim().toUpperCase();
  return normalizedToken ? `${ORDER_QR_PREFIX}${normalizedToken}` : '';
};

export const extractOrderQrToken = (value = '') => {
  const normalizedInput = String(value || '').trim();

  if (!normalizedInput) {
    return '';
  }

  const normalizedLower = normalizedInput.toLowerCase();

  if (normalizedLower.startsWith(ORDER_QR_PREFIX)) {
    return normalizedInput.slice(ORDER_QR_PREFIX.length).trim().toUpperCase();
  }

  if (normalizedInput.startsWith('{') && normalizedInput.endsWith('}')) {
    try {
      const parsed = JSON.parse(normalizedInput);
      const token = parsed?.qrToken || parsed?.token || parsed?.verificationToken || '';
      return String(token || '').trim().toUpperCase();
    } catch {
      return '';
    }
  }

  const normalizedUpper = normalizedInput.toUpperCase();
  if (normalizedUpper.startsWith('VNGQR-')) {
    return normalizedUpper;
  }

  return '';
};

export const normalizeIssueReport = (report = {}) => ({
  id: report.id,
  orderId: report.order_id || report.orderId || '',
  userId: report.user_id || report.userId || '',
  customerName: report.customer_name || report.customerName || '',
  issueType: report.issue_type || report.issueType || 'damage',
  description: report.description || '',
  evidenceImageUrl: report.evidence_image_url || report.evidenceImageUrl || '',
  detectionDate: report.detection_date || report.detectionDate || report.created_at || report.createdAt || '',
  reviewStatus: normalizeReviewStatus(report.review_status || report.reviewStatus || 'under_review'),
  status: normalizeReviewStatus(report.review_status || report.reviewStatus || 'under_review'),
  reviewReason: report.review_reason || report.reviewReason || '',
  reviewedBy: report.reviewed_by || report.reviewedBy || '',
  reviewedAt: report.reviewed_at || report.reviewedAt || null,
  createdAt: report.created_at || report.createdAt || '',
  updatedAt: report.updated_at || report.updatedAt || '',
});

const buildInitialNotifications = ({
  orderStatus,
  orderCode,
  cancellationReason = '',
  customerName = 'Customer',
}) => {
  const now = new Date().toISOString();
  const normalizedStatus = normalizeOrderStatus(orderStatus);

  if (normalizedStatus === 'cancelled') {
    const message = cancellationReason || 'Your order was cancelled before it could continue in the workflow.';

    return [
      {
        audience: 'customer',
        type: 'order_cancelled',
        message,
        createdAt: now,
      },
      {
        audience: 'admin_staff',
        type: 'order_cancelled',
        message: `Order ${orderCode} was cancelled. ${message}`,
        createdAt: now,
      },
    ];
  }

  if (normalizedStatus === 'confirmed') {
    return [
      {
        audience: 'customer',
        type: 'order_confirmed',
        message: `${customerName}, your order ${orderCode} has been accepted and is now being processed.`,
        createdAt: now,
      },
      {
        audience: 'admin_staff',
        type: 'order_confirmed',
        message: `Order ${orderCode} has been accepted and is now being processed.`,
        createdAt: now,
      },
    ];
  }

  if (normalizedStatus === 'ready') {
    return [
      {
        audience: 'customer',
        type: 'order_ready',
        message: `${customerName}, your order ${orderCode} is ready for pickup.`,
        createdAt: now,
      },
      {
        audience: 'admin_staff',
        type: 'order_ready',
        message: `Order ${orderCode} is ready for handoff.`,
        createdAt: now,
      },
    ];
  }

  return [
    {
      audience: 'customer',
      type: 'order_pending',
      message: `${customerName}, your order ${orderCode} is pending confirmation.`,
      createdAt: now,
    },
    {
      audience: 'admin_staff',
      type: 'new_order',
      message: `Order ${orderCode} is pending confirmation.`,
      createdAt: now,
    },
  ];
};

export const generateOrderCode = () => `VNG-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

export const orderSelect = `
  id,
  order_code,
  user_id,
  customer_name,
  phone_number,
  address,
  delivery_method,
  payment_method,
  delivery_address_id,
  cash_received,
  change_amount,
  total_price,
  order_status,
  review_status,
  review_reason,
  review_status_updated_at,
  cancellation_reason,
  delivery_distance_km,
  delivery_recipient_name,
  delivery_contact_number,
  delivery_street_address,
  delivery_barangay,
  delivery_city,
  delivery_province,
  delivery_postal_code,
  delivery_formatted_address,
  delivery_place_id,
  delivery_latitude,
  delivery_longitude,
  delivery_instructions,
  contains_leche_flan,
  inventory_deducted_at,
  lalamove_order_id,
  lalamove_quotation_id,
  lalamove_status,
  lalamove_share_link,
  lalamove_driver_id,
  lalamove_driver_info,
  lalamove_price_breakdown,
  lalamove_distance_meters,
  lalamove_estimated_delivery_at,
  lalamove_booked_at,
  lalamove_last_synced_at,
  lalamove_booking_error,
  lalamove_metadata,
  verification_required,
  qr_token,
  qr_generated_at,
  qr_expires_at,
  qr_used_at,
  verified_at,
  verified_by,
  verification_method,
  feedback_token,
  feedback_token_generated_at,
  qr_claimed_at,
  ready_notified_at,
  ready_notification_message,
  receipt_image_url,
  receipt_received_at,
  return_refund_status,
  return_refund_request_id,
  notifications,
  status_timestamps,
  updated_at,
  created_at,
  order_items (
    id,
    product_id,
    quantity,
    price,
    products (
      id,
      product_name,
      category,
      image_url,
      availability,
      expiration_date,
      expiration_at
    )
  ),
  return_refund_requests!return_refund_requests_order_id_fkey (
    id,
    order_id,
    user_id,
    request_type,
    reason,
    customer_message,
    evidence_image_url,
    status,
    rejection_reason,
    status_history,
    approved_at,
    processing_at,
    refunded_at,
    completed_at,
    rejected_at,
    created_at,
    updated_at
  ),
  order_issue_reports (
    id,
    user_id,
    customer_name,
    issue_type,
    description,
    evidence_image_url,
    detection_date,
    review_status,
    review_reason,
    reviewed_by,
    reviewed_at,
    created_at,
    updated_at
  ),
  payment_checkouts!payment_checkouts_order_id_fkey (
    id,
    provider,
    status,
    payment_method,
    reference_number,
    checkout_session_id,
    checkout_url,
    amount,
    currency,
    failure_reason,
    paid_at,
    created_at,
    updated_at,
    order_id
  )
`;

const ORDER_PROFILE_SELECT = `
  id,
  username,
  email,
  full_name,
  role
`;

export const hydrateOrdersWithProfiles = async (supabase, orders = []) => {
  const rows = Array.isArray(orders) ? orders.filter(Boolean) : [];

  if (rows.length === 0) {
    return [];
  }

  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];

  if (userIds.length === 0) {
    return rows.map((row) => ({
      ...row,
      profiles: null,
    }));
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(ORDER_PROFILE_SELECT)
    .in('id', userIds);

  if (error) {
    throw error;
  }

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return rows.map((row) => ({
    ...row,
    profiles: profilesById.get(row.user_id) || null,
  }));
};

export const hydrateOrderWithProfile = async (supabase, order = null) => {
  if (!order) {
    return null;
  }

  const [hydratedOrder] = await hydrateOrdersWithProfiles(supabase, [order]);
  return hydratedOrder || null;
};

export const toDisplayId = (id) => `ORD-${String(id).replace(/-/g, '').slice(0, 4).toUpperCase()}`;

export const formatCurrency = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

export const getPaymentLabel = (value = 'cash') => {
  const normalized = String(value || 'cash').toLowerCase();

  if (normalized === 'gcash') {
    return 'GCash';
  }

  if (normalized === 'online') {
    return 'Online Payment';
  }

  return 'Cash';
};

const getPaymentStatusLabel = ({
  paymentMethod = 'cash',
  deliveryMethod = 'pickup',
  paymentCheckoutStatus = '',
} = {}) => {
  const normalizedPaymentMethod = String(paymentMethod || 'cash').toLowerCase();
  const normalizedDeliveryMethod = String(deliveryMethod || 'pickup').toLowerCase();
  const normalizedCheckoutStatus = String(paymentCheckoutStatus || '').toLowerCase();

  if (normalizedPaymentMethod === 'online') {
    if (['fulfilled', 'paid'].includes(normalizedCheckoutStatus)) {
      return 'Paid online';
    }

    if (['failed', 'expired', 'cancelled'].includes(normalizedCheckoutStatus)) {
      return 'Online payment failed';
    }

    if (normalizedCheckoutStatus === 'created') {
      return 'Waiting for online payment';
    }

    return 'Online payment';
  }

  if (normalizedPaymentMethod === 'gcash') {
    return 'GCash';
  }

  if (normalizedDeliveryMethod === 'delivery') {
    return 'Cash on Delivery';
  }

  if (normalizedDeliveryMethod === 'pickup') {
    return 'Pay at Store';
  }

  return 'Cash';
};

const normalizePaymentCheckout = (checkout = {}) => ({
  id: checkout.id,
  provider: checkout.provider || 'paymongo',
  status: String(checkout.status || '').toLowerCase(),
  paymentMethod: String(checkout.payment_method || checkout.paymentMethod || 'online').toLowerCase(),
  referenceNumber: checkout.reference_number || checkout.referenceNumber || '',
  checkoutSessionId: checkout.checkout_session_id || checkout.checkoutSessionId || '',
  checkoutUrl: checkout.checkout_url || checkout.checkoutUrl || '',
  amount: Number(checkout.amount) || 0,
  currency: checkout.currency || 'PHP',
  failureReason: checkout.failure_reason || checkout.failureReason || '',
  paidAt: checkout.paid_at || checkout.paidAt || null,
  createdAt: checkout.created_at || checkout.createdAt || '',
  updatedAt: checkout.updated_at || checkout.updatedAt || '',
  orderId: checkout.order_id || checkout.orderId || '',
});

export const buildItemsText = (items = []) => (
  items
    .map((item) => `${item.quantity}x ${item.product?.productName || item.name || 'Unknown Product'}`)
    .join(', ')
);

export const mapOrder = (row) => {
  const mappedItems = (row.order_items || []).map((item) => ({
    id: item.id,
    productId: item.product_id,
    quantity: Number(item.quantity) || 0,
    price: Number(item.price) || 0,
    name: item.products?.product_name || 'Unknown Product',
    category: item.products?.category || 'Uncategorized',
    lineTotal: (Number(item.price) || 0) * (Number(item.quantity) || 0),
    product: item.products
      ? {
          id: item.products.id,
          productName: item.products.product_name,
          category: item.products.category,
          imageUrl: item.products.image_url,
          availability: item.products.availability || 'available',
          expirationDate: item.products.expiration_date || '',
          expirationAt: item.products.expiration_at || null,
        }
      : null,
  }));

  const customerName = row.customer_name
    || row.profiles?.full_name
    || row.profiles?.username
    || 'Customer';

  const deliveryMethod = normalizeDeliveryMethod(row.delivery_method || 'pickup');
  const paymentMethod = String(row.payment_method || 'cash').toLowerCase();
  const paymentCheckouts = (row.payment_checkouts || [])
    .map(normalizePaymentCheckout)
    .sort((left, right) => (
      new Date(right.updatedAt || right.createdAt || 0).getTime()
      - new Date(left.updatedAt || left.createdAt || 0).getTime()
    ));
  const latestPaymentCheckout = paymentCheckouts[0] || null;
  const normalizedStatus = normalizeOrderStatus(row.order_status || 'pending');
  const normalizedReviewStatus = normalizeReviewStatus(row.review_status || 'none');
  const orderCode = row.order_code || toDisplayId(row.id);
  const createdAt = row.created_at || new Date().toISOString();
  const totalPrice = Number(row.total_price) || 0;
  const statusTimestamps = normalizeStatusTimestamps(row.status_timestamps || {});
  const notifications = normalizeNotifications(row.notifications || []);
  const issueReports = (row.order_issue_reports || [])
    .map(normalizeIssueReport)
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt || left.detectionDate || 0).getTime();
      const rightTime = new Date(right.createdAt || right.detectionDate || 0).getTime();
      return rightTime - leftTime;
    });
  const returnRefundRequests = (row.return_refund_requests || [])
    .map(mapReturnRefundRequest)
    .sort((left, right) => new Date(right.submittedAt || right.updatedAt || 0).getTime()
      - new Date(left.submittedAt || left.updatedAt || 0).getTime());
  const latestReturnRefundRequest = returnRefundRequests[0] || null;
  const storedReturnRefundStatus = String(row.return_refund_status || 'none').toLowerCase();
  const returnRefundStatus = latestReturnRefundRequest?.status
    || (storedReturnRefundStatus === 'none' ? 'none' : normalizeReturnRefundStatus(storedReturnRefundStatus));
  const deliveryDistanceKm = Number(row.delivery_distance_km);
  const deliveryLatitude = Number(row.delivery_latitude);
  const deliveryLongitude = Number(row.delivery_longitude);
  const deliveryAddress = normalizeDeliveryAddressFields({
    delivery_recipient_name: row.delivery_recipient_name,
    delivery_contact_number: row.delivery_contact_number,
    delivery_street_address: row.delivery_street_address,
    delivery_barangay: row.delivery_barangay,
    delivery_city: row.delivery_city,
    delivery_province: row.delivery_province,
    delivery_postal_code: row.delivery_postal_code,
    delivery_formatted_address: row.delivery_formatted_address,
    delivery_place_id: row.delivery_place_id,
    delivery_latitude: row.delivery_latitude,
    delivery_longitude: row.delivery_longitude,
  }, {
    recipientName: customerName,
    contactNumber: row.phone_number || '',
    formattedAddress: row.address || '',
  });
  const lalamoveStatus = normalizeLalamoveStatus(row.lalamove_status || '');
  const lalamoveDriverInfo = normalizeLalamoveDriverInfo(row.lalamove_driver_info || {
    driverId: row.lalamove_driver_id || '',
  });
  const lalamovePriceBreakdown = row.lalamove_price_breakdown && typeof row.lalamove_price_breakdown === 'object'
    ? row.lalamove_price_breakdown
    : null;
  const lalamoveTracking = {
    booked: Boolean(row.lalamove_order_id),
    orderId: row.lalamove_order_id || '',
    quotationId: row.lalamove_quotation_id || '',
    status: lalamoveStatus,
    statusLabel: getLalamoveStatusLabel(lalamoveStatus),
    shareLink: row.lalamove_share_link || '',
    driverId: row.lalamove_driver_id || lalamoveDriverInfo.driverId || '',
    driver: lalamoveDriverInfo,
    priceBreakdown: lalamovePriceBreakdown,
    totalFee: lalamovePriceBreakdown?.total || '',
    currency: lalamovePriceBreakdown?.currency || 'PHP',
    distanceMeters: Number.isFinite(Number(row.lalamove_distance_meters))
      ? Number(row.lalamove_distance_meters)
      : null,
    estimatedDeliveryAt: row.lalamove_estimated_delivery_at || null,
    bookedAt: row.lalamove_booked_at || null,
    lastSyncedAt: row.lalamove_last_synced_at || null,
    bookingError: row.lalamove_booking_error ? publicErrorMessage('', 500) : '',
    metadata: null, // Provider diagnostics remain internal.
  };
  const containsLecheFlan = Boolean(
    row.contains_leche_flan
    || hasLecheFlanItems(mappedItems),
  );
  const placedByRole = String(row.profiles?.role || '').toLowerCase();
  const isWalkInOrder = ['admin', 'staff'].includes(placedByRole)
    && deliveryMethod === 'pickup'
    && paymentMethod !== 'online';
  const paymentCheckoutStatus = latestPaymentCheckout?.status || '';
  const pickupPaymentLabel = paymentMethod === 'online' ? 'Online Payment' : 'Pay at Store';
  const subtext = deliveryMethod === 'delivery'
    ? (row.address || 'Delivery')
    : (isWalkInOrder
      ? `Walk-in / ${pickupPaymentLabel}`
      : `Pick-up / ${pickupPaymentLabel}`);
  const latestIssueReport = issueReports[0] || null;
  const verificationRequired = Boolean(
    row.verification_required ?? shouldRequireOrderVerification(deliveryMethod, paymentMethod),
  );
  const qrToken = verificationRequired ? String(row.qr_token || '').toUpperCase() : '';
  const qrPayload = buildOrderQrPayload(qrToken);
  const qrUsedAt = row.qr_used_at || row.qr_claimed_at || null;
  const qrExpiresAt = getOrderQrExpiry(row);
  const qrActive = verificationRequired
    && Boolean(qrToken)
    && !qrUsedAt
    && !isOrderQrExpired(row)
    && !['completed', 'cancelled', 'refunded', 'delivered'].includes(normalizedStatus);
  const feedbackToken = !['pending', 'cancelled', 'refunded'].includes(normalizedStatus)
    ? String(row.feedback_token || '').toUpperCase()
    : '';

  return {
    id: row.id,
    orderId: orderCode,
    orderCode,
    displayId: orderCode,
    userId: row.user_id,
    customer: customerName,
    customerUsername: row.profiles?.username || '',
    customerEmail: row.profiles?.email || '',
    placedByRole,
    isWalkInOrder,
    phoneNumber: row.phone_number || '',
    address: row.address || '',
    deliveryMethod,
    paymentMethod,
    deliveryAddressId: row.delivery_address_id || null,
    cashReceived: Number.isFinite(Number(row.cash_received)) ? Number(row.cash_received) : null,
    changeAmount: Number.isFinite(Number(row.change_amount)) ? Number(row.change_amount) : null,
    deliveryDistanceKm: Number.isFinite(deliveryDistanceKm) ? deliveryDistanceKm : null,
    deliveryLatitude: Number.isFinite(deliveryLatitude) ? deliveryLatitude : null,
    deliveryLongitude: Number.isFinite(deliveryLongitude) ? deliveryLongitude : null,
    deliveryCoordinates: {
      latitude: Number.isFinite(deliveryLatitude) ? deliveryLatitude : null,
      longitude: Number.isFinite(deliveryLongitude) ? deliveryLongitude : null,
    },
    deliveryRecipientName: deliveryAddress.recipientName,
    deliveryContactNumber: deliveryAddress.contactNumber,
    deliveryStreetAddress: deliveryAddress.streetAddress,
    deliveryBarangay: deliveryAddress.barangay,
    deliveryCity: deliveryAddress.city,
    deliveryProvince: deliveryAddress.province,
    deliveryPostalCode: deliveryAddress.postalCode,
    deliveryFormattedAddress: deliveryAddress.formattedAddress,
    deliveryPlaceId: deliveryAddress.placeId,
    deliveryAddress,
    deliveryInstructions: row.delivery_instructions || '',
    isCodOrder: isCashOnDelivery(deliveryMethod, paymentMethod),
    containsLecheFlan,
    subtext,
    totalPrice,
    totalAmount: totalPrice,
    total: formatCurrency(totalPrice),
    orderStatus: normalizedStatus,
    status: normalizedStatus,
    reviewStatus: normalizedReviewStatus,
    reviewReason: row.review_reason || '',
    reviewStatusUpdatedAt: row.review_status_updated_at || null,
    returnRefundStatus,
    returnRefundRequestId: row.return_refund_request_id || latestReturnRefundRequest?.id || null,
    returnRefundRequests,
    latestReturnRefundRequest,
    cancellationReason: row.cancellation_reason || '',
    inventoryDeductedAt: row.inventory_deducted_at || null,
    createdAt,
    updatedAt: row.updated_at || createdAt,
    date: createdAt.split('T')[0],
    lineItems: mappedItems,
    items: buildItemsText(mappedItems),
    itemsText: buildItemsText(mappedItems),
    verificationRequired,
    verificationMethod: row.verification_method || '',
    verifiedAt: row.verified_at || null,
    verifiedBy: row.verified_by || null,
    qrToken,
    qrPayload,
    qrGeneratedAt: row.qr_generated_at || null,
    qrExpiresAt,
    qrExpired: verificationRequired && Boolean(qrToken) && isOrderQrExpired(row),
    qrUsedAt,
    feedbackToken,
    feedbackTokenGeneratedAt: row.feedback_token_generated_at || null,
    qrClaimedAt: row.qr_claimed_at || null,
    readyNotifiedAt: row.ready_notified_at || null,
    readyNotificationMessage: row.ready_notification_message || '',
    paymentCheckouts,
    paymentCheckout: latestPaymentCheckout,
    paymentCheckoutStatus,
    paymentCheckoutReferenceNumber: latestPaymentCheckout?.referenceNumber || '',
    paymentCheckoutPaidAt: latestPaymentCheckout?.paidAt || null,
    paymentCheckoutFailureReason: latestPaymentCheckout?.failureReason || '',
    paymentCheckoutAmount: latestPaymentCheckout?.amount || 0,
    paymentReceiptNumber: latestPaymentCheckout?.referenceNumber || orderCode,
    paymentStatusLabel: getPaymentStatusLabel({
      paymentMethod,
      deliveryMethod,
      paymentCheckoutStatus,
    }),
    lalamove: lalamoveTracking,
    lalamoveTracking,
    lalamoveBooked: lalamoveTracking.booked,
    lalamoveStatus: lalamoveTracking.status,
    lalamoveStatusLabel: lalamoveTracking.statusLabel,
    lalamoveShareLink: lalamoveTracking.shareLink,
    lalamoveDriver: lalamoveTracking.driver,
    receiptImageUrl: row.receipt_image_url || '',
    receiptReceivedAt: row.receipt_received_at || null,
    notifications,
    statusTimestamps,
    confirmedAt: statusTimestamps.confirmed || null,
    preparingAt: statusTimestamps.preparing || null,
    readyAt: statusTimestamps.ready || null,
    outForDeliveryAt: statusTimestamps.out_for_delivery || null,
    deliveredAt: statusTimestamps.delivered || null,
    completedAt: statusTimestamps.completed || null,
    cancelledAt: statusTimestamps.cancelled || null,
    refundedAt: statusTimestamps.refunded || null,
    issueReports,
    latestIssueReport,
    qrActive,
  };
};

export const normalizeRequestedItems = (items = []) => (
  items.map((item) => ({
    product_id: item.product_id || item.productId || item.id,
    quantity: Math.max(1, Number(item.quantity) || 1),
    price: Math.max(0, Number(item.price) || 0),
    name: item.name || item.product_name || item.product?.productName || 'Dessert Item',
    category: item.category || item.product?.category || 'Uncategorized',
    description: item.description || '',
  }))
);

export const getAvailabilityForStock = (stockQuantity) => (stockQuantity <= 0 ? 'out of stock' : 'available');

export const hydrateOrderById = async (supabase, orderId) => {
  const { data, error } = await supabase
    .from('orders')
    .select(orderSelect)
    .eq('id', orderId)
    .single();

  if (error) {
    throw error;
  }

  return hydrateOrderWithProfile(supabase, data);
};

export const fetchProductsByIds = async (supabase, productIds = []) => {
  if (!productIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .in('id', productIds);

  if (error) {
    throw error;
  }

  return new Map((data || []).map((product) => [product.id, product]));
};

export const getShortagesForItems = (normalizedItems = [], productsById = new Map()) => {
  const shortages = [];

  normalizedItems.forEach((item) => {
    const matchingProduct = productsById.get(item.product_id);
    const availableStock = Number(matchingProduct?.stock_quantity) || 0;
    const expiryStatus = getExpiryStatus({
      expirationAt: matchingProduct?.expiration_at,
      expirationDate: matchingProduct?.expiration_date,
    });
    const unavailable = !matchingProduct
      || matchingProduct.availability === 'hidden'
      || matchingProduct.availability === 'expired'
      || expiryStatus === 'expired';
    if (unavailable || availableStock < item.quantity) {
      shortages.push({
        productId: item.product_id,
        productName: matchingProduct?.product_name || item.name || 'Unknown Product',
        available: unavailable ? 0 : availableStock,
        requested: item.quantity,
        reason: expiryStatus === 'expired' || matchingProduct?.availability === 'expired'
          ? 'expired'
          : (matchingProduct?.availability === 'hidden' ? 'unavailable' : 'out_of_stock'),
      });
    }
  });

  return shortages;
};

export const enrichItemsFromProducts = (normalizedItems = [], productsById = new Map()) => (
  normalizedItems.map((item) => {
    const matchingProduct = productsById.get(item.product_id);
    const livePrice = Number(matchingProduct?.price);

    return {
      ...item,
      price: Number.isFinite(livePrice) ? livePrice : item.price,
      name: matchingProduct?.product_name || item.name,
      category: matchingProduct?.category || item.category,
      description: matchingProduct?.description || item.description || '',
    };
  })
);

export const clearUserCart = async (supabase, userId) => {
  if (!userId) {
    return;
  }

  const { data: cart, error: cartError } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (cartError) {
    throw cartError;
  }

  if (!cart?.id) {
    return;
  }

  const { error: clearCartError } = await supabase
    .from('cart_items')
    .delete()
    .eq('cart_id', cart.id);

  if (clearCartError) {
    throw clearCartError;
  }
};

export const createFulfilledOrder = async (
  supabase,
  {
    userId,
    profile,
    orderCode = generateOrderCode(),
    customerName = '',
    phoneNumber = '',
    address = '',
    deliveryMethod = 'pickup',
    paymentMethod = 'cash',
    totalPrice = 0,
    deliveryAddressId = null,
    cashReceived = null,
    changeAmount = null,
    orderStatus = 'pending',
    deliveryDistanceKm = null,
    deliveryAddress = {},
    deliveryRecipientName = '',
    deliveryContactNumber = '',
    deliveryStreetAddress = '',
    deliveryBarangay = '',
    deliveryCity = '',
    deliveryProvince = '',
    deliveryPostalCode = '',
    deliveryFormattedAddress = '',
    deliveryPlaceId = '',
    deliveryLatitude = null,
    deliveryLongitude = null,
    deliveryInstructions = '',
    items = [],
  },
) => {
  const normalizedStatus = normalizeOrderStatus(orderStatus);
  const normalizedDeliveryMethod = String(deliveryMethod || 'pickup').toLowerCase();
  const normalizedPaymentMethod = String(paymentMethod || 'cash').toLowerCase();
  const normalizedDistance = Number(deliveryDistanceKm);
  const normalizedLatitude = Number(deliveryLatitude);
  const normalizedLongitude = Number(deliveryLongitude);
  const normalizedDeliveryAddress = normalizeDeliveryAddressFields({
    deliveryAddress,
    deliveryRecipientName,
    deliveryContactNumber,
    deliveryStreetAddress,
    deliveryBarangay,
    deliveryCity,
    deliveryProvince,
    deliveryPostalCode,
    deliveryFormattedAddress,
    deliveryPlaceId,
    deliveryLatitude,
    deliveryLongitude,
    address,
  }, {
    recipientName: customerName || profile?.full_name || profile?.username || 'Customer',
    contactNumber: phoneNumber || profile?.phone_number || '',
    formattedAddress: address || profile?.address || '',
  });
  const persistedAddress = normalizedDeliveryAddress.address || address || profile?.address || null;
  const persistedLatitude = Number.isFinite(normalizedLatitude)
    ? normalizedLatitude
    : normalizedDeliveryAddress.latitude;
  const persistedLongitude = Number.isFinite(normalizedLongitude)
    ? normalizedLongitude
    : normalizedDeliveryAddress.longitude;
  const now = new Date().toISOString();
  const containsLecheFlan = hasLecheFlanItems(items);
  const verificationRequired = shouldRequireOrderVerification(
    normalizedDeliveryMethod,
    normalizedPaymentMethod,
  );
  const shouldGenerateReceiptTokens = !['pending', 'cancelled', 'refunded'].includes(normalizedStatus);
  const qrToken = verificationRequired && shouldGenerateReceiptTokens ? generateOrderQrToken() : null;
  const feedbackToken = ['pending', 'cancelled', 'refunded'].includes(normalizedStatus)
    ? null
    : generateFeedbackToken();
  const cancellationReason = normalizedStatus === 'cancelled'
    ? getLecheFlanRestrictionMessage(normalizedDistance) || 'The order was cancelled before fulfillment.'
    : null;
  const statusTimestamps = {
    [STATUS_TIMESTAMP_KEYS[normalizedStatus] || normalizedStatus]: now,
  };
  const notifications = buildInitialNotifications({
    orderStatus: normalizedStatus,
    orderCode,
    cancellationReason: cancellationReason || '',
    customerName: customerName || profile?.full_name || profile?.username || 'Customer',
  });

  const { data: createdOrder, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      order_code: orderCode,
      customer_name: customerName || profile?.full_name || profile?.username || 'Customer',
      phone_number: phoneNumber || profile?.phone_number || null,
      address: persistedAddress,
      delivery_method: normalizedDeliveryMethod,
      payment_method: normalizedPaymentMethod,
      delivery_address_id: deliveryAddressId || null,
      cash_received: Number.isFinite(Number(cashReceived)) ? Number(cashReceived) : null,
      change_amount: Number.isFinite(Number(changeAmount)) ? Number(changeAmount) : null,
      total_price: Number(totalPrice) || 0,
      order_status: normalizedStatus,
      review_status: 'none',
      review_reason: null,
      review_status_updated_at: null,
      cancellation_reason: cancellationReason || null,
      delivery_distance_km: Number.isFinite(normalizedDistance) ? normalizedDistance : null,
      delivery_recipient_name: normalizedDeliveryAddress.recipientName || null,
      delivery_contact_number: normalizedDeliveryAddress.contactNumber || null,
      delivery_street_address: normalizedDeliveryAddress.streetAddress || null,
      delivery_barangay: normalizedDeliveryAddress.barangay || null,
      delivery_city: normalizedDeliveryAddress.city || null,
      delivery_province: normalizedDeliveryAddress.province || null,
      delivery_postal_code: normalizedDeliveryAddress.postalCode || null,
      delivery_formatted_address: normalizedDeliveryAddress.formattedAddress || persistedAddress,
      delivery_place_id: normalizedDeliveryAddress.placeId || null,
      delivery_latitude: Number.isFinite(persistedLatitude) ? persistedLatitude : null,
      delivery_longitude: Number.isFinite(persistedLongitude) ? persistedLongitude : null,
      delivery_instructions: String(deliveryInstructions || '').trim() || null,
      contains_leche_flan: containsLecheFlan,
      inventory_deducted_at: null,
      verification_required: verificationRequired,
      qr_token: qrToken,
      qr_generated_at: qrToken ? now : null,
      qr_expires_at: qrToken ? createOrderQrExpiry(now) : null,
      qr_used_at: null,
      verified_at: null,
      verified_by: null,
      verification_method: null,
      feedback_token: feedbackToken,
      feedback_token_generated_at: feedbackToken ? now : null,
      notifications,
      status_timestamps: statusTimestamps,
    })
    .select('*')
    .single();

  if (orderError) {
    throw orderError;
  }

  const orderItemsPayload = items.map((item) => ({
    order_id: createdOrder.id,
    product_id: item.product_id,
    quantity: item.quantity,
    price: item.price,
  }));

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItemsPayload);

  if (itemsError) {
    throw itemsError;
  }

  if (normalizedStatus !== 'cancelled') {
    await clearUserCart(supabase, userId);
  }
  return mapOrder(await hydrateOrderById(supabase, createdOrder.id));
};

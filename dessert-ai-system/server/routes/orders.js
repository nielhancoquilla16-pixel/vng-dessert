import express from 'express';
import { getSupabaseAdmin, hasSupabaseAdminConfig } from '../lib/supabaseAdmin.js';
import {
  DELIVERY_FEE,
  ADDRESS_GEOCODE_ERROR,
  VALID_ORDER_STATUSES,
  buildOrderQrPayload,
  buildDeliveryAddressText,
  createFulfilledOrder,
  extractOrderQrToken,
  enrichItemsFromProducts,
  fetchProductsByIds,
  generateFeedbackToken,
  generateOrderQrToken,
  getShortagesForItems,
  mapOrder,
  normalizeNotifications,
  normalizeOrderStatus,
  normalizeDeliveryMethod,
  normalizeReviewStatus,
  normalizeRequestedItems,
  normalizeStatusTimestamps,
  shouldRequireOrderVerification,
  isCashOnDelivery,
  hasLecheFlanItems,
  getLecheFlanRestrictionMessage,
  hydrateOrdersWithProfiles,
  hydrateOrderWithProfile,
  isValidDeliveryCoordinates,
  normalizeDeliveryAddressFields,
  orderSelect,
} from '../lib/orderUtils.js';
import { validateReceiptImageDataUrl } from '../lib/receiptImages.js';
import {
  buildLalamoveTrackingPatch,
  extractLalamoveWebhookState,
  getLalamoveDeliveryStatusLabel,
  getLalamoveStatusPayload,
  mapLalamoveStatusToOrderStatus,
  normalizeLalamoveStatus,
  retrieveLalamoveDriverDetails,
  retrieveLalamoveOrderDetails,
  verifyLalamoveWebhookToken,
} from '../lib/lalamove.js';
import { bookLalamoveOrder, buildLalamoveBookingLaunch } from '../lib/lalamoveBooking.js';
import { cancelLalamoveOrder } from '../lib/lalamoveCancellation.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  canConfirmQrScannedPickup,
  createOrderQrExpiry,
  isOrderQrExpired,
  ORDER_QR_EXPIRED_MESSAGE,
} from '../lib/orderQr.js';
import { assertShopOpen, getShopSettings } from '../lib/shopSettings.js';
import { getOwnedCustomerAddress, toOrderDeliveryAddress } from '../lib/customerAddresses.js';
import {
  RETURN_REFUND_STATUSES,
  buildReturnRefundHistoryEntry,
  isValidReturnRefundTransition,
  mapReturnRefundRequest,
  normalizeReturnRefundStatus,
  normalizeReturnRefundType,
} from '../lib/returnRefund.js';

const router = express.Router();
const BEST_SELLER_LIMIT = 3;
const TERMINAL_ORDER_STATUSES = new Set(['completed', 'cancelled', 'refunded']);

const toTimestamp = (value) => {
  const parsed = new Date(value || '').getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLookupValue = (value = '') => String(value || '').trim();
const normalizeLookupCode = (value = '') => normalizeLookupValue(value).toUpperCase();
const normalizeLookupPhone = (value = '') => normalizeLookupValue(value).replace(/[^0-9+]/g, '');
const pickCoordinateValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

const getVerificationMethodLabel = (value = '') => {
  const normalized = String(value || '').toLowerCase();

  if (normalized === 'qr') {
    return 'QR code';
  }

  if (normalized === 'order_id') {
    return 'Order ID';
  }

  return 'manual';
};

const normalizeVerificationMethod = (value = '') => {
  const normalized = String(value || '').toLowerCase();

  if (['qr', 'order_id', 'manual'].includes(normalized)) {
    return normalized;
  }

  return 'manual';
};

const fetchOrderByQrToken = async (supabase, qrToken = '') => {
  const normalizedToken = String(qrToken || '').trim().toUpperCase();

  if (!normalizedToken) {
    return null;
  }

  const { data, error } = await supabase
    .from('orders')
    .select(orderSelect)
    .eq('qr_token', normalizedToken)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return hydrateOrderWithProfile(supabase, data || null);
};

const fetchOrderByIdentifier = async (supabase, identifier = '') => {
  const normalized = normalizeLookupValue(identifier);
  const normalizedCode = normalizeLookupCode(identifier);
  const normalizedPhone = normalizeLookupPhone(identifier);
  const qrToken = extractOrderQrToken(identifier);

  if (!normalized) {
    return null;
  }

  const lookupQueries = [];

  if (qrToken) {
    lookupQueries.push(
      supabase
        .from('orders')
        .select(orderSelect)
        .eq('qr_token', qrToken)
        .maybeSingle(),
    );
  }

  if (normalizedCode) {
    lookupQueries.push(
      supabase
        .from('orders')
        .select(orderSelect)
        .eq('order_code', normalizedCode)
        .maybeSingle(),
    );
  }

  if (normalized) {
    lookupQueries.push(
      supabase
        .from('orders')
        .select(orderSelect)
        .eq('id', normalized)
        .maybeSingle(),
    );
  }

  for (const query of lookupQueries) {
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    if (data) {
      return hydrateOrderWithProfile(supabase, data);
    }
  }

  if (/^VNG-[A-Z0-9]{6}$/.test(normalizedCode)) {
    const { data, error } = await supabase
      .from('orders')
      .select(orderSelect)
      .ilike('order_code', `${normalizedCode}%`)
      .limit(2);

    if (error) {
      throw error;
    }

    if (data?.length === 1) {
      return hydrateOrderWithProfile(supabase, data[0]);
    }

    if (data?.length > 1) {
      return null;
    }
  }

  if (normalizedPhone.length >= 7 || normalized.length >= 3) {
    const safeSearchText = normalized.replace(/[%_]/g, '');
    let broadQuery = supabase
      .from('orders')
      .select(orderSelect)
      .order('created_at', { ascending: false })
      .limit(1);

    broadQuery = normalizedPhone.length >= 7
      ? broadQuery.ilike('phone_number', `%${normalizedPhone}%`)
      : broadQuery.ilike('customer_name', `%${safeSearchText}%`);

    const { data, error } = await broadQuery.maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return hydrateOrderWithProfile(supabase, data);
    }
  }

  return null;
};

const buildNotificationEntry = (audience, type, message) => ({
  audience,
  type,
  message,
  createdAt: new Date().toISOString(),
});

const buildStatusTimestampPatch = (currentOrder, nextStatus, now = new Date().toISOString()) => ({
  ...normalizeStatusTimestamps(currentOrder?.status_timestamps || {}),
  [String(nextStatus || '').toLowerCase().replace(/-/g, '_')]: now,
});

const getRecordedSaleTimestamp = (order = {}) => {
  const statusTimestamps = normalizeStatusTimestamps(order?.status_timestamps || order?.statusTimestamps || {});
  const deliveryMethod = String(order?.delivery_method || order?.deliveryMethod || 'pickup').toLowerCase();
  const paymentMethod = String(order?.payment_method || order?.paymentMethod || 'cash').toLowerCase();
  const placedByRole = String(order?.profiles?.role || order?.placedByRole || '').toLowerCase();
  const isWalkInSale = ['admin', 'staff'].includes(placedByRole)
    && deliveryMethod === 'pickup'
    && paymentMethod !== 'online';

  if (isWalkInSale) {
    return statusTimestamps.confirmed
      || order?.confirmedAt
      || order?.confirmed_at
      || order?.created_at
      || order?.createdAt
      || '';
  }

  return statusTimestamps.completed
    || order?.completedAt
    || order?.completed_at
    || order?.receipt_received_at
    || order?.receiptReceivedAt
    || '';
};

const isOrderSaleRecognized = (order = {}) => (
  Boolean(getRecordedSaleTimestamp(order))
  && normalizeOrderStatus(order?.order_status || order?.status || '') !== 'cancelled'
);

const getOrderItemsForInventory = (order = {}) => (
  (order.order_items || []).map((item) => ({
    product_id: item.product_id,
    quantity: Number(item.quantity) || 0,
    price: Number(item.price) || 0,
    name: item.products?.product_name || 'Unknown Product',
    category: item.products?.category || 'Uncategorized',
    available_stock_quantity: Number(item.products?.stock_quantity) || 0,
  }))
);

const fetchOrderById = async (supabase, orderId) => {
  const { data, error } = await supabase
    .from('orders')
    .select(orderSelect)
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const notFoundError = new Error('Order not found.');
    notFoundError.status = 404;
    throw notFoundError;
  }

  return hydrateOrderWithProfile(supabase, data);
};

const updateOrderRecord = async (supabase, orderId, patch) => {
  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', orderId)
    .select(orderSelect)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const notFoundError = new Error('Order not found.');
    notFoundError.status = 404;
    throw notFoundError;
  }

  return hydrateOrderWithProfile(supabase, data);
};

const adjustInventoryForOrder = async (supabase, order, direction = 'deduct') => {
  const orderItems = getOrderItemsForInventory(order);

  if (orderItems.length === 0) {
    return;
  }

  const productIds = [...new Set(orderItems.map((item) => item.product_id).filter(Boolean))];
  const productsById = await fetchProductsByIds(supabase, productIds);
  const shortages = getShortagesForItems(orderItems, productsById);

  if (direction === 'deduct' && shortages.length > 0) {
    const shortageError = new Error('Some products do not have enough stock.');
    shortageError.status = 409;
    shortageError.details = { shortages };
    throw shortageError;
  }

  for (const item of orderItems) {
    const product = productsById.get(item.product_id);
    if (!product) {
      continue;
    }

    const currentStock = Number(product.stock_quantity) || 0;
    const nextStock = direction === 'deduct'
      ? Math.max(0, currentStock - item.quantity)
      : currentStock + item.quantity;

    const { error } = await supabase
      .from('products')
      .update({
        stock_quantity: nextStock,
        availability: nextStock <= 0 ? 'out of stock' : 'available',
      })
      .eq('id', item.product_id);

    if (error) {
      throw error;
    }
  }
};

const buildStatusMessages = (currentOrder, nextStatus, extra = {}) => {
  const orderCode = currentOrder?.order_code || currentOrder?.id || 'order';
  const reasonSuffix = extra.reason ? ` Reason: ${extra.reason}` : '';

  switch (nextStatus) {
    case 'confirmed':
      return {
        customer: `Your order ${orderCode} has been confirmed and is now being prepared.`,
        adminStaff: `Order ${orderCode} has been confirmed.`,
      };
    case 'preparing':
      return {
        customer: `Your order ${orderCode} is now being prepared.`,
        adminStaff: `Order ${orderCode} moved to Preparing.`,
      };
    case 'ready':
      return {
        customer: `Order ${orderCode} is ready. Inventory has been updated and the order is waiting for handoff.`,
        adminStaff: `Order ${orderCode} moved to Ready and inventory was deducted.`,
      };
    case 'out-for-delivery':
      return {
        customer: `Order ${orderCode} is now out for delivery.`,
        adminStaff: `Order ${orderCode} is out for delivery.`,
      };
    case 'delivered':
      return {
        customer: `Order ${orderCode} has been marked Delivered. Please confirm receipt with photo proof or report an issue if needed.`,
        adminStaff: `Order ${orderCode} is marked Delivered and is waiting for customer confirmation.`,
      };
    case 'completed':
      return {
        customer: `Thanks for confirming receipt for Order ${orderCode}. The order is now completed.`,
        adminStaff: `Customer confirmed receipt for Order ${orderCode}. The sale has now been recorded.`,
      };
    case 'cancelled':
      return {
        customer: `Order ${orderCode} was cancelled.${reasonSuffix}`,
        adminStaff: `Order ${orderCode} was cancelled.${reasonSuffix}`,
      };
    case 'refunded':
      return {
        customer: `Your return request for Order ${orderCode} was approved. The order is now marked Returned.${reasonSuffix}`,
        adminStaff: `Return approved for Order ${orderCode}. Any recorded sale has been adjusted.${reasonSuffix}`,
      };
    default:
      return {
        customer: `Order ${orderCode} status changed to ${nextStatus}.`,
        adminStaff: `Order ${orderCode} status changed to ${nextStatus}.`,
      };
  }
};

const setOrderStatus = async (supabase, currentOrder, nextStatus, extra = {}) => {
  const normalizedNextStatus = normalizeOrderStatus(nextStatus);
  const currentStatus = normalizeOrderStatus(currentOrder.order_status);
  const now = new Date().toISOString();
  const deliveryMethod = normalizeDeliveryMethod(currentOrder.delivery_method || 'pickup');
  const statusPatch = {
    order_status: normalizedNextStatus,
    status_timestamps: buildStatusTimestampPatch(currentOrder, normalizedNextStatus, now),
  };
  const notifications = normalizeNotifications(currentOrder.notifications || []);
  const messageBundle = buildStatusMessages(currentOrder, normalizedNextStatus, extra);

  if (normalizedNextStatus === 'confirmed' && currentStatus !== 'pending') {
    const error = new Error('The order must be pending before it can be confirmed.');
    error.status = 400;
    throw error;
  }

  if (
    normalizedNextStatus === 'confirmed'
    && !currentOrder.feedback_token
    && !['cancelled', 'refunded'].includes(currentStatus)
  ) {
    statusPatch.feedback_token = generateFeedbackToken();
    statusPatch.feedback_token_generated_at = now;
  }

  if (
    normalizedNextStatus === 'confirmed'
    && currentOrder.verification_required !== false
    && (!currentOrder.qr_token || isOrderQrExpired(currentOrder) || currentOrder.qr_used_at)
  ) {
    statusPatch.qr_token = generateOrderQrToken();
    statusPatch.qr_generated_at = now;
    statusPatch.qr_expires_at = createOrderQrExpiry(now);
    statusPatch.qr_used_at = null;
  }

  if (normalizedNextStatus === 'preparing' && currentStatus !== 'confirmed') {
    const error = new Error('The order must be confirmed before it can be set to Preparing.');
    error.status = 400;
    throw error;
  }

  if (normalizedNextStatus === 'ready' && currentStatus !== 'preparing') {
    const error = new Error('The order must be preparing before it can be marked Ready.');
    error.status = 400;
    throw error;
  }

  if (normalizedNextStatus === 'out-for-delivery') {
    if (deliveryMethod !== 'delivery') {
      const error = new Error('Only delivery orders can be marked Out for Delivery.');
      error.status = 400;
      throw error;
    }

    if (currentStatus !== 'ready') {
      const error = new Error('The order must be Ready before it can be marked Out for Delivery.');
      error.status = 400;
      throw error;
    }
  }

  if (normalizedNextStatus === 'delivered') {
    if (deliveryMethod === 'delivery' && currentStatus !== 'out-for-delivery') {
      const error = new Error('Delivery orders must be Out for Delivery before they can be marked Delivered.');
      error.status = 400;
      throw error;
    }

    const confirmedQrPickup = currentStatus === 'confirmed'
      && canConfirmQrScannedPickup(currentOrder);
    if (deliveryMethod === 'pickup' && currentStatus !== 'ready' && !confirmedQrPickup) {
      const error = new Error('Pickup orders must be Ready before they can be marked Delivered.');
      error.status = 400;
      throw error;
    }
  }

  if (normalizedNextStatus === 'cancelled') {
    if (['delivered', 'completed', 'refunded', 'cancelled'].includes(currentStatus)) {
      const error = new Error('This order can no longer be cancelled.');
      error.status = 400;
      throw error;
    }
  }

  if (normalizedNextStatus === 'ready') {
    const restrictionMessage = deliveryMethod === 'delivery'
      ? getLecheFlanRestrictionMessage(currentOrder.delivery_distance_km)
      : '';

    if (restrictionMessage && hasLecheFlanItems(getOrderItemsForInventory(currentOrder))) {
      statusPatch.order_status = 'cancelled';
      statusPatch.status_timestamps = buildStatusTimestampPatch(currentOrder, 'cancelled', now);
      statusPatch.cancellation_reason = restrictionMessage;
      statusPatch.review_status = 'none';
      statusPatch.review_reason = null;
      statusPatch.review_status_updated_at = null;
      notifications.push(
        buildNotificationEntry('customer', 'order_cancelled', restrictionMessage),
        buildNotificationEntry('admin_staff', 'order_cancelled', `Order ${currentOrder.order_code || currentOrder.id} was automatically cancelled. ${restrictionMessage}`),
      );
      return { statusPatch, notifications, inventoryAction: null };
    }

    await adjustInventoryForOrder(supabase, currentOrder, 'deduct');
    statusPatch.inventory_deducted_at = currentOrder.inventory_deducted_at || now;
  }

  if (normalizedNextStatus === 'delivered') {
    statusPatch.ready_notified_at = currentOrder.ready_notified_at || now;
    if (deliveryMethod === 'pickup') {
      statusPatch.qr_claimed_at = currentOrder.qr_claimed_at || now;

      if (
        normalizeOrderStatus(currentOrder.order_status) === 'confirmed'
        && canConfirmQrScannedPickup(currentOrder)
        && !currentOrder.inventory_deducted_at
      ) {
        await adjustInventoryForOrder(supabase, currentOrder, 'deduct');
        statusPatch.inventory_deducted_at = now;
      }
    }
  }

  if (normalizedNextStatus === 'cancelled') {
    if (currentOrder.inventory_deducted_at) {
      await adjustInventoryForOrder(supabase, currentOrder, 'restock');
    }

    statusPatch.cancellation_reason = extra.reason || currentOrder.cancellation_reason || 'The order was cancelled before completion.';
    statusPatch.review_status = 'none';
    statusPatch.review_reason = null;
    statusPatch.review_status_updated_at = null;
    statusPatch.feedback_token = null;
    statusPatch.feedback_token_generated_at = null;
    statusPatch.qr_token = null;
    statusPatch.qr_generated_at = null;
    statusPatch.qr_expires_at = null;
    statusPatch.qr_used_at = null;
  }

  if (normalizedNextStatus === 'completed') {
    const placedByRole = String(currentOrder.profiles?.role || '').toLowerCase();
    const isWalkInOrder = ['admin', 'staff'].includes(placedByRole)
      && deliveryMethod === 'pickup'
      && String(currentOrder.payment_method || 'cash').toLowerCase() !== 'online';

    if (isWalkInOrder && currentStatus !== 'ready') {
      const error = new Error('Walk-in POS orders must be Ready before they can be completed.');
      error.status = 400;
      throw error;
    }

    if (!isWalkInOrder && currentStatus !== 'delivered') {
      const error = new Error('The order must be Delivered before it can be completed.');
      error.status = 400;
      throw error;
    }
  }

  notifications.push(
    buildNotificationEntry('customer', 'status_update', messageBundle.customer),
    buildNotificationEntry('admin_staff', 'status_update', messageBundle.adminStaff),
  );

  return {
    statusPatch,
    notifications,
  };
};

const applyOrderStatusChange = async (supabase, orderId, nextStatus, extra = {}) => {
  const currentOrder = await fetchOrderById(supabase, orderId);
  const { statusPatch, notifications } = await setOrderStatus(supabase, currentOrder, nextStatus, extra);
  const mergedNotifications = [
    ...normalizeNotifications(currentOrder.notifications || []),
    ...notifications,
  ];

  return updateOrderRecord(supabase, orderId, {
    ...statusPatch,
    notifications: mergedNotifications,
  });
};

const appendTimestamp = (timestamps = {}, key, value) => ({
  ...timestamps,
  [key]: timestamps[key] || value,
});

const buildDirectLalamoveStatusPatch = async (supabase, currentOrder, nextStatus, now) => {
  const normalizedNextStatus = normalizeOrderStatus(nextStatus);
  const currentStatus = normalizeOrderStatus(currentOrder.order_status);
  const statusTimestamps = normalizeStatusTimestamps(currentOrder.status_timestamps || {});
  const patch = {};

  if (!normalizedNextStatus || normalizedNextStatus === currentStatus || TERMINAL_ORDER_STATUSES.has(currentStatus)) {
    return patch;
  }

  if (normalizedNextStatus === 'out-for-delivery') {
    if (!currentOrder.inventory_deducted_at) {
      await adjustInventoryForOrder(supabase, currentOrder, 'deduct');
      patch.inventory_deducted_at = now;
    }

    patch.order_status = 'out-for-delivery';
    patch.status_timestamps = appendTimestamp(statusTimestamps, 'out_for_delivery', now);
    return patch;
  }

  if (normalizedNextStatus === 'delivered') {
    if (!currentOrder.inventory_deducted_at) {
      await adjustInventoryForOrder(supabase, currentOrder, 'deduct');
      patch.inventory_deducted_at = now;
    }

    patch.order_status = 'delivered';
    patch.ready_notified_at = currentOrder.ready_notified_at || now;
    patch.status_timestamps = appendTimestamp(
      appendTimestamp(statusTimestamps, 'out_for_delivery', now),
      'delivered',
      now,
    );
    return patch;
  }

  if (normalizedNextStatus === 'cancelled') {
    if (['delivered', 'completed', 'refunded', 'cancelled'].includes(currentStatus)) {
      return patch;
    }

    if (currentOrder.inventory_deducted_at) {
      await adjustInventoryForOrder(supabase, currentOrder, 'restock');
    }

    patch.order_status = 'cancelled';
    patch.cancellation_reason = currentOrder.cancellation_reason || 'Lalamove cancelled or could not complete this delivery.';
    patch.review_status = 'none';
    patch.review_reason = null;
    patch.review_status_updated_at = null;
    patch.feedback_token = null;
    patch.feedback_token_generated_at = null;
    patch.qr_token = null;
    patch.qr_generated_at = null;
    patch.qr_expires_at = null;
    patch.qr_used_at = null;
    patch.status_timestamps = appendTimestamp(statusTimestamps, 'cancelled', now);
  }

  return patch;
};

const applyLalamoveTrackingUpdate = async (
  supabase,
  currentOrder,
  trackingPatch,
  {
    booked = false,
    eventType = '',
  } = {},
) => {
  const now = new Date().toISOString();
  const nextLalamoveStatus = normalizeLalamoveStatus(trackingPatch.lalamove_status || currentOrder.lalamove_status || '');
  const currentLalamoveStatus = normalizeLalamoveStatus(currentOrder.lalamove_status || '');
  const nextOrderStatus = mapLalamoveStatusToOrderStatus(nextLalamoveStatus, currentOrder.order_status);
  const statusPatch = await buildDirectLalamoveStatusPatch(supabase, currentOrder, nextOrderStatus, now);
  const deliveryStatusChanged = nextLalamoveStatus && nextLalamoveStatus !== currentLalamoveStatus;
  const orderStatusChanged = statusPatch.order_status && statusPatch.order_status !== currentOrder.order_status;
  const notifications = normalizeNotifications(currentOrder.notifications || []);
  const orderCode = currentOrder.order_code || currentOrder.id || 'order';

  if (booked) {
    notifications.push(
      buildNotificationEntry('customer', 'delivery_booked', `Lalamove delivery has been booked for order ${orderCode}.`),
      buildNotificationEntry('admin_staff', 'delivery_booked', `Lalamove delivery was booked for order ${orderCode}.`),
    );
  }

  if (deliveryStatusChanged) {
    const label = getLalamoveDeliveryStatusLabel(nextLalamoveStatus);
    notifications.push(
      buildNotificationEntry('customer', 'delivery_status_update', `Lalamove delivery status for order ${orderCode}: ${label}.`),
      buildNotificationEntry('admin_staff', 'delivery_status_update', `Lalamove delivery status for order ${orderCode}: ${label}.`),
    );
  }

  if (orderStatusChanged) {
    const messageBundle = buildStatusMessages(currentOrder, statusPatch.order_status, {
      reason: eventType ? `Lalamove ${eventType}` : '',
    });
    notifications.push(
      buildNotificationEntry('customer', 'status_update', messageBundle.customer),
      buildNotificationEntry('admin_staff', 'status_update', messageBundle.adminStaff),
    );
  }

  return updateOrderRecord(supabase, currentOrder.id, {
    ...trackingPatch,
    ...statusPatch,
    notifications,
  });
};

const syncLalamoveTrackingForOrder = async (supabase, currentOrder) => {
  if (!currentOrder.lalamove_order_id) {
    const error = new Error('This order has not been booked with Lalamove yet.');
    error.status = 409;
    throw error;
  }

  const orderData = await retrieveLalamoveOrderDetails(currentOrder.lalamove_order_id);
  const driverId = orderData.driverId || currentOrder.lalamove_driver_id || '';
  const driverData = driverId
    ? await retrieveLalamoveDriverDetails(orderData.orderId || currentOrder.lalamove_order_id, driverId)
    : null;
  const trackingPatch = buildLalamoveTrackingPatch({
    orderData: {
      ...orderData,
      orderId: orderData.orderId || currentOrder.lalamove_order_id,
      quotationId: orderData.quotationId || currentOrder.lalamove_quotation_id,
      shareLink: orderData.shareLink || currentOrder.lalamove_share_link,
    },
    driverData,
    syncedAt: new Date().toISOString(),
  });

  return applyLalamoveTrackingUpdate(supabase, currentOrder, trackingPatch);
};

const getDeliveryCoordinatesFromBody = (body = {}, currentOrder = {}) => ({
  latitude: pickCoordinateValue(
    body.destinationLatitude,
    body.destination_latitude,
    body.deliveryLatitude,
    body.delivery_latitude,
    currentOrder.delivery_latitude,
  ),
  longitude: pickCoordinateValue(
    body.destinationLongitude,
    body.destination_longitude,
    body.deliveryLongitude,
    body.delivery_longitude,
    currentOrder.delivery_longitude,
  ),
});

const buildDeliveryAddressFromBody = (body = {}, currentOrder = {}) => normalizeDeliveryAddressFields(body, {
  recipientName: currentOrder.delivery_recipient_name || currentOrder.customer_name || currentOrder.profiles?.full_name || currentOrder.profiles?.username || '',
  contactNumber: currentOrder.delivery_contact_number || currentOrder.phone_number || '',
  streetAddress: currentOrder.delivery_street_address || '',
  barangay: currentOrder.delivery_barangay || '',
  city: currentOrder.delivery_city || '',
  province: currentOrder.delivery_province || '',
  postalCode: currentOrder.delivery_postal_code || '',
  formattedAddress: currentOrder.delivery_formatted_address || currentOrder.address || '',
  placeId: currentOrder.delivery_place_id || '',
  latitude: currentOrder.delivery_latitude,
  longitude: currentOrder.delivery_longitude,
});

const getDeliveryAddressValidationError = (deliveryAddress = {}) => {
  if (!deliveryAddress.recipientName || !deliveryAddress.contactNumber) {
    return 'Recipient name and contact number are required before booking delivery.';
  }

  if (!deliveryAddress.streetAddress || !deliveryAddress.city || !deliveryAddress.province) {
    return 'Street address, city/municipality, and province are required before booking delivery.';
  }

  if (!isValidDeliveryCoordinates(deliveryAddress)) {
    return ADDRESS_GEOCODE_ERROR;
  }

  return '';
};

const assertValidDeliveryAddress = (deliveryAddress = {}) => {
  const validationError = getDeliveryAddressValidationError(deliveryAddress);

  if (validationError) {
    const error = new Error(validationError);
    error.status = 400;
    throw error;
  }
};

const buildDeliveryAddressPatch = (deliveryAddress = {}, instructions = '') => {
  const address = deliveryAddress.formattedAddress
    || deliveryAddress.address
    || buildDeliveryAddressText(deliveryAddress);

  return {
    phone_number: deliveryAddress.contactNumber || null,
    address: address || null,
    delivery_recipient_name: deliveryAddress.recipientName || null,
    delivery_contact_number: deliveryAddress.contactNumber || null,
    delivery_street_address: deliveryAddress.streetAddress || null,
    delivery_barangay: deliveryAddress.barangay || null,
    delivery_city: deliveryAddress.city || null,
    delivery_province: deliveryAddress.province || null,
    delivery_postal_code: deliveryAddress.postalCode || null,
    delivery_formatted_address: deliveryAddress.formattedAddress || address || null,
    delivery_place_id: deliveryAddress.placeId || null,
    delivery_latitude: deliveryAddress.latitude,
    delivery_longitude: deliveryAddress.longitude,
    delivery_instructions: instructions || null,
  };
};

const assertLalamoveBookableOrder = (order) => {
  const currentStatus = normalizeOrderStatus(order.order_status || 'pending');
  const deliveryMethod = String(order.delivery_method || 'pickup').toLowerCase();
  const paymentMethod = String(order.payment_method || 'cash').toLowerCase();
  const latestPaymentCheckout = (Array.isArray(order.payment_checkouts) ? [...order.payment_checkouts] : [])
    .sort((left, right) => (
      new Date(right.updated_at || right.created_at || 0).getTime()
      - new Date(left.updated_at || left.created_at || 0).getTime()
    ))[0];
  const onlinePaymentSettled = ['paid', 'fulfilled'].includes(
    String(latestPaymentCheckout?.status || '').toLowerCase(),
  );

  if (deliveryMethod !== 'delivery' || !['cash', 'online'].includes(paymentMethod)) {
    const error = new Error('Lalamove booking is available only for delivery orders paid by Cash on Delivery or online checkout.');
    error.status = 400;
    throw error;
  }

  if (paymentMethod === 'online' && !onlinePaymentSettled) {
    const error = new Error('Complete the online payment before booking Lalamove delivery.');
    error.status = 400;
    throw error;
  }

  if (currentStatus === 'pending') {
    const error = new Error('Confirm the order before booking Lalamove delivery.');
    error.status = 400;
    throw error;
  }

  if (['delivered', 'completed', 'cancelled', 'refunded'].includes(currentStatus)) {
    const error = new Error('This order can no longer be booked with Lalamove.');
    error.status = 400;
    throw error;
  }

  if (order.lalamove_order_id) {
    const error = new Error('This order already has a Lalamove booking.');
    error.status = 409;
    throw error;
  }

  if (['BOOKING', 'BOOKING_UNCONFIRMED'].includes(order.lalamove_status)) {
    const error = new Error(order.lalamove_booking_error || 'A Lalamove booking is already in progress. Check the Partner Portal before trying again.');
    error.status = 409;
    throw error;
  }
};

const applyOrderVerification = async (
  supabase,
  currentOrder,
  {
    verifiedBy = null,
    verificationMethod = 'manual',
    consumeQr = false,
  } = {},
) => {
  const normalizedMethod = normalizeVerificationMethod(verificationMethod);
  const now = new Date().toISOString();
  const currentStatus = normalizeOrderStatus(currentOrder.order_status || 'pending');
  const deliveryMethod = normalizeDeliveryMethod(currentOrder.delivery_method || 'pickup');
  const isTerminal = TERMINAL_ORDER_STATUSES.has(currentStatus);

  if (isTerminal) {
    const error = new Error('This order is already finalized and cannot be verified again.');
    error.status = 409;
    throw error;
  }

  if (currentOrder.verification_required !== false && isOrderQrExpired(currentOrder)) {
    const error = new Error(ORDER_QR_EXPIRED_MESSAGE);
    error.status = 409;
    throw error;
  }

  if (normalizedMethod === 'qr' && currentOrder.qr_used_at) {
    const error = new Error('This QR code has already been used and is no longer valid.');
    error.status = 409;
    throw error;
  }

  const workingOrder = currentOrder;

  const nextNotifications = [
    ...normalizeNotifications(workingOrder.notifications || []),
    buildNotificationEntry(
      'admin_staff',
      'order_verified',
      `Order ${workingOrder.order_code || workingOrder.id} was verified using ${getVerificationMethodLabel(normalizedMethod)}.`,
    ),
  ];

  if (normalizedMethod === 'qr') {
    nextNotifications.push(
      buildNotificationEntry(
        'customer',
        'order_verified',
        `Order ${workingOrder.order_code || workingOrder.id} was verified by QR scan.`,
      ),
    );
  }

  const verificationPatch = {
    verification_method: normalizedMethod,
    verified_at: workingOrder.verified_at || now,
    verified_by: workingOrder.verified_by || verifiedBy || null,
    notifications: nextNotifications,
  };

  const shouldConsumeQr = consumeQr || normalizedMethod !== 'manual';
  if (shouldConsumeQr && workingOrder.qr_token) {
    verificationPatch.qr_used_at = workingOrder.qr_used_at || now;
  }

  if (deliveryMethod === 'pickup') {
    verificationPatch.qr_claimed_at = workingOrder.qr_claimed_at || now;
  }

  if (normalizedMethod === 'qr' && workingOrder.qr_token) {
    const { data, error } = await supabase
      .from('orders')
      .update(verificationPatch)
      .eq('id', workingOrder.id)
      .is('qr_used_at', null)
      .select(orderSelect)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      const conflictError = new Error('This QR code has already been used and is no longer valid.');
      conflictError.status = 409;
      throw conflictError;
    }

    return hydrateOrderWithProfile(supabase, data);
  }

  return updateOrderRecord(supabase, workingOrder.id, verificationPatch);
};

const createBestSellerEntry = (product) => ({
  id: product.id,
  name: product.product_name || product.productName || 'Dessert Item',
  productName: product.product_name || product.productName || 'Dessert Item',
  description: product.description || '',
  price: Number(product.price) || 0,
  category: product.category || 'Uncategorized',
  stockQuantity: Number(product.stock_quantity) || 0,
  availability: product.availability || 'available',
  imageUrl: product.image_url || product.imageUrl || '/logo.png',
  image: product.image_url || product.imageUrl || '/logo.png',
  soldCount: 0,
  orderCount: 0,
  lastOrderedAt: '',
  createdAt: product.created_at || '',
  updatedAt: product.updated_at || '',
});

router.get('/best-sellers', async (req, res, next) => {
  try {
    if (!hasSupabaseAdminConfig()) {
      return res.status(503).json({
        error: 'Best seller rankings are unavailable until SUPABASE_SERVICE_ROLE_KEY is configured on the server.',
      });
    }

    const limit = Math.min(12, Math.max(1, Number(req.query.limit) || BEST_SELLER_LIMIT));
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('orders')
      .select(orderSelect)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    const productSales = new Map();
    const hydratedOrders = await hydrateOrdersWithProfiles(supabase, data || []);

    hydratedOrders.map(mapOrder).forEach((order) => {
      const normalizedStatus = normalizeOrderStatus(order.status || order.orderStatus);
      if (['cancelled', 'refunded'].includes(normalizedStatus) || !isOrderSaleRecognized(order)) {
        return;
      }

      const countedInOrder = new Set();

      (order.lineItems || []).forEach((item) => {
        const product = item.product;
        const quantity = Math.max(0, Number(item.quantity) || 0);

        if (!product?.id || quantity <= 0) {
          return;
        }

        const existing = productSales.get(product.id) || createBestSellerEntry({
          ...product,
          price: product.price ?? item.price,
          category: product.category || item.category,
        });
        existing.soldCount += quantity;
        existing.lastOrderedAt = order.created_at || existing.lastOrderedAt;

        if (!countedInOrder.has(product.id)) {
          existing.orderCount += 1;
          countedInOrder.add(product.id);
        }

        productSales.set(product.id, existing);
      });
    });

    const items = Array.from(productSales.values())
      .sort((left, right) => {
        if (right.soldCount !== left.soldCount) {
          return right.soldCount - left.soldCount;
        }

        const leftLastOrderedAt = toTimestamp(left.lastOrderedAt);
        const rightLastOrderedAt = toTimestamp(right.lastOrderedAt);
        if (leftLastOrderedAt !== rightLastOrderedAt) {
          return leftLastOrderedAt - rightLastOrderedAt;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, limit)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
        averageUnitsPerOrder: item.orderCount > 0
          ? Number((item.soldCount / item.orderCount).toFixed(1))
          : 0,
      }));

    res.json({
      generatedAt: new Date().toISOString(),
      rankingMode: 'recognized-sales-units',
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/lalamove/status', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const shopSettings = await getShopSettings(getSupabaseAdmin());
    res.json(getLalamoveStatusPayload({
      includePickupDetails: true,
      pickup: {
        name: shopSettings.shopName,
        phone: shopSettings.phoneNumber,
        address: shopSettings.address,
        latitude: shopSettings.latitude,
        longitude: shopSettings.longitude,
      },
    }));
  } catch (error) {
    next(error);
  }
});

router.post('/webhooks/lalamove', async (req, res, next) => {
  try {
    const verification = verifyLalamoveWebhookToken(req.headers || {});
    if (!verification.ok) {
      return res.status(400).json({ error: verification.reason });
    }

    const webhookState = extractLalamoveWebhookState(req.body || {});
    if (!webhookState.orderId) {
      return res.status(202).json({ received: true, message: 'Webhook accepted, but no Lalamove order ID was found.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: currentOrder, error } = await supabase
      .from('orders')
      .select(orderSelect)
      .eq('lalamove_order_id', webhookState.orderId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!currentOrder) {
      return res.status(202).json({ received: true, message: 'Webhook accepted, but no matching local order was found.' });
    }

    const hydratedOrder = await hydrateOrderWithProfile(supabase, currentOrder);
    const driverData = webhookState.driverId && getLalamoveStatusPayload().credentialsConfigured
      ? await retrieveLalamoveDriverDetails(webhookState.orderId, webhookState.driverId)
      : null;
    const trackingPatch = buildLalamoveTrackingPatch({
      orderData: {
        orderId: hydratedOrder.lalamove_order_id || webhookState.orderId,
        quotationId: hydratedOrder.lalamove_quotation_id,
        status: webhookState.status || hydratedOrder.lalamove_status,
        shareLink: hydratedOrder.lalamove_share_link,
        driverId: webhookState.driverId || hydratedOrder.lalamove_driver_id,
        priceBreakdown: hydratedOrder.lalamove_price_breakdown || undefined,
      },
      driverData,
      syncedAt: new Date().toISOString(),
      extraMetadata: {
        lastWebhook: webhookState.raw,
      },
    });

    await applyLalamoveTrackingUpdate(supabase, hydratedOrder, trackingPatch, {
      eventType: webhookState.eventType,
    });

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

router.get('/', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('orders')
      .select(orderSelect)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const hydratedOrders = await hydrateOrdersWithProfiles(supabase, data || []);
    res.json(hydratedOrders.map(mapOrder));
  } catch (error) {
    next(error);
  }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('orders')
      .select(orderSelect)
      .eq('user_id', req.authUser.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const hydratedOrders = await hydrateOrdersWithProfiles(supabase, data || []);
    res.json(hydratedOrders.map(mapOrder));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      items = [],
      order_status = 'pending',
      customer_name = '',
      phone_number = '',
      address = '',
      delivery_method = 'pickup',
      payment_method = 'cash',
      delivery_distance_km,
      delivery_latitude,
      delivery_longitude,
      delivery_recipient_name = '',
      delivery_contact_number = '',
      delivery_street_address = '',
      delivery_barangay = '',
      delivery_city = '',
      delivery_province = '',
      delivery_postal_code = '',
      delivery_formatted_address = '',
      delivery_place_id = '',
      delivery_instructions = '',
      delivery_address_id = null,
      cash_received = null,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one order item is required.' });
    }

    const normalizedDeliveryMethod = String(delivery_method || 'pickup').toLowerCase();
    const normalizedPaymentMethod = String(payment_method || 'cash').toLowerCase();
    let deliveryAddress = normalizeDeliveryAddressFields({
      ...(req.body || {}),
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
    }, {
      recipientName: customer_name || req.profile?.full_name || req.profile?.username || '',
      contactNumber: phone_number || req.profile?.phone_number || '',
      formattedAddress: address || req.profile?.address || '',
    });
    const requestedStatus = normalizeOrderStatus(order_status);
    const placedByRole = String(req.profile?.role || '').toLowerCase();
    const isStaffWalkInOrder = ['admin', 'staff'].includes(placedByRole) && normalizedDeliveryMethod === 'pickup';
    const isCustomerOrder = !isStaffWalkInOrder;

    if (!VALID_ORDER_STATUSES.includes(requestedStatus)) {
      return res.status(400).json({
        error: 'order_status must be a valid status.',
      });
    }

    if (isStaffWalkInOrder && !['preparing', 'ready'].includes(requestedStatus)) {
      return res.status(400).json({
        error: 'Walk-in POS orders can only start with preparing or ready status.',
      });
    }

    const normalizedItems = normalizeRequestedItems(items);

    if (normalizedItems.some((item) => !item.product_id)) {
      return res.status(400).json({ error: 'Each order item must include a product_id.' });
    }

    const supabase = getSupabaseAdmin();
    const requestedDeliveryAddressId = String(delivery_address_id || '').trim();
    let savedDeliveryAddress = null;

    if (normalizedDeliveryMethod === 'delivery' && requestedDeliveryAddressId) {
      savedDeliveryAddress = await getOwnedCustomerAddress(
        supabase,
        req.authUser.id,
        requestedDeliveryAddressId,
      );

      if (!savedDeliveryAddress) {
        return res.status(400).json({ error: 'The selected saved delivery address was not found.' });
      }

      deliveryAddress = toOrderDeliveryAddress(savedDeliveryAddress);
    }

    if (isCustomerOrder) {
      await assertShopOpen(supabase);
    }
    const productsById = await fetchProductsByIds(
      supabase,
      [...new Set(normalizedItems.map((item) => item.product_id))],
    );
    const shortages = getShortagesForItems(normalizedItems, productsById);

    if (shortages.length > 0) {
      return res.status(409).json({
        error: 'Some products do not have enough stock.',
        shortages,
      });
    }

    const finalizedItems = enrichItemsFromProducts(normalizedItems, productsById).map((item) => ({
      ...item,
      available_stock_quantity: Number(productsById.get(item.product_id)?.stock_quantity) || 0,
    }));

    const subtotal = finalizedItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const finalTotal = subtotal + (normalizedDeliveryMethod === 'delivery' ? DELIVERY_FEE : 0);
    const normalizedDistance = Number(delivery_distance_km);
    const normalizedLatitude = Number(delivery_latitude);
    const normalizedLongitude = Number(delivery_longitude);
    const resolvedLatitude = savedDeliveryAddress ? Number(deliveryAddress.latitude) : normalizedLatitude;
    const resolvedLongitude = savedDeliveryAddress ? Number(deliveryAddress.longitude) : normalizedLongitude;
    const containsLecheFlan = hasLecheFlanItems(finalizedItems);

    if (normalizedDeliveryMethod === 'delivery') {
      assertValidDeliveryAddress(deliveryAddress);
    }

    const restrictionMessage = normalizedDeliveryMethod === 'delivery'
      ? getLecheFlanRestrictionMessage(normalizedDistance)
      : '';
    const shouldStartPending = isCustomerOrder && isCashOnDelivery(
      normalizedDeliveryMethod,
      normalizedPaymentMethod,
    );
    const initialOrderStatus = containsLecheFlan && restrictionMessage
      ? 'cancelled'
      : (shouldStartPending ? 'pending' : (isCustomerOrder ? 'confirmed' : requestedStatus));
    const requestedCashReceived = Number(cash_received);
    const isPosCashPayment = isStaffWalkInOrder && normalizedPaymentMethod === 'cash';

    if (isPosCashPayment && (!Number.isFinite(requestedCashReceived) || requestedCashReceived < finalTotal)) {
      return res.status(400).json({
        error: `Cash received must be at least PHP ${finalTotal.toFixed(2)}.`,
      });
    }

    const cashReceived = isPosCashPayment ? requestedCashReceived : null;
    const changeAmount = isPosCashPayment ? Number((requestedCashReceived - finalTotal).toFixed(2)) : null;

    const createdOrder = await createFulfilledOrder(supabase, {
      userId: req.authUser.id,
      profile: req.profile,
      customerName: customer_name,
      phoneNumber: phone_number || deliveryAddress.contactNumber,
      address: deliveryAddress.address || address,
      deliveryMethod: normalizedDeliveryMethod,
      paymentMethod: normalizedPaymentMethod,
      totalPrice: finalTotal,
      deliveryAddressId: savedDeliveryAddress?.id || null,
      cashReceived,
      changeAmount,
      deliveryDistanceKm: Number.isFinite(normalizedDistance) ? normalizedDistance : null,
      deliveryLatitude: Number.isFinite(resolvedLatitude) ? resolvedLatitude : null,
      deliveryLongitude: Number.isFinite(resolvedLongitude) ? resolvedLongitude : null,
      deliveryAddress,
      deliveryRecipientName: deliveryAddress.recipientName,
      deliveryContactNumber: deliveryAddress.contactNumber,
      deliveryStreetAddress: deliveryAddress.streetAddress,
      deliveryBarangay: deliveryAddress.barangay,
      deliveryCity: deliveryAddress.city,
      deliveryProvince: deliveryAddress.province,
      deliveryPostalCode: deliveryAddress.postalCode,
      deliveryFormattedAddress: deliveryAddress.formattedAddress,
      deliveryPlaceId: deliveryAddress.placeId,
      deliveryInstructions: delivery_instructions,
      orderStatus: initialOrderStatus,
      items: finalizedItems,
    });

    res.status(201).json(createdOrder);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/lalamove/book', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    if (currentOrder.lalamove_order_id) {
      return res.json({ order: mapOrder(currentOrder), lalamoveLaunch: buildLalamoveBookingLaunch(currentOrder) });
    }
    assertLalamoveBookableOrder(currentOrder);

    const instructions = String(
      req.body?.instructions
      ?? req.body?.deliveryInstructions
      ?? req.body?.delivery_instructions
      ?? currentOrder.delivery_instructions
      ?? '',
    ).trim();
    const deliveryAddress = buildDeliveryAddressFromBody(req.body || {}, currentOrder);
    const coordinates = getDeliveryCoordinatesFromBody(req.body || {}, {
      ...currentOrder,
      delivery_latitude: deliveryAddress.latitude,
      delivery_longitude: deliveryAddress.longitude,
    });

    const addressPatch = buildDeliveryAddressPatch({
      ...deliveryAddress,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    }, instructions);
    if (!deliveryAddress.recipientName || !deliveryAddress.contactNumber || !addressPatch.address) {
      return res.status(400).json({ error: 'The saved delivery needs a recipient name, contact number, and address before booking.' });
    }
    if (!String(coordinates.latitude ?? '').trim() || !String(coordinates.longitude ?? '').trim() || !isValidDeliveryCoordinates(coordinates)) {
      return res.status(400).json({ error: ADDRESS_GEOCODE_ERROR });
    }

    const shopSettings = await getShopSettings(supabase);
    const bookedOrder = await bookLalamoveOrder({
      supabase,
      order: currentOrder,
      addressPatch,
      instructions,
      pickup: {
        name: shopSettings.shopName,
        phone: shopSettings.phoneNumber,
        address: shopSettings.address,
        latitude: shopSettings.latitude,
        longitude: shopSettings.longitude,
      },
    });

    // The reference is already durable before notifications/inventory updates.
    let updatedOrder = bookedOrder;
    let warning = '';
    try {
      const latestOrder = await fetchOrderById(supabase, bookedOrder.id);
      updatedOrder = await applyLalamoveTrackingUpdate(supabase, latestOrder, {}, { booked: true });
    } catch (trackingError) {
      console.warn('Lalamove booked; follow-up tracking update failed:', trackingError.message);
      warning = 'Delivery booked. Refresh tracking to update the order status.';
    }

    res.status(201).json({
      order: mapOrder(updatedOrder),
      lalamoveLaunch: buildLalamoveBookingLaunch(updatedOrder),
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/lalamove/sync', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const updatedOrder = await syncLalamoveTrackingForOrder(supabase, currentOrder);
    res.json(mapOrder(updatedOrder));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/lalamove/cancel', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const shopSettings = await getShopSettings(supabase);
    const updatedOrder = await cancelLalamoveOrder({
      supabase,
      order: currentOrder,
      actorId: req.user?.id || req.profile?.id || null,
      pickup: {
        name: shopSettings.shopName,
        phone: shopSettings.phoneNumber,
        address: shopSettings.address,
        latitude: shopSettings.latitude,
        longitude: shopSettings.longitude,
      },
    });
    res.json({ order: mapOrder(updatedOrder) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/lalamove/reference', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const deliveryMethod = normalizeDeliveryMethod(currentOrder.delivery_method || 'pickup');
    const reference = String(
      req.body?.lalamoveOrderId
      || req.body?.lalamove_order_id
      || req.body?.orderId
      || req.body?.reference
      || '',
    ).trim();
    const shareLink = String(req.body?.shareLink || req.body?.lalamove_share_link || '').trim();

    if (deliveryMethod !== 'delivery') {
      return res.status(400).json({ error: 'Only delivery orders can store a Lalamove booking reference.' });
    }

    if (!reference) {
      return res.status(400).json({ error: 'Lalamove booking reference is required.' });
    }

    if (currentOrder.lalamove_status === 'BOOKING' && Date.now() - toTimestamp(currentOrder.lalamove_last_synced_at) < 60000) {
      return res.status(409).json({ error: 'The Lalamove booking is still processing. Wait a minute and refresh before saving a reference.' });
    }

    const now = new Date().toISOString();
    const notifications = [
      ...normalizeNotifications(currentOrder.notifications || []),
      buildNotificationEntry('admin_staff', 'delivery_reference_saved', `Lalamove reference ${reference} was saved for order ${currentOrder.order_code || currentOrder.id}.`),
    ];
    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
      lalamove_order_id: reference,
      lalamove_status: ['BOOKING', 'BOOKING_UNCONFIRMED'].includes(currentOrder.lalamove_status)
        ? 'MANUAL_CONFIRMED'
        : currentOrder.lalamove_status || 'MANUAL_CONFIRMED',
      lalamove_share_link: shareLink || currentOrder.lalamove_share_link || null,
      lalamove_booked_at: currentOrder.lalamove_booked_at || now,
      lalamove_last_synced_at: now,
      lalamove_booking_error: null,
      lalamove_metadata: {
        ...(currentOrder.lalamove_metadata && typeof currentOrder.lalamove_metadata === 'object'
          ? currentOrder.lalamove_metadata
          : {}),
        manualReferenceSavedAt: now,
      },
      notifications,
    });

    res.json(mapOrder(updatedOrder));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/items', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const currentStatus = normalizeOrderStatus(currentOrder.order_status);
    const currentReviewStatus = normalizeReviewStatus(currentOrder.review_status);
    const placedByRole = String(currentOrder.profiles?.role || '').toLowerCase();

    if (!['pending', 'confirmed'].includes(currentStatus)) {
      return res.status(400).json({ error: 'Only pending or confirmed orders can be edited from the POS.' });
    }

    if (!['admin', 'staff'].includes(placedByRole) || String(currentOrder.delivery_method || '').toLowerCase() !== 'pickup') {
      return res.status(403).json({ error: 'Only walk-in pickup orders can be edited.' });
    }

    if (currentReviewStatus === 'under_review') {
      return res.status(409).json({ error: 'This order is under review and cannot be edited right now.' });
    }

    const items = req.body?.items || req.body?.lineItems || [];

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one order item is required.' });
    }

    const normalizedItems = normalizeRequestedItems(items);

    if (normalizedItems.some((item) => !item.product_id)) {
      return res.status(400).json({ error: 'Each order item must include a product_id.' });
    }

    const productsById = await fetchProductsByIds(
      supabase,
      [...new Set(normalizedItems.map((item) => item.product_id))],
    );
    const shortages = getShortagesForItems(normalizedItems, productsById);

    if (shortages.length > 0) {
      return res.status(409).json({
        error: 'Some products do not have enough stock.',
        shortages,
      });
    }

    const finalizedItems = enrichItemsFromProducts(normalizedItems, productsById).map((item) => ({
      ...item,
      available_stock_quantity: Number(productsById.get(item.product_id)?.stock_quantity) || 0,
    }));

    const deliveryMethod = String(req.body?.delivery_method || currentOrder.delivery_method || 'pickup').toLowerCase();
    const paymentMethod = String(req.body?.payment_method || currentOrder.payment_method || 'cash').toLowerCase();
    const normalizedDistanceValue = Number(req.body?.delivery_distance_km ?? currentOrder.delivery_distance_km);
    const deliveryDistanceKm = Number.isFinite(normalizedDistanceValue) ? normalizedDistanceValue : null;
    const normalizedLatitudeValue = Number(req.body?.delivery_latitude ?? currentOrder.delivery_latitude);
    const normalizedLongitudeValue = Number(req.body?.delivery_longitude ?? currentOrder.delivery_longitude);
    const subtotal = finalizedItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
    const totalPrice = subtotal + (deliveryMethod === 'delivery' ? DELIVERY_FEE : 0);
    const requestedCashReceived = Number(req.body?.cash_received ?? currentOrder.cash_received);
    const isCashWalkInOrder = paymentMethod === 'cash' && deliveryMethod === 'pickup';
    if (isCashWalkInOrder && (!Number.isFinite(requestedCashReceived) || requestedCashReceived < totalPrice)) {
      return res.status(400).json({
        error: `Cash received must be at least PHP ${totalPrice.toFixed(2)}.`,
      });
    }
    const cashReceived = isCashWalkInOrder ? requestedCashReceived : null;
    const changeAmount = isCashWalkInOrder ? Number((requestedCashReceived - totalPrice).toFixed(2)) : null;
    const containsLecheFlan = hasLecheFlanItems(finalizedItems);
    const restrictionMessage = deliveryMethod === 'delivery'
      ? getLecheFlanRestrictionMessage(deliveryDistanceKm)
      : '';
    const now = new Date().toISOString();
    const notifications = normalizeNotifications(currentOrder.notifications || []);
    const verificationRequired = shouldRequireOrderVerification(deliveryMethod, paymentMethod);
    const shouldRotateQrToken = verificationRequired
      && (
        !currentOrder.verification_required
        || !currentOrder.qr_token
        || isOrderQrExpired(currentOrder)
        || currentOrder.qr_used_at
      );
    const nextQrToken = verificationRequired
      ? (shouldRotateQrToken ? generateOrderQrToken() : currentOrder.qr_token)
      : null;

    const orderPatch = {
      customer_name: String(req.body?.customer_name || currentOrder.customer_name || 'Customer').trim() || currentOrder.customer_name || 'Customer',
      phone_number: String(req.body?.phone_number ?? currentOrder.phone_number ?? '').trim() || null,
      address: String(req.body?.address ?? currentOrder.address ?? '').trim() || null,
      delivery_method: deliveryMethod,
      payment_method: paymentMethod,
      delivery_distance_km: deliveryDistanceKm,
      delivery_latitude: Number.isFinite(normalizedLatitudeValue) ? normalizedLatitudeValue : null,
      delivery_longitude: Number.isFinite(normalizedLongitudeValue) ? normalizedLongitudeValue : null,
      delivery_instructions: String(req.body?.delivery_instructions ?? currentOrder.delivery_instructions ?? '').trim() || null,
      total_price: totalPrice,
      cash_received: cashReceived,
      change_amount: changeAmount,
      contains_leche_flan: containsLecheFlan,
      verification_required: verificationRequired,
      qr_token: nextQrToken,
      qr_generated_at: nextQrToken ? (shouldRotateQrToken ? now : (currentOrder.qr_generated_at || now)) : null,
      qr_expires_at: nextQrToken ? (shouldRotateQrToken ? createOrderQrExpiry(now) : currentOrder.qr_expires_at) : null,
      qr_used_at: nextQrToken ? (shouldRotateQrToken ? null : currentOrder.qr_used_at) : null,
      verified_at: nextQrToken ? (shouldRotateQrToken ? null : currentOrder.verified_at) : null,
      verified_by: nextQrToken ? (shouldRotateQrToken ? null : currentOrder.verified_by) : null,
      verification_method: nextQrToken ? (shouldRotateQrToken ? null : currentOrder.verification_method) : 'manual',
      qr_claimed_at: nextQrToken ? (shouldRotateQrToken ? null : currentOrder.qr_claimed_at) : (currentOrder.qr_claimed_at || null),
    };

    if (restrictionMessage && containsLecheFlan) {
      const cancelledSnapshot = {
        ...currentOrder,
        delivery_method: deliveryMethod,
        delivery_distance_km: deliveryDistanceKm,
      };
      const { statusPatch, notifications: cancellationNotifications } = await setOrderStatus(
        supabase,
        cancelledSnapshot,
        'cancelled',
        { reason: restrictionMessage },
      );

      Object.assign(orderPatch, statusPatch, {
        review_status: 'none',
        review_reason: null,
        review_status_updated_at: null,
        cancellation_reason: restrictionMessage,
        notifications: [...notifications, ...cancellationNotifications],
      });
    }

    const { error: removeItemsError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', currentOrder.id);

    if (removeItemsError) {
      throw removeItemsError;
    }

    const orderItemsPayload = finalizedItems.map((item) => ({
      order_id: currentOrder.id,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price,
    }));

    if (orderItemsPayload.length > 0) {
      const { error: insertItemsError } = await supabase
        .from('order_items')
        .insert(orderItemsPayload);

      if (insertItemsError) {
        throw insertItemsError;
      }
    }

    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, orderPatch);
    res.json(mapOrder(updatedOrder));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/qr/regenerate', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const role = String(req.profile?.role || '').toLowerCase();
    const isPrivileged = ['admin', 'staff'].includes(role);

    if (!isPrivileged && currentOrder.user_id !== req.authUser.id) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (currentOrder.verification_required === false || !currentOrder.qr_token) {
      return res.status(409).json({ error: 'This order does not have a QR code that can be regenerated.' });
    }

    if (TERMINAL_ORDER_STATUSES.has(normalizeOrderStatus(currentOrder.order_status))) {
      return res.status(409).json({ error: 'This order is already finalized and its QR code cannot be regenerated.' });
    }

    if (!currentOrder.qr_used_at && !isOrderQrExpired(currentOrder)) {
      return res.status(409).json({ error: 'The current QR Code/Order ID is still valid.' });
    }

    const generatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('orders')
      .update({
        qr_token: generateOrderQrToken(),
        qr_generated_at: generatedAt,
        qr_expires_at: createOrderQrExpiry(generatedAt),
        qr_used_at: null,
        qr_claimed_at: null,
        verified_at: null,
        verified_by: null,
        verification_method: null,
      })
      .eq('id', currentOrder.id)
      .eq('qr_token', currentOrder.qr_token)
      .select(orderSelect)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(409).json({ error: 'The order QR code changed. Refresh the order and try again.' });
    }

    res.json(mapOrder(await hydrateOrderWithProfile(supabase, data)));
  } catch (error) {
    next(error);
  }
});

router.post('/lookup', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const identifier = req.body?.identifier || req.body?.orderCode || req.body?.orderId || '';
    const supabase = getSupabaseAdmin();
    const order = await fetchOrderByIdentifier(supabase, identifier);

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    res.json(mapOrder(order));
  } catch (error) {
    next(error);
  }
});

router.post('/verify', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const identifier = req.body?.identifier || req.body?.orderCode || req.body?.orderId || '';
    const explicitQrToken = req.body?.qrToken || req.body?.qr_token || '';
    const supabase = getSupabaseAdmin();
    const parsedQrToken = extractOrderQrToken(explicitQrToken || identifier);
    let verificationMethod = parsedQrToken ? 'qr' : 'order_id';
    let order = null;

    if (parsedQrToken) {
      order = await fetchOrderByQrToken(supabase, parsedQrToken);
      if (!order) {
        return res.status(404).json({ error: 'Order not found for that QR code.' });
      }

      if (order.verification_required === false) {
        return res.status(409).json({ error: 'This order does not require QR verification.' });
      }

      if (!order.qr_token) {
        return res.status(409).json({ error: 'This order has no active QR token.' });
      }

      if (isOrderQrExpired(order)) {
        return res.status(409).json({ error: ORDER_QR_EXPIRED_MESSAGE });
      }

      if (order.qr_used_at) {
        return res.status(409).json({ error: 'This QR code has already been used.' });
      }
    } else {
      order = await fetchOrderByIdentifier(supabase, identifier);
      if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      if (order.verification_required !== false && isOrderQrExpired(order)) {
        return res.status(409).json({ error: ORDER_QR_EXPIRED_MESSAGE });
      }

      if (!identifier) {
        verificationMethod = 'manual';
      }
    }

    const normalizedStatus = normalizeOrderStatus(order.order_status);
    if (TERMINAL_ORDER_STATUSES.has(normalizedStatus)) {
      return res.status(409).json({ error: 'This order is already finalized and cannot be verified again.' });
    }

    const updatedOrder = await applyOrderVerification(supabase, order, {
      verifiedBy: req.authUser.id,
      verificationMethod,
      consumeQr: verificationMethod !== 'manual',
    });

    res.json({
      order: mapOrder(updatedOrder),
      verification: {
        method: normalizeVerificationMethod(verificationMethod),
        qrConsumedAt: updatedOrder.qr_used_at || null,
        verifiedAt: updatedOrder.verified_at || null,
        qrPayload: updatedOrder.qr_token ? buildOrderQrPayload(updatedOrder.qr_token) : '',
      },
    });
  } catch (error) {
    next(error);
  }
});

const handleMarkDelivered = async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const deliveryMethod = normalizeDeliveryMethod(currentOrder.delivery_method || 'pickup');
    const currentStatus = normalizeOrderStatus(currentOrder.order_status);

    if (['delivered', 'completed', 'cancelled', 'refunded'].includes(currentStatus)) {
      return res.status(409).json({ error: 'This order has already been confirmed or finalized.' });
    }

    if (deliveryMethod === 'pickup' && currentOrder.verification_required !== false && isOrderQrExpired(currentOrder)) {
      return res.status(409).json({ error: ORDER_QR_EXPIRED_MESSAGE });
    }

    const updatedOrder = await applyOrderStatusChange(supabase, req.params.id, 'delivered');

    if (deliveryMethod !== 'pickup') {
      return res.json(mapOrder(updatedOrder));
    }

    if (updatedOrder.verified_at || updatedOrder.qr_used_at) {
      return res.json(mapOrder(updatedOrder));
    }

    const verifiedOrder = await applyOrderVerification(supabase, updatedOrder, {
      verifiedBy: req.authUser.id,
      verificationMethod: updatedOrder.verification_method || 'manual',
      consumeQr: true,
    });
    return res.json(mapOrder(verifiedOrder));
  } catch (error) {
    next(error);
  }
};

router.post('/:id/deliver', requireAuth, requireRole('admin', 'staff'), handleMarkDelivered);
router.post('/:id/confirm-pickup', requireAuth, requireRole('admin', 'staff'), handleMarkDelivered);

const handleCustomerReceiptConfirmation = async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: currentOrderRow, error: currentError } = await supabase
      .from('orders')
      .select(orderSelect)
      .eq('id', req.params.id)
      .eq('user_id', req.authUser.id)
      .maybeSingle();

    if (currentError) {
      throw currentError;
    }

    const currentOrder = await hydrateOrderWithProfile(supabase, currentOrderRow);

    if (!currentOrder) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const currentStatus = normalizeOrderStatus(currentOrder.order_status);
    const currentReviewStatus = normalizeReviewStatus(currentOrder.review_status);

    if (currentStatus !== 'delivered') {
      return res.status(400).json({ error: 'The order must be Delivered before it can be completed.' });
    }

    if (currentReviewStatus === 'under_review') {
      return res.status(409).json({ error: 'This order is under review. Please wait for the issue report to be resolved first.' });
    }

    const receiptImageDataUrl = validateReceiptImageDataUrl(
      req.body?.receipt_image_data_url
      || req.body?.receiptImageDataUrl
      || '',
    );

    if (!receiptImageDataUrl) {
      return res.status(400).json({ error: 'Receipt image proof is required.' });
    }

    if (currentOrder.receipt_received_at) {
      return res.status(409).json({ error: 'This order has already been completed.' });
    }

    const now = new Date().toISOString();
    const statusTimestamps = {
      ...normalizeStatusTimestamps(currentOrder.status_timestamps || {}),
      completed: now,
    };
    const notifications = [
      ...normalizeNotifications(currentOrder.notifications || []),
      buildNotificationEntry('customer', 'receipt_confirmed', `Thanks for confirming receipt for Order ${currentOrder.order_code || currentOrder.id}. The order is now completed.`),
      buildNotificationEntry('admin_staff', 'receipt_confirmed', `Customer confirmed receipt for Order ${currentOrder.order_code || currentOrder.id}. The sale has now been recorded.`),
    ];

    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
      order_status: 'completed',
      receipt_image_url: receiptImageDataUrl,
      receipt_received_at: now,
      status_timestamps: statusTimestamps,
      review_status: 'none',
      review_reason: null,
      review_status_updated_at: now,
      notifications,
    });

    res.json(mapOrder(updatedOrder));
  } catch (error) {
    next(error);
  }
};

router.post('/:id/confirm-receipt', requireAuth, handleCustomerReceiptConfirmation);
router.post('/:id/receive', requireAuth, handleCustomerReceiptConfirmation);

router.post('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const currentStatus = normalizeOrderStatus(currentOrder.order_status);
    const role = String(req.profile?.role || '').toLowerCase();
    const isPrivileged = ['admin', 'staff'].includes(role);
    const belongsToCustomer = currentOrder.user_id === req.authUser.id;
    const reason = String(req.body?.reason || req.body?.cancellationReason || '').trim();

    if (!isPrivileged && !belongsToCustomer) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (!isPrivileged && currentStatus !== 'pending') {
      return res.status(400).json({ error: 'Customers can only cancel orders while they are pending.' });
    }

    if (isPrivileged && ['delivered', 'completed', 'refunded', 'cancelled'].includes(currentStatus)) {
      return res.status(400).json({ error: 'This order can no longer be cancelled.' });
    }

    const { statusPatch, notifications } = await setOrderStatus(supabase, currentOrder, 'cancelled', { reason });
    const mergedNotifications = [
      ...normalizeNotifications(currentOrder.notifications || []),
      ...notifications,
    ];

    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
      ...statusPatch,
      notifications: mergedNotifications,
    });

    res.json(mapOrder(updatedOrder));
  } catch (error) {
    next(error);
  }
});

router.get('/return-refund-requests', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('return_refund_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json((data || []).map(mapReturnRefundRequest));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/return-refund-requests', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const role = String(req.profile?.role || '').toLowerCase();

    if (currentOrder.user_id !== req.authUser.id && !['admin', 'staff'].includes(role)) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const currentStatus = normalizeOrderStatus(currentOrder.order_status);
    const existingRequestStatus = String(currentOrder.return_refund_status || 'none').toLowerCase();
    if (!['delivered', 'completed'].includes(currentStatus)) {
      return res.status(400).json({ error: 'Return or refund requests are available after the order is delivered or completed.' });
    }

    if (existingRequestStatus !== 'none') {
      return res.status(409).json({ error: 'This order already has a return or refund request.' });
    }

    const requestType = normalizeReturnRefundType(req.body?.request_type || req.body?.requestType);
    const reason = String(req.body?.reason || '').trim();
    const customerMessage = String(req.body?.customer_message || req.body?.customerMessage || '').trim();
    const evidenceImageDataUrl = validateReceiptImageDataUrl(
      req.body?.evidence_image_data_url
      || req.body?.evidenceImageDataUrl
      || req.body?.image_data_url
      || '',
    );
    if (!reason) {
      return res.status(400).json({ error: 'Select or enter a reason for the return or refund request.' });
    }

    const now = new Date().toISOString();
    const history = [buildReturnRefundHistoryEntry({
      status: 'pending',
      actorId: req.authUser.id,
      actorRole: role || 'customer',
      note: reason,
      at: now,
    })];
    const { data: request, error: requestError } = await supabase
      .from('return_refund_requests')
      .insert({
        order_id: currentOrder.id,
        user_id: currentOrder.user_id,
        request_type: requestType,
        reason,
        customer_message: customerMessage || null,
        evidence_image_url: evidenceImageDataUrl,
        status: 'pending',
        status_history: history,
      })
      .select('*')
      .single();

    if (requestError) {
      throw requestError;
    }

    const requestLabel = requestType === 'return' ? 'return' : 'refund';
    const notifications = [
      ...normalizeNotifications(currentOrder.notifications || []),
      buildNotificationEntry('customer', 'return_refund_requested', `Your ${requestLabel} request for Order ${currentOrder.order_code || currentOrder.id} is pending review.`),
      buildNotificationEntry('admin_staff', 'return_refund_requested', `New ${requestLabel} request received for Order ${currentOrder.order_code || currentOrder.id}.`),
    ];
    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
      return_refund_status: 'pending',
      return_refund_request_id: request.id,
      notifications,
    });

    res.status(201).json({
      request: mapReturnRefundRequest(request),
      order: mapOrder(updatedOrder),
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/return-refund-requests/:requestId', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const nextStatusRaw = String(req.body?.status || '').trim().toLowerCase();
    if (!RETURN_REFUND_STATUSES.includes(nextStatusRaw)) {
      return res.status(400).json({ error: 'status must be pending, approved, processing, refunded, completed, or rejected.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: currentRequest, error: requestError } = await supabase
      .from('return_refund_requests')
      .select('*')
      .eq('id', req.params.requestId)
      .maybeSingle();
    if (requestError) {
      throw requestError;
    }
    if (!currentRequest) {
      return res.status(404).json({ error: 'Return or refund request not found.' });
    }

    const currentStatus = normalizeReturnRefundStatus(currentRequest.status);
    const nextStatus = normalizeReturnRefundStatus(nextStatusRaw);
    const reason = String(req.body?.reason || req.body?.rejection_reason || '').trim();
    if (nextStatus === 'rejected' && !reason) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }
    if (!isValidReturnRefundTransition(currentStatus, nextStatus)) {
      return res.status(409).json({ error: `This request cannot move from ${currentStatus} to ${nextStatus}.` });
    }

    const now = new Date().toISOString();
    const timestampFields = {
      approved: 'approved_at',
      processing: 'processing_at',
      refunded: 'refunded_at',
      completed: 'completed_at',
      rejected: 'rejected_at',
    };
    const history = [
      ...(Array.isArray(currentRequest.status_history) ? currentRequest.status_history : []),
      buildReturnRefundHistoryEntry({
        status: nextStatus,
        actorId: req.authUser.id,
        actorRole: req.profile?.role || 'staff',
        note: reason,
        at: now,
      }),
    ];
    const { data: updatedRequest, error: updateRequestError } = await supabase
      .from('return_refund_requests')
      .update({
        status: nextStatus,
        rejection_reason: nextStatus === 'rejected' ? reason : currentRequest.rejection_reason,
        [timestampFields[nextStatus]]: now,
        status_history: history,
      })
      .eq('id', currentRequest.id)
      .select('*')
      .single();
    if (updateRequestError) {
      throw updateRequestError;
    }

    const currentOrder = await fetchOrderById(supabase, currentRequest.order_id);
    const requestLabel = currentRequest.request_type === 'return' ? 'return' : 'refund';
    const statusText = nextStatus === 'rejected'
      ? `${requestLabel} request was rejected. Reason: ${reason}.`
      : `${requestLabel} request is now ${nextStatus}.`;
    const statusTimestamps = normalizeStatusTimestamps(currentOrder.status_timestamps || {});
    if (nextStatus === 'refunded') {
      statusTimestamps.refunded = now;
    }
    const notifications = [
      ...normalizeNotifications(currentOrder.notifications || []),
      buildNotificationEntry('customer', `return_refund_${nextStatus}`, `Your ${statusText}`),
      buildNotificationEntry('admin_staff', `return_refund_${nextStatus}`, `Order ${currentOrder.order_code || currentOrder.id}: ${statusText}`),
    ];
    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
      return_refund_status: nextStatus,
      return_refund_request_id: currentRequest.id,
      order_status: ['refunded', 'completed'].includes(nextStatus) ? 'refunded' : currentOrder.order_status,
      status_timestamps: statusTimestamps,
      notifications,
    });

    res.json({
      request: mapReturnRefundRequest(updatedRequest),
      order: mapOrder(updatedOrder),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/report-issue', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const currentStatus = normalizeOrderStatus(currentOrder.order_status);
    const currentReviewStatus = normalizeReviewStatus(currentOrder.review_status);

    if (currentOrder.user_id !== req.authUser.id && !['admin', 'staff'].includes(String(req.profile?.role || '').toLowerCase())) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (currentStatus !== 'delivered') {
      return res.status(400).json({ error: 'You can only report an issue after the order is marked Delivered.' });
    }

    if (currentReviewStatus === 'under_review') {
      return res.status(409).json({ error: 'This order is already under review.' });
    }

    const customerName = String(
      req.body?.customer_name
      || req.body?.customerName
      || currentOrder.customer_name
      || req.profile?.full_name
      || req.profile?.username
      || 'Customer',
    ).trim();
    const description = String(req.body?.description || '').trim();
    const issueType = String(req.body?.issue_type || req.body?.issueType || 'damage').trim() || 'damage';
    const evidenceImageDataUrl = validateReceiptImageDataUrl(
      req.body?.evidence_image_data_url
      || req.body?.evidenceImageDataUrl
      || req.body?.image_data_url
      || '',
    );

    if (!customerName) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    if (!description) {
      return res.status(400).json({ error: 'Description of the issue is required.' });
    }

    if (!evidenceImageDataUrl) {
      return res.status(400).json({ error: 'Photographic evidence is required.' });
    }

    const now = new Date().toISOString();

    const { data: report, error: reportError } = await supabase
      .from('order_issue_reports')
      .insert({
        order_id: currentOrder.id,
        user_id: currentOrder.user_id,
        customer_name: customerName,
        issue_type: issueType,
        description,
        evidence_image_url: evidenceImageDataUrl,
        detection_date: now,
        review_status: 'under_review',
      })
      .select('*')
      .single();

    if (reportError) {
      throw reportError;
    }

    const statusTimestamps = {
      ...normalizeStatusTimestamps(currentOrder.status_timestamps || {}),
    };
    const notifications = [
      ...normalizeNotifications(currentOrder.notifications || []),
      buildNotificationEntry('customer', 'issue_report_submitted', `Your return request for Order ${currentOrder.order_code || currentOrder.id} is now under review.`),
      buildNotificationEntry('admin_staff', 'issue_report_submitted', `New return request received for Order ${currentOrder.order_code || currentOrder.id}. Review the photo proof and details.`),
    ];

    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
      review_status: 'under_review',
      review_reason: null,
      review_status_updated_at: now,
      status_timestamps: statusTimestamps,
      notifications,
    });

    res.status(201).json({
      order: mapOrder(updatedOrder),
      report,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/reports/:reportId', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const decision = String(req.body?.decision || req.body?.review_status || '').trim().toLowerCase();
    const reason = String(req.body?.reason || req.body?.reviewReason || '').trim();

    if (!['approve', 'approved', 'reject', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approve or reject.' });
    }

    if (['reject', 'rejected'].includes(decision) && !reason) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: report, error: reportError } = await supabase
      .from('order_issue_reports')
      .select('*')
      .eq('id', req.params.reportId)
      .maybeSingle();

    if (reportError) {
      throw reportError;
    }

    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const currentOrder = await fetchOrderById(supabase, report.order_id);
    const currentReviewStatus = normalizeReviewStatus(currentOrder.review_status);

    if (currentReviewStatus !== 'under_review') {
      return res.status(409).json({ error: 'This report has already been resolved.' });
    }

    const now = new Date().toISOString();
    const reviewerId = req.authUser.id;
    const mergedNotifications = [...normalizeNotifications(currentOrder.notifications || [])];

    if (['approve', 'approved'].includes(decision)) {
      const updatedReport = await supabase
        .from('order_issue_reports')
        .update({
          review_status: 'approved',
          review_reason: reason || 'Return approved.',
          reviewed_by: reviewerId,
          reviewed_at: now,
        })
        .eq('id', report.id)
        .select('*')
        .single();

      if (updatedReport.error) {
        throw updatedReport.error;
      }

      const statusTimestamps = {
        ...normalizeStatusTimestamps(currentOrder.status_timestamps || {}),
        refunded: now,
      };

      mergedNotifications.push(
        buildNotificationEntry('customer', 'refund_approved', `Your return request for Order ${currentOrder.order_code || currentOrder.id} was approved. The order is now marked Returned.`),
        buildNotificationEntry('admin_staff', 'refund_approved', `Return approved for Order ${currentOrder.order_code || currentOrder.id}. Any recorded sale has been adjusted.`),
      );

      const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
        order_status: 'refunded',
        review_status: 'approved',
        review_reason: reason || 'Return approved.',
        review_status_updated_at: now,
        feedback_token: null,
        feedback_token_generated_at: null,
        status_timestamps: statusTimestamps,
        notifications: mergedNotifications,
      });

      return res.json({
        report: updatedReport.data,
        order: mapOrder(updatedOrder),
      });
    }

    const updatedReport = await supabase
      .from('order_issue_reports')
      .update({
        review_status: 'rejected',
        review_reason: reason,
        reviewed_by: reviewerId,
        reviewed_at: now,
      })
      .eq('id', report.id)
      .select('*')
      .single();

    if (updatedReport.error) {
      throw updatedReport.error;
    }

    mergedNotifications.push(
      buildNotificationEntry('customer', 'refund_rejected', `Your return request for Order ${currentOrder.order_code || currentOrder.id} was rejected. Reason: ${reason}.`),
      buildNotificationEntry('admin_staff', 'refund_rejected', `Return request rejected for Order ${currentOrder.order_code || currentOrder.id}.`),
    );

    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
      review_status: 'rejected',
      review_reason: reason,
      review_status_updated_at: now,
      notifications: mergedNotifications,
    });

    return res.json({
      report: updatedReport.data,
      order: mapOrder(updatedOrder),
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const nextStatus = normalizeOrderStatus(req.body?.order_status || '');
    const reason = String(req.body?.reason || req.body?.cancellationReason || '').trim();

    if (!VALID_ORDER_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ error: 'order_status is required and must be valid.' });
    }

    if (nextStatus === 'pending') {
      return res.status(400).json({ error: 'Pending is only allowed when a new order is created.' });
    }

    if (nextStatus === 'refunded') {
      return res.status(400).json({ error: 'Customer confirmation or return review is required for that status.' });
    }

    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const currentStatus = normalizeOrderStatus(currentOrder.order_status);
    const currentReviewStatus = normalizeReviewStatus(currentOrder.review_status);
    const role = String(req.profile?.role || '').toLowerCase();
    const isPrivileged = ['admin', 'staff'].includes(role);
    const belongsToCustomer = currentOrder.user_id === req.authUser.id;
    const placedByRole = String(currentOrder.profiles?.role || '').toLowerCase();
    const isWalkInOrder = ['admin', 'staff'].includes(placedByRole)
      && String(currentOrder.delivery_method || '').toLowerCase() === 'pickup'
      && String(currentOrder.payment_method || 'cash').toLowerCase() !== 'online';

    if (nextStatus === 'completed' && !isWalkInOrder) {
      return res.status(400).json({ error: 'Customer confirmation is required for that status.' });
    }

    if (nextStatus === 'cancelled') {
      if (!isPrivileged) {
        if (!belongsToCustomer) {
          return res.status(404).json({ error: 'Order not found.' });
        }

        if (currentStatus !== 'pending') {
          return res.status(400).json({ error: 'Customers can only cancel orders while they are pending.' });
        }

        if (currentReviewStatus === 'under_review') {
          return res.status(409).json({ error: 'This order is under review and cannot be cancelled right now.' });
        }
      } else if (['delivered', 'completed', 'refunded', 'cancelled'].includes(currentStatus)) {
        return res.status(400).json({ error: 'This order can no longer be cancelled.' });
      }

      const updatedOrder = await applyOrderStatusChange(supabase, req.params.id, 'cancelled', { reason });
      return res.json(mapOrder(updatedOrder));
    }

    if (!isPrivileged) {
      return res.status(403).json({ error: 'Only admin and staff can update order status.' });
    }

    const updatedOrder = await applyOrderStatusChange(supabase, req.params.id, nextStatus, { reason });
    res.json(mapOrder(updatedOrder));
  } catch (error) {
    next(error);
  }
});

router.post('/analyze', (req, res) => {
  const { orders } = req.body;

  if (!orders || orders.length === 0) {
    return res.json({
      totalRevenue: 0,
      orderCount: 0,
      analysis: 'No orders to analyze yet.',
      aiTip: 'Once you start receiving orders, the AI will provide detailed trend analysis here.',
    });
  }

  const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
  const avgOrder = totalRevenue / orders.length;

  res.json({
    totalRevenue,
    orderCount: orders.length,
    avgOrderValue: avgOrder.toFixed(2),
    analysis: `${orders.length} orders processed totaling PHP ${totalRevenue.toFixed(2)}.`,
    aiTip: 'Consider running weekend promotions to boost mid-week orders.',
  });
});

export default router;

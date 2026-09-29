import { publicErrorMessage } from '../lib/publicErrors';
/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, isBackendIssueError } from '../lib/api';
import { subscribeToDatabaseChanges } from '../lib/realtime';
import { useAuth } from './AuthContext';
import {
  getPaymentStatusLabel,
  isHistoryOrderStatus,
  normalizeOrderStatus,
  normalizeReviewStatus,
} from '../utils/orderWorkflow';

const OrderContext = createContext();

const parseCurrencyAmount = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;

  const parsed = parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseOptionalCoordinate = (value) => (
  String(value ?? '').trim() ? Number(value) : Number.NaN
);

const normalizeLineItems = (items = []) => (
  items.map((item) => ({
    ...item,
    productId: item.productId || item.product_id || item.id,
    quantity: Number(item.quantity) || 0,
    price: Number(item.price) || 0,
    lineTotal: Number(item.lineTotal) || (Number(item.price) || 0) * (Number(item.quantity) || 0),
  }))
);

const normalizeNotifications = (notifications = []) => (
  Array.isArray(notifications)
    ? notifications.map((notification) => ({
        id: String(notification?.id || notification?.notificationId || '').trim(),
        audience: String(notification?.audience || 'customer').toLowerCase(),
        type: String(notification?.type || 'info').toLowerCase(),
        message: String(notification?.message || '').trim(),
        createdAt: notification?.createdAt || notification?.created_at || new Date().toISOString(),
      }))
    : []
);

const normalizeIssueReports = (reports = []) => (
  Array.isArray(reports)
    ? reports.map((report) => ({
        id: report.id,
        orderId: report.orderId || report.order_id || '',
        userId: report.userId || report.user_id || '',
        customerName: report.customerName || report.customer_name || '',
        issueType: report.issueType || report.issue_type || 'damage',
        description: report.description || '',
        evidenceImageUrl: report.evidenceImageUrl || report.evidence_image_url || '',
        detectionDate: report.detectionDate || report.detection_date || report.created_at || report.createdAt || '',
        reviewStatus: normalizeReviewStatus(report.reviewStatus || report.review_status || 'under_review'),
        status: normalizeReviewStatus(report.reviewStatus || report.review_status || 'under_review'),
        reviewReason: report.reviewReason || report.review_reason || '',
        reviewedBy: report.reviewedBy || report.reviewed_by || '',
        reviewedAt: report.reviewedAt || report.reviewed_at || null,
        createdAt: report.createdAt || report.created_at || '',
        updatedAt: report.updatedAt || report.updated_at || '',
      }))
    : []
);

const RETURN_REFUND_STATUSES = new Set(['pending', 'approved', 'processing', 'refunded', 'completed', 'rejected']);

const normalizeReturnRefundStatus = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return RETURN_REFUND_STATUSES.has(normalized) ? normalized : 'none';
};

const normalizeReturnRefundRequests = (requests = []) => (
  Array.isArray(requests)
    ? requests.map((request) => ({
        id: request.id,
        orderId: request.orderId || request.order_id || '',
        userId: request.userId || request.user_id || '',
        type: String(request.type || request.requestType || request.request_type || 'refund').toLowerCase(),
        reason: request.reason || '',
        customerMessage: request.customerMessage || request.customer_message || '',
        evidenceImageUrl: request.evidenceImageUrl || request.evidence_image_url || '',
        status: normalizeReturnRefundStatus(request.status),
        rejectionReason: request.rejectionReason || request.rejection_reason || '',
        submittedAt: request.submittedAt || request.createdAt || request.created_at || '',
        updatedAt: request.updatedAt || request.updated_at || '',
        approvedAt: request.approvedAt || request.approved_at || null,
        processingAt: request.processingAt || request.processing_at || null,
        refundedAt: request.refundedAt || request.refunded_at || null,
        completedAt: request.completedAt || request.completed_at || null,
        rejectedAt: request.rejectedAt || request.rejected_at || null,
        history: Array.isArray(request.history) ? request.history : (Array.isArray(request.status_history) ? request.status_history : []),
      }))
    : []
);

const normalizePaymentCheckouts = (checkouts = []) => (
  Array.isArray(checkouts)
    ? checkouts.map((checkout) => ({
        id: checkout.id,
        provider: String(checkout.provider || 'paymongo').toLowerCase(),
        status: String(checkout.status || '').toLowerCase(),
        paymentMethod: String(checkout.paymentMethod || checkout.payment_method || 'online').toLowerCase(),
        referenceNumber: checkout.referenceNumber || checkout.reference_number || '',
        checkoutSessionId: checkout.checkoutSessionId || checkout.checkout_session_id || '',
        checkoutUrl: checkout.checkoutUrl || checkout.checkout_url || '',
        amount: Number(checkout.amount) || 0,
        currency: checkout.currency || 'PHP',
        failureReason: checkout.failureReason || checkout.failure_reason || '',
        paidAt: checkout.paidAt || checkout.paid_at || null,
        createdAt: checkout.createdAt || checkout.created_at || '',
        updatedAt: checkout.updatedAt || checkout.updated_at || '',
        orderId: checkout.orderId || checkout.order_id || '',
      })).sort((left, right) => (
        new Date(right.updatedAt || right.createdAt || 0).getTime()
        - new Date(left.updatedAt || left.createdAt || 0).getTime()
      ))
    : []
);

const LALAMOVE_STATUS_LABELS = {
  BOOKING: 'Booking in Progress',
  BOOKING_UNCONFIRMED: 'Booking Needs Review',
  ASSIGNING_DRIVER: 'Pending Driver',
  ON_GOING: 'Driver Assigned',
  ONGOING: 'Driver Assigned',
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

const normalizeLalamoveDriver = (driver = {}) => {
  const source = driver && typeof driver === 'object' ? driver : {};
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

const normalizeLalamoveTracking = (tracking = {}, source = {}) => {
  const raw = tracking && typeof tracking === 'object' ? tracking : {};
  const status = normalizeLalamoveStatus(raw.status || source.lalamoveStatus || source.lalamove_status || '');
  const driver = normalizeLalamoveDriver(raw.driver || source.lalamoveDriver || source.lalamove_driver_info || {
    driverId: raw.driverId || source.lalamove_driver_id || '',
  });
  const orderId = raw.orderId || source.lalamove_order_id || '';

  return {
    booked: Boolean(raw.booked ?? source.lalamoveBooked ?? orderId),
    orderId,
    quotationId: raw.quotationId || source.lalamove_quotation_id || '',
    status,
    statusLabel: raw.statusLabel || source.lalamoveStatusLabel || getLalamoveStatusLabel(status),
    shareLink: raw.shareLink || source.lalamoveShareLink || source.lalamove_share_link || '',
    driverId: raw.driverId || source.lalamove_driver_id || driver.driverId || '',
    driver,
    priceBreakdown: raw.priceBreakdown || source.lalamove_price_breakdown || null,
    totalFee: raw.totalFee || source.lalamove_total_fee || raw.priceBreakdown?.total || '',
    currency: raw.currency || raw.priceBreakdown?.currency || 'PHP',
    distanceMeters: Number.isFinite(Number(raw.distanceMeters ?? source.lalamove_distance_meters))
      ? Number(raw.distanceMeters ?? source.lalamove_distance_meters)
      : null,
    estimatedDeliveryAt: raw.estimatedDeliveryAt || source.lalamove_estimated_delivery_at || null,
    bookedAt: raw.bookedAt || source.lalamove_booked_at || null,
    lastSyncedAt: raw.lastSyncedAt || source.lalamove_last_synced_at || null,
    bookingError: (raw.bookingError || source.lalamove_booking_error) ? publicErrorMessage('', 500) : '',
    metadata: raw.metadata || source.lalamove_metadata || null,
  };
};

const normalizeStatusTimestamps = (timestamps = {}) => (
  timestamps && typeof timestamps === 'object'
    ? {
        pending: timestamps.pending || null,
        confirmed: timestamps.confirmed || null,
        preparing: timestamps.preparing || null,
        ready: timestamps.ready || null,
        out_for_delivery: timestamps.out_for_delivery || timestamps.outForDelivery || null,
        delivered: timestamps.delivered || null,
        completed: timestamps.completed || null,
        cancelled: timestamps.cancelled || null,
        refunded: timestamps.refunded || null,
      }
    : {}
);

const buildItemsText = (lineItems = []) => (
  lineItems.map((item) => `${item.quantity}x ${item.name || item.product?.productName || 'Unknown Product'}`).join(', ')
);

const normalizeOrder = (order) => {
  // Guard: Handle null or invalid order
  if (!order || typeof order !== 'object') {
    return null;
  }

  const lineItems = normalizeLineItems(order.lineItems || order.items || []);
  const totalAmount = Number(order.totalAmount ?? order.totalPrice) || parseCurrencyAmount(order.total);
  const createdAt = order.createdAt || order.created_at || new Date().toISOString();
  const paymentMethod = String(order.paymentMethod || order.payment_method || 'cash').toLowerCase();
  const deliveryMethod = String(order.deliveryMethod || order.delivery_method || 'pickup').toLowerCase();
  const status = normalizeOrderStatus(order.status || order.orderStatus || order.order_status || 'pending');
  const reviewStatus = normalizeReviewStatus(order.reviewStatus || order.review_status || 'none');
  const notifications = normalizeNotifications(order.notifications || []);
  const issueReports = normalizeIssueReports(order.issueReports || order.order_issue_reports || []);
  const returnRefundRequests = normalizeReturnRefundRequests(
    order.returnRefundRequests || order.return_refund_requests || [],
  );
  const latestReturnRefundRequest = returnRefundRequests[0] || null;
  const returnRefundStatus = normalizeReturnRefundStatus(
    latestReturnRefundRequest?.status || order.returnRefundStatus || order.return_refund_status,
  );
  const paymentCheckouts = normalizePaymentCheckouts(order.paymentCheckouts || order.payment_checkouts || []);
  const latestPaymentCheckout = paymentCheckouts[0] || null;
  const statusTimestamps = normalizeStatusTimestamps(order.statusTimestamps || order.status_timestamps || {});
  const deliveryLatitude = parseOptionalCoordinate(order.deliveryLatitude ?? order.delivery_latitude);
  const deliveryLongitude = parseOptionalCoordinate(order.deliveryLongitude ?? order.delivery_longitude);
  const deliveryAddress = {
    recipientName: order.deliveryRecipientName || order.delivery_recipient_name || order.customer_name || order.customer || '',
    contactNumber: order.deliveryContactNumber || order.delivery_contact_number || order.phone_number || order.phoneNumber || '',
    streetAddress: order.deliveryStreetAddress || order.delivery_street_address || '',
    barangay: order.deliveryBarangay || order.delivery_barangay || '',
    city: order.deliveryCity || order.delivery_city || '',
    province: order.deliveryProvince || order.delivery_province || '',
    postalCode: order.deliveryPostalCode || order.delivery_postal_code || '',
    formattedAddress: order.deliveryFormattedAddress || order.delivery_formatted_address || order.address || '',
    placeId: order.deliveryPlaceId || order.delivery_place_id || '',
    latitude: Number.isFinite(deliveryLatitude) ? deliveryLatitude : null,
    longitude: Number.isFinite(deliveryLongitude) ? deliveryLongitude : null,
  };
  const lalamoveTracking = normalizeLalamoveTracking(order.lalamove || order.lalamoveTracking || {}, order);
  const placedByRole = String(order.placedByRole || order.placed_by_role || order.profiles?.role || '').toLowerCase();
  const itemsText = typeof order.items === 'string'
    ? order.items
    : (order.itemsText || buildItemsText(lineItems));
  const isWalkInOrder = Boolean(
    order.isWalkInOrder ?? order.is_walk_in_order ?? (
      ['admin', 'staff'].includes(placedByRole)
      && deliveryMethod === 'pickup'
      && String(order.paymentMethod || order.payment_method || 'cash').toLowerCase() !== 'online'
    ),
  );
  const verificationRequired = Boolean(order.verificationRequired ?? order.verification_required ?? true);
  const qrToken = verificationRequired ? String(order.qrToken || order.qr_token || '').toUpperCase() : '';
  const feedbackToken = String(order.feedbackToken || order.feedback_token || '').toUpperCase();
  const qrPayload = String(order.qrPayload || order.qr_payload || (qrToken ? `vng-order:${qrToken}` : ''));
  const qrGeneratedAt = order.qrGeneratedAt || order.qr_generated_at || null;
  const qrGeneratedTime = Date.parse(qrGeneratedAt || '');
  const qrExpiresAt = order.qrExpiresAt || order.qr_expires_at || (
    Number.isFinite(qrGeneratedTime) ? new Date(qrGeneratedTime + (6 * 60 * 1000)).toISOString() : null
  );
  const qrExpiryTime = Date.parse(qrExpiresAt || '');
  const qrUsedAt = order.qrUsedAt || order.qr_used_at || order.qrClaimedAt || order.qr_claimed_at || null;
  const pickupPaymentLabel = paymentMethod === 'online' ? 'Online Payment' : 'Pay at Store';
  const qrActive = Boolean(order.qrActive ?? order.qr_active ?? (
    verificationRequired
    && Boolean(qrToken)
    && !qrUsedAt
    && Number.isFinite(qrExpiryTime)
    && qrExpiryTime > Date.now()
    && !['delivered', 'completed', 'cancelled', 'refunded'].includes(status)
  ));
  const isCodOrder = Boolean(order.isCodOrder ?? order.is_cod_order ?? (
    deliveryMethod === 'delivery' && paymentMethod === 'cash'
  ));

  return {
    ...order,
    id: order.id,
    orderId: order.orderId || order.order_id || order.orderCode || order.order_code || order.displayId || order.display_id || order.id,
    displayId: order.displayId || order.display_id || order.id,
    orderCode: order.orderCode || order.order_code || order.displayId || order.display_id || order.id,
    createdAt,
    updatedAt: order.updatedAt || order.updated_at || createdAt,
    date: order.date || createdAt.split('T')[0],
    status,
    orderStatus: status,
    reviewStatus,
    reviewReason: order.reviewReason || order.review_reason || '',
    reviewStatusUpdatedAt: order.reviewStatusUpdatedAt || order.review_status_updated_at || null,
    returnRefundStatus,
    returnRefundRequestId: order.returnRefundRequestId || order.return_refund_request_id || latestReturnRefundRequest?.id || null,
    returnRefundRequests,
    latestReturnRefundRequest,
    cancellationReason: order.cancellationReason || order.cancellation_reason || '',
    totalAmount,
    totalPrice: totalAmount,
    total: typeof order.total === 'string' ? order.total : `PHP ${totalAmount.toFixed(2)}`,
    lineItems,
    items: itemsText,
    itemsText,
    placedByRole,
    isWalkInOrder,
    deliveryMethod,
    paymentMethod,
    deliveryAddressId: order.deliveryAddressId || order.delivery_address_id || null,
    cashReceived: Number.isFinite(Number(order.cashReceived ?? order.cash_received))
      ? Number(order.cashReceived ?? order.cash_received)
      : null,
    changeAmount: Number.isFinite(Number(order.changeAmount ?? order.change_amount))
      ? Number(order.changeAmount ?? order.change_amount)
      : null,
    isCodOrder,
    deliveryDistanceKm: Number.isFinite(Number(order.deliveryDistanceKm || order.delivery_distance_km))
      ? Number(order.deliveryDistanceKm || order.delivery_distance_km)
      : null,
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
    deliveryInstructions: order.deliveryInstructions || order.delivery_instructions || '',
    containsLecheFlan: Boolean(order.containsLecheFlan ?? order.contains_leche_flan),
    verificationRequired,
    verificationMethod: order.verificationMethod || order.verification_method || '',
    verifiedAt: order.verifiedAt || order.verified_at || null,
    verifiedBy: order.verifiedBy || order.verified_by || null,
    qrToken,
    feedbackToken,
    feedbackTokenGeneratedAt: order.feedbackTokenGeneratedAt || order.feedback_token_generated_at || null,
    qrPayload,
    qrGeneratedAt,
    qrExpiresAt,
    qrExpired: verificationRequired && Boolean(qrToken) && (!Number.isFinite(qrExpiryTime) || qrExpiryTime <= Date.now()),
    qrUsedAt,
    qrClaimedAt: order.qrClaimedAt || order.qr_claimed_at || null,
    readyNotifiedAt: order.readyNotifiedAt || order.ready_notified_at || null,
    readyNotificationMessage: order.readyNotificationMessage || order.ready_notification_message || '',
    paymentCheckouts,
    paymentCheckout: latestPaymentCheckout,
    paymentCheckoutStatus: latestPaymentCheckout?.status || order.paymentCheckoutStatus || order.payment_checkout_status || '',
    paymentCheckoutReferenceNumber: latestPaymentCheckout?.referenceNumber || order.paymentCheckoutReferenceNumber || order.payment_checkout_reference_number || '',
    paymentCheckoutPaidAt: latestPaymentCheckout?.paidAt || order.paymentCheckoutPaidAt || order.payment_checkout_paid_at || null,
    paymentCheckoutFailureReason: latestPaymentCheckout?.failureReason || order.paymentCheckoutFailureReason || order.payment_checkout_failure_reason || '',
    paymentCheckoutAmount: latestPaymentCheckout?.amount || Number(order.paymentCheckoutAmount || order.payment_checkout_amount || 0) || 0,
    paymentReceiptNumber: latestPaymentCheckout?.referenceNumber || order.paymentReceiptNumber || order.payment_receipt_number || order.orderId || order.displayId || order.id,
    paymentStatusLabel: order.paymentStatusLabel || getPaymentStatusLabel({
      paymentMethod,
      deliveryMethod,
      paymentCheckoutStatus: latestPaymentCheckout?.status || order.paymentCheckoutStatus || order.payment_checkout_status || '',
    }),
    lalamove: lalamoveTracking,
    lalamoveTracking,
    lalamoveBooked: lalamoveTracking.booked,
    lalamoveStatus: lalamoveTracking.status,
    lalamoveStatusLabel: lalamoveTracking.statusLabel,
    lalamoveShareLink: lalamoveTracking.shareLink,
    lalamoveDriver: lalamoveTracking.driver,
    receiptImageUrl: order.receiptImageUrl || order.receipt_image_url || '',
    receiptReceivedAt: order.receiptReceivedAt || order.receipt_received_at || null,
    inventoryDeductedAt: order.inventoryDeductedAt || order.inventory_deducted_at || null,
    notifications,
    issueReports,
    latestIssueReport: issueReports[0] || null,
    statusTimestamps,
    confirmedAt: statusTimestamps.confirmed || null,
    preparingAt: statusTimestamps.preparing || null,
    readyAt: statusTimestamps.ready || null,
    outForDeliveryAt: statusTimestamps.out_for_delivery || null,
    deliveredAt: statusTimestamps.delivered || null,
    completedAt: statusTimestamps.completed || null,
    cancelledAt: statusTimestamps.cancelled || null,
    refundedAt: statusTimestamps.refunded || null,
    isHistory: isHistoryOrderStatus(status),
    qrActive,
    subtext: order.subtext || (deliveryMethod === 'delivery'
      ? order.address
      : (isWalkInOrder
        ? `Walk-in / ${pickupPaymentLabel}`
        : `Pick-up / ${pickupPaymentLabel}`)),
  };
};

export const useOrders = () => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrders must be used within an OrderProvider');
  }
  return context;
};

export const OrderProvider = ({ children }) => {
  const { session, userRole, isAuthLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);

  const refreshOrders = useCallback(async () => {
    if (!session?.access_token) {
      setOrders([]);
      return [];
    }

    const endpoint = ['admin', 'staff'].includes(userRole) ? '/api/orders' : '/api/orders/mine';
    const response = await apiRequest(endpoint, {}, {
      auth: true,
      accessToken: session.access_token,
    });

    const normalizedOrders = (response || []).map(normalizeOrder).filter(Boolean);
    setOrders(normalizedOrders);
    return normalizedOrders;
  }, [session, userRole]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    let isActive = true;

    const loadOrders = async () => {
      try {
        setIsOrdersLoading(true);
        const nextOrders = await refreshOrders();
        if (isActive) {
          setOrders(nextOrders);
        }
      } catch (error) {
        if (isBackendIssueError(error)) {
          console.warn('Orders are temporarily unavailable:', error.message);
        } else {
          console.error('Failed to load orders:', error);
        }
        if (isActive) {
          setOrders([]);
        }
      } finally {
        if (isActive) {
          setIsOrdersLoading(false);
        }
      }
    };

    loadOrders();

    return () => {
      isActive = false;
    };
  }, [isAuthLoading, refreshOrders]);

  useEffect(() => {
    if (isAuthLoading || !session?.access_token) {
      return undefined;
    }

    return subscribeToDatabaseChanges({
      channelName: `orders-sync-${userRole || 'guest'}`,
      tables: ['orders', 'order_items', 'order_issue_reports', 'return_refund_requests', 'payment_checkouts'],
      onChange: refreshOrders,
    });
  }, [isAuthLoading, refreshOrders, session?.access_token, userRole]);

  const addOrder = useCallback(async (orderData) => {
    const deliveryAddress = orderData.deliveryAddress || {};
    const payload = {
      customer_name: orderData.customer || '',
      phone_number: orderData.phoneNumber || '',
      address: orderData.address || '',
      delivery_method: orderData.deliveryMethod || 'pickup',
      payment_method: orderData.paymentMethod || 'cash',
      delivery_address_id: orderData.deliveryAddressId || orderData.delivery_address_id || null,
      cash_received: Number.isFinite(Number(orderData.cashReceived ?? orderData.cash_received))
        ? Number(orderData.cashReceived ?? orderData.cash_received)
        : null,
      delivery_distance_km: Number.isFinite(Number(orderData.deliveryDistanceKm))
        ? Number(orderData.deliveryDistanceKm)
        : null,
      delivery_latitude: Number.isFinite(parseOptionalCoordinate(orderData.deliveryLatitude ?? deliveryAddress.latitude))
        ? parseOptionalCoordinate(orderData.deliveryLatitude ?? deliveryAddress.latitude)
        : null,
      delivery_longitude: Number.isFinite(parseOptionalCoordinate(orderData.deliveryLongitude ?? deliveryAddress.longitude))
        ? parseOptionalCoordinate(orderData.deliveryLongitude ?? deliveryAddress.longitude)
        : null,
      delivery_recipient_name: orderData.deliveryRecipientName || deliveryAddress.recipientName || orderData.customer || '',
      delivery_contact_number: orderData.deliveryContactNumber || deliveryAddress.contactNumber || orderData.phoneNumber || '',
      delivery_street_address: orderData.deliveryStreetAddress || deliveryAddress.streetAddress || '',
      delivery_barangay: orderData.deliveryBarangay || deliveryAddress.barangay || '',
      delivery_city: orderData.deliveryCity || deliveryAddress.city || '',
      delivery_province: orderData.deliveryProvince || deliveryAddress.province || '',
      delivery_postal_code: orderData.deliveryPostalCode || deliveryAddress.postalCode || '',
      delivery_formatted_address: orderData.deliveryFormattedAddress || deliveryAddress.formattedAddress || orderData.address || '',
      delivery_place_id: orderData.deliveryPlaceId || deliveryAddress.placeId || '',
      delivery_instructions: orderData.deliveryInstructions || '',
      total_price: Number(orderData.totalAmount) || parseCurrencyAmount(orderData.total),
      order_status: normalizeOrderStatus(orderData.status || 'confirmed'),
      items: (orderData.lineItems || []).map((item) => ({
        product_id: item.productId || item.product_id || item.id,
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
      })),
    };

    const createdOrder = await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = normalizeOrder(createdOrder);
    if (normalizedOrder) {
      setOrders((prev) => [normalizedOrder, ...prev]);
    }
    return normalizedOrder;
  }, [session]);

  const updateOrderItems = useCallback(async (orderId, orderData) => {
    const deliveryAddress = orderData.deliveryAddress || {};
    const payload = {
      customer_name: orderData.customer || orderData.customerName || '',
      phone_number: orderData.phoneNumber || '',
      address: orderData.address || '',
      delivery_method: orderData.deliveryMethod || 'pickup',
      payment_method: orderData.paymentMethod || 'cash',
      delivery_address_id: orderData.deliveryAddressId || orderData.delivery_address_id || null,
      cash_received: Number.isFinite(Number(orderData.cashReceived ?? orderData.cash_received))
        ? Number(orderData.cashReceived ?? orderData.cash_received)
        : null,
      delivery_distance_km: Number.isFinite(Number(orderData.deliveryDistanceKm))
        ? Number(orderData.deliveryDistanceKm)
        : null,
      delivery_latitude: Number.isFinite(parseOptionalCoordinate(orderData.deliveryLatitude ?? deliveryAddress.latitude))
        ? parseOptionalCoordinate(orderData.deliveryLatitude ?? deliveryAddress.latitude)
        : null,
      delivery_longitude: Number.isFinite(parseOptionalCoordinate(orderData.deliveryLongitude ?? deliveryAddress.longitude))
        ? parseOptionalCoordinate(orderData.deliveryLongitude ?? deliveryAddress.longitude)
        : null,
      delivery_recipient_name: orderData.deliveryRecipientName || deliveryAddress.recipientName || orderData.customer || orderData.customerName || '',
      delivery_contact_number: orderData.deliveryContactNumber || deliveryAddress.contactNumber || orderData.phoneNumber || '',
      delivery_street_address: orderData.deliveryStreetAddress || deliveryAddress.streetAddress || '',
      delivery_barangay: orderData.deliveryBarangay || deliveryAddress.barangay || '',
      delivery_city: orderData.deliveryCity || deliveryAddress.city || '',
      delivery_province: orderData.deliveryProvince || deliveryAddress.province || '',
      delivery_postal_code: orderData.deliveryPostalCode || deliveryAddress.postalCode || '',
      delivery_formatted_address: orderData.deliveryFormattedAddress || deliveryAddress.formattedAddress || orderData.address || '',
      delivery_place_id: orderData.deliveryPlaceId || deliveryAddress.placeId || '',
      delivery_instructions: orderData.deliveryInstructions || '',
      items: (orderData.lineItems || []).map((item) => ({
        product_id: item.productId || item.product_id || item.id,
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
      })),
    };

    const updatedOrder = await apiRequest(`/api/orders/${orderId}/items`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = syncOrderFromResponse(updatedOrder);
    if (normalizedOrder) {
      setOrders((prev) => prev.map((order) => (
        order.id === normalizedOrder.id ? normalizedOrder : order
      )));
    }
    return normalizedOrder;
  }, [session]);

  const syncOrderFromResponse = (response) => normalizeOrder(response?.order || response);

  const updateOrderStatus = useCallback(async (orderId, newStatus, options = {}) => {
    const updatedOrder = await apiRequest(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        order_status: normalizeOrderStatus(newStatus),
        ...(options.reason ? { reason: options.reason } : {}),
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = syncOrderFromResponse(updatedOrder);
    if (normalizedOrder) {
      setOrders((prev) => prev.map((order) => (
        order.id === normalizedOrder.id ? normalizedOrder : order
      )));
    }
    return normalizedOrder;
  }, [session]);

  const markOrderAsDelivered = useCallback(async (orderId) => {
    const deliveredOrder = await apiRequest(`/api/orders/${orderId}/deliver`, {
      method: 'POST',
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = syncOrderFromResponse(deliveredOrder);
    setOrders((prev) => prev.map((order) => (
      order.id === normalizedOrder.id ? normalizedOrder : order
    )));
    return normalizedOrder;
  }, [session]);

  const bookLalamoveDelivery = useCallback(async (orderId, deliveryData = {}) => {
    const bookedResult = await apiRequest(`/api/orders/${orderId}/lalamove/book`, {
      method: 'POST',
      body: JSON.stringify({
        recipientName: deliveryData.recipientName || deliveryData.deliveryRecipientName || '',
        contactNumber: deliveryData.contactNumber || deliveryData.deliveryContactNumber || '',
        streetAddress: deliveryData.streetAddress || deliveryData.deliveryStreetAddress || '',
        barangay: deliveryData.barangay || deliveryData.deliveryBarangay || '',
        city: deliveryData.city || deliveryData.deliveryCity || '',
        province: deliveryData.province || deliveryData.deliveryProvince || '',
        postalCode: deliveryData.postalCode || deliveryData.deliveryPostalCode || '',
        formattedAddress: deliveryData.formattedAddress || deliveryData.deliveryFormattedAddress || deliveryData.address || '',
        placeId: deliveryData.placeId || deliveryData.deliveryPlaceId || '',
        destinationLatitude: deliveryData.destinationLatitude ?? deliveryData.deliveryLatitude ?? '',
        destinationLongitude: deliveryData.destinationLongitude ?? deliveryData.deliveryLongitude ?? '',
        instructions: deliveryData.instructions || deliveryData.deliveryInstructions || '',
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const lalamoveLaunch = bookedResult?.lalamoveLaunch || null;
    const responseOrder = bookedResult?.order || bookedResult;
    const normalizedOrder = normalizeOrder({
      ...responseOrder,
      lalamoveShareLink: responseOrder?.lalamoveShareLink || lalamoveLaunch?.shareLink || lalamoveLaunch?.launchUrls?.web || '',
    });
    if (normalizedOrder) {
      setOrders((prev) => prev.map((order) => (
        order.id === normalizedOrder.id ? normalizedOrder : order
      )));
    }
    return {
      order: normalizedOrder,
      lalamoveLaunch,
    };
  }, [session]);

  const syncLalamoveDelivery = useCallback(async (orderId) => {
    const syncedOrder = await apiRequest(`/api/orders/${orderId}/lalamove/sync`, {
      method: 'POST',
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = syncOrderFromResponse(syncedOrder);
    setOrders((prev) => prev.map((order) => (
      order.id === normalizedOrder.id ? normalizedOrder : order
    )));
    return normalizedOrder;
  }, [session]);

  const cancelLalamoveDelivery = useCallback(async (orderId) => {
    const cancelledResult = await apiRequest(`/api/orders/${orderId}/lalamove/cancel`, {
      method: 'POST',
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = syncOrderFromResponse(cancelledResult?.order);
    if (!normalizedOrder?.id) {
      throw new Error('Cancellation response is incomplete. Refresh tracking to check the booking status.');
    }
    setOrders((prev) => prev.map((order) => (
      order.id === normalizedOrder.id ? normalizedOrder : order
    )));
    return normalizedOrder;
  }, [session]);

  const saveLalamoveReference = useCallback(async (orderId, referenceData = {}) => {
    const savedOrder = await apiRequest(`/api/orders/${orderId}/lalamove/reference`, {
      method: 'PATCH',
      body: JSON.stringify({
        lalamoveOrderId: referenceData.lalamoveOrderId || referenceData.orderId || referenceData.reference || '',
        shareLink: referenceData.shareLink || '',
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = syncOrderFromResponse(savedOrder);
    setOrders((prev) => prev.map((order) => (
      order.id === normalizedOrder.id ? normalizedOrder : order
    )));
    return normalizedOrder;
  }, [session]);

  const getLalamoveStatus = useCallback(async () => {
    if (!session?.access_token || !['admin', 'staff'].includes(userRole)) {
      return null;
    }

    return apiRequest('/api/orders/lalamove/status', {}, {
      auth: true,
      accessToken: session.access_token,
    });
  }, [session, userRole]);

  const confirmOrderReceipt = useCallback(async (orderId, receiptImageDataUrl = '') => {
    const confirmedOrder = await apiRequest(`/api/orders/${orderId}/confirm-receipt`, {
      method: 'POST',
      body: JSON.stringify({
        receiptImageDataUrl,
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = syncOrderFromResponse(confirmedOrder);
    setOrders((prev) => prev.map((order) => (
      order.id === normalizedOrder.id ? normalizedOrder : order
    )));
    return normalizedOrder;
  }, [session]);

  const markOrderAsReceived = confirmOrderReceipt;

  const submitOrderIssue = useCallback(async (orderId, issueData = {}) => {
    const reportedOrder = await apiRequest(`/api/orders/${orderId}/report-issue`, {
      method: 'POST',
      body: JSON.stringify({
        customer_name: issueData.customerName || issueData.customer_name || '',
        description: issueData.description || '',
        issue_type: issueData.issueType || issueData.issue_type || 'damage',
        evidence_image_data_url: issueData.evidenceImageDataUrl || issueData.evidence_image_data_url || '',
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = syncOrderFromResponse(reportedOrder);
    setOrders((prev) => prev.map((order) => (
      order.id === normalizedOrder.id ? normalizedOrder : order
    )));
    return normalizedOrder;
  }, [session]);

  const reviewOrderIssue = useCallback(async (reportId, decision, reason = '') => {
    const reviewResult = await apiRequest(`/api/orders/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        decision,
        reason,
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = syncOrderFromResponse(reviewResult);
    setOrders((prev) => prev.map((order) => (
      order.id === normalizedOrder.id ? normalizedOrder : order
    )));
    return normalizedOrder;
  }, [session]);

  const submitReturnRefundRequest = useCallback(async (orderId, requestData = {}) => {
    const response = await apiRequest(`/api/orders/${orderId}/return-refund-requests`, {
      method: 'POST',
      body: JSON.stringify({
        request_type: requestData.type || requestData.requestType || 'refund',
        reason: requestData.reason || '',
        customer_message: requestData.customerMessage || requestData.customer_message || '',
        evidence_image_data_url: requestData.evidenceImageDataUrl || requestData.evidence_image_data_url || '',
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = syncOrderFromResponse(response);
    if (normalizedOrder) {
      setOrders((prev) => prev.map((order) => (
        order.id === normalizedOrder.id ? normalizedOrder : order
      )));
    }
    return normalizedOrder;
  }, [session]);

  const updateReturnRefundRequest = useCallback(async (requestId, status, reason = '') => {
    const response = await apiRequest(`/api/orders/return-refund-requests/${requestId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        ...(reason ? { reason } : {}),
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = syncOrderFromResponse(response);
    if (normalizedOrder) {
      setOrders((prev) => prev.map((order) => (
        order.id === normalizedOrder.id ? normalizedOrder : order
      )));
    }
    return normalizedOrder;
  }, [session]);

  const cancelOrder = useCallback(async (orderId, reason = '') => {
    const normalizedRole = String(userRole || '').toLowerCase();
    const isPrivileged = ['admin', 'staff'].includes(normalizedRole);
    const cancelledOrder = isPrivileged
      ? await apiRequest(`/api/orders/${orderId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({
            order_status: 'cancelled',
            ...(reason ? { reason } : {}),
          }),
        }, {
          auth: true,
          accessToken: session?.access_token,
        })
      : await apiRequest(`/api/orders/${orderId}/cancel`, {
          method: 'POST',
          body: JSON.stringify({
            reason,
          }),
        }, {
          auth: true,
          accessToken: session?.access_token,
        });

    const normalizedOrder = syncOrderFromResponse(cancelledOrder);
    setOrders((prev) => prev.map((order) => (
      order.id === normalizedOrder.id ? normalizedOrder : order
    )));
    return normalizedOrder;
  }, [session, userRole]);

  return (
    <OrderContext.Provider
      value={{
        orders,
        isOrdersLoading,
        addOrder,
        updateOrderItems,
        updateOrderStatus,
        markOrderAsDelivered,
        bookLalamoveDelivery,
        syncLalamoveDelivery,
        cancelLalamoveDelivery,
        saveLalamoveReference,
        getLalamoveStatus,
        confirmOrderReceipt,
        markOrderAsReceived,
        submitOrderIssue,
        reviewOrderIssue,
        submitReturnRefundRequest,
        updateReturnRefundRequest,
        cancelOrder,
        refreshOrders,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
};

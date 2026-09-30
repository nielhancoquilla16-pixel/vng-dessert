import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardList, Clock3, CreditCard, ExternalLink, FileText, Globe, Loader2, MapPin, Phone, Printer, RefreshCw, Search, Send, StickyNote, Truck, UserRound, XCircle, Zap } from 'lucide-react';
import { useOrders } from '../context/OrderContext';
import LocationPinPicker from '../components/LocationPinPicker';
import { OrderedItemsCard, OrderFeedbackReceiptCard, OrderItemThumbnail, OrderQrCard, PaymentSummaryCard } from '../components/AdminOrderCards';
import { getItemSubtotal, getOrderPaymentSummary } from '../utils/adminOrderDetails';
import { formatCurrency } from '../utils/currency';
import {
  closeLalamoveWindow,
  getLalamoveLaunchUrl,
  openLalamoveBooking,
  reserveLalamoveWindow,
} from '../utils/lalamoveLaunch';
import {
  ADDRESS_PIN_ERROR,
  buildDeliveryAddressText,
  formatCoordinate,
  isValidLocation,
} from '../lib/deliveryLocation';
import {
  buildOrderWorkflowProgress,
  getOrderStatusLabel,
  isWalkInOrder,
  normalizeOrderStatus,
  normalizeReviewStatus,
} from '../utils/orderWorkflow';
import './AdminOrders.css';

const STATUS_FILTERS = [
  'all',
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'cancelled',
  'refunded',
  'out-for-delivery',
  'delivered',
  'under_review',
];

const STATUS_PRIORITY = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  'out-for-delivery': 4,
  delivered: 5,
  completed: 6,
  cancelled: 7,
  refunded: 8,
};

const cx = (...classes) => classes.filter(Boolean).join(' ');

const normalizeFilterValue = (value) => String(value || 'all').toLowerCase();

const formatDateTime = (value) => {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getFilterLabel = (value) => {
  if (value === 'pending') return 'Pending';
  if (value === 'all') {
    return 'All';
  }

  if (value === 'under_review') {
    return 'Under Review';
  }

  return getOrderStatusLabel(value, 'admin');
};

const getFilterCount = (orders, filter) => {
  if (filter === 'all') return orders.length;
  if (filter === 'under_review') {
    return orders.filter((order) => normalizeReviewStatus(order?.reviewStatus) === 'under_review').length;
  }

  return orders.filter((order) => normalizeOrderStatus(order?.status) === filter).length;
};

const getReturnRefundRequest = (order) => order?.latestReturnRefundRequest
  || (Array.isArray(order?.returnRefundRequests) ? order.returnRefundRequests[0] : null)
  || null;

const getRefundQueueRequest = (order) => {
  const returnRefundRequest = getReturnRefundRequest(order);
  if (returnRefundRequest) {
    return {
      ...returnRefundRequest,
      source: 'return-refund',
    };
  }

  const issueReport = order?.latestIssueReport
    || (Array.isArray(order?.issueReports) ? order.issueReports[0] : null)
    || null;
  if (!issueReport) {
    return null;
  }

  const reviewStatus = normalizeReviewStatus(issueReport.reviewStatus || issueReport.review_status);
  return {
    id: issueReport.id,
    source: 'issue-report',
    type: 'return',
    reason: issueReport.description || 'Damage or delivery issue reported.',
    submittedAt: issueReport.detectionDate || issueReport.createdAt || '',
    updatedAt: issueReport.updatedAt || '',
    status: reviewStatus === 'under_review' ? 'pending' : reviewStatus,
  };
};

const getReturnRefundStatusLabel = (value = '') => {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'pending') return 'Refund Requested';
  return status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : 'No Request';
};

const getNextReturnRefundStatuses = (status = '') => ({
  pending: ['approved', 'rejected'],
  approved: ['processing', 'rejected'],
  processing: ['refunded'],
  refunded: ['completed'],
}[String(status || '').toLowerCase()] || []);

const getReturnRefundActionLabel = (status = '') => ({
  approved: 'Confirm Return/Refund',
  rejected: 'Reject Return & Refund',
  processing: 'Mark Processing',
  refunded: 'Mark Refunded',
  completed: 'Complete Request',
}[String(status || '').toLowerCase()] || getReturnRefundStatusLabel(status));

const getDisplayId = (order) => String(order?.displayId || order?.orderCode || order?.id || 'N/A');

const getLineItems = (order) => (Array.isArray(order?.lineItems) ? order.lineItems : []);

const getItemCount = (order) => {
  const lineItems = getLineItems(order);

  if (lineItems.length > 0) {
    return lineItems.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity) || 0), 0);
  }

  const fallbackCount = Number(
    order?.itemCount
    ?? order?.itemsCount
    ?? order?.totalItems
    ?? order?.items,
  );

  return Number.isFinite(fallbackCount) && fallbackCount >= 0 ? fallbackCount : 0;
};

const getOrderTotal = (order) => {
  return formatCurrency(getOrderPaymentSummary(order).total);
};

const getOrderCustomerLabel = (order) => {
  if (order?.customer) return order.customer;
  if (isWalkInOrder(order)) {
    return 'Walk-in POS';
  }

  return order?.customer || 'Customer Order';
};

const getOrderMeta = (order) => `${getOrderCustomerLabel(order)} - ${formatDateTime(order?.createdAt || order?.date)}`;

const getDeliveryLabel = (order) => (
  String(order?.deliveryMethod || '').toLowerCase() === 'delivery' ? 'Delivery' : 'Pickup'
);

const getPaymentLabel = (order) => {
  const paymentMethod = String(order?.paymentMethod || '').toLowerCase();

  if (paymentMethod === 'online') {
    return 'Online';
  }

  if (paymentMethod === 'gcash') {
    return 'GCash';
  }

  if (paymentMethod === 'maya') return 'Maya';
  if (paymentMethod === 'cod') return 'Cash on Delivery';

  return 'Cash';
};

const getSourceLabel = (order) => {
  if (isWalkInOrder(order)) {
    return 'Walk-in';
  }

  if (String(order?.paymentMethod || '').toLowerCase() === 'online') {
    return 'Online';
  }

  return 'Customer Order';
};

const getDistanceLabel = (order) => {
  const distance = Number(order?.deliveryDistanceKm);

  if (String(order?.deliveryMethod || '').toLowerCase() !== 'delivery' || !Number.isFinite(distance)) {
    return 'N/A';
  }

  return `${distance.toFixed(1)} km`;
};

const formatMeters = (value) => {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters <= 0) {
    return 'N/A';
  }

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(meters)} m`;
};

const buildOpenStreetMapEmbedUrl = (pickup = {}) => {
  const rawLatitude = String(pickup.latitude ?? '').trim();
  const rawLongitude = String(pickup.longitude ?? '').trim();

  if (!rawLatitude || !rawLongitude) {
    return '';
  }

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return '';
  }

  const delta = 0.004;
  const bbox = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta,
  ].map((value) => value.toFixed(6)).join(',');

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
};

const getLalamoveTracking = (order) => order?.lalamoveTracking || order?.lalamove || {};

const canCancelLalamove = (order) => {
  const tracking = getLalamoveTracking(order);
  return Boolean(tracking.booked && tracking.orderId)
    && ['ASSIGNING_DRIVER', 'ON_GOING', 'ONGOING'].includes(tracking.status);
};

const getOrderDeliveryAddress = (order = {}) => order.deliveryAddress || {};

const createLalamoveDraftFromOrder = (order = {}) => {
  const deliveryAddress = getOrderDeliveryAddress(order);
  const streetAddress = deliveryAddress.streetAddress || order.deliveryStreetAddress || '';
  const barangay = deliveryAddress.barangay || order.deliveryBarangay || '';
  const city = deliveryAddress.city || order.deliveryCity || '';
  const province = deliveryAddress.province || order.deliveryProvince || '';
  const postalCode = deliveryAddress.postalCode || order.deliveryPostalCode || '';
  const formattedAddress = deliveryAddress.formattedAddress || order.deliveryFormattedAddress || order.address || '';
  const address = formattedAddress || buildDeliveryAddressText({
    streetAddress,
    barangay,
    city,
    province,
    postalCode,
  });
  const savedLatitude = formatCoordinate(deliveryAddress.latitude ?? order.deliveryLatitude);
  const savedLongitude = formatCoordinate(deliveryAddress.longitude ?? order.deliveryLongitude);
  const savedPinIsValid = isValidLocation({
    destinationLatitude: savedLatitude,
    destinationLongitude: savedLongitude,
  });

  return {
    recipientName: deliveryAddress.recipientName || order.deliveryRecipientName || order.customer || '',
    contactNumber: deliveryAddress.contactNumber || order.deliveryContactNumber || order.phoneNumber || '',
    streetAddress,
    barangay,
    city,
    province,
    postalCode,
    address,
    formattedAddress,
    placeId: deliveryAddress.placeId || order.deliveryPlaceId || '',
    destinationLatitude: savedPinIsValid ? savedLatitude : '',
    destinationLongitude: savedPinIsValid ? savedLongitude : '',
    instructions: order.deliveryInstructions || '',
  };
};

const isOnlinePaymentSettled = (order) => (
  ['paid', 'fulfilled'].includes(String(
    order?.paymentCheckoutStatus || order?.paymentCheckout?.status || '',
  ).toLowerCase())
);

const isLalamoveDeliveryOrder = (order) => {
  const paymentMethod = String(order?.paymentMethod || '').toLowerCase();
  return String(order?.deliveryMethod || '').toLowerCase() === 'delivery'
    && (paymentMethod === 'cash' || paymentMethod === 'online');
};

const canBookLalamove = (order) => (
  isLalamoveDeliveryOrder(order)
  && (String(order?.paymentMethod || '').toLowerCase() !== 'online' || isOnlinePaymentSettled(order))
  && !getLalamoveTracking(order).booked
  && !['BOOKING', 'BOOKING_UNCONFIRMED'].includes(getLalamoveTracking(order).status)
  && !['pending', 'delivered', 'completed', 'cancelled', 'refunded'].includes(normalizeOrderStatus(order?.status))
);

const getCardSummary = (order) => {
  if (isWalkInOrder(order)) {
    return 'Walk-in';
  }

  if (String(order?.paymentMethod || '').toLowerCase() === 'online') {
    return 'Online';
  }

  if (String(order?.deliveryMethod || '').toLowerCase() === 'delivery') {
    return 'Delivery';
  }

  return 'Pickup';
};

const getDisplayStatusLabel = (order) => (
  normalizeReviewStatus(order?.reviewStatus) === 'under_review'
    ? 'Under Review'
    : getOrderStatusLabel(order?.status, 'admin')
);

const getStatusClass = (order) => normalizeReviewStatus(order?.reviewStatus) === 'under_review'
  ? 'status-under_review' : `status-${normalizeOrderStatus(order?.status)}`;

const getStatusDescription = (order) => {
  if (normalizeReviewStatus(order?.reviewStatus) === 'under_review') return 'This order has a customer report awaiting review.';
  return ({
    pending: 'This order is waiting for confirmation.',
    confirmed: 'Your order is confirmed and ready for preparation.',
    preparing: 'The team is preparing this order.',
    ready: getDeliveryLabel(order) === 'Delivery' ? 'This order is ready for delivery.' : 'This order is ready for collection.',
    'out-for-delivery': 'This order is on its way to the customer.',
    delivered: 'The order has been handed over. Awaiting customer confirmation.',
    completed: 'This order has been completed.',
    cancelled: 'This order has been cancelled.',
    refunded: 'This order has been returned or refunded.',
  })[normalizeOrderStatus(order?.status)] || 'View the order workflow for updates.';
};

const getVisibleWorkflowSteps = (order) => {
  const steps = buildOrderWorkflowProgress(order?.status);
  if (isWalkInOrder(order)) {
    return steps.filter((step) => ['preparing', 'ready', 'completed'].includes(step.status));
  }

  const deliveryMethod = String(order?.deliveryMethod || '').toLowerCase();

  return deliveryMethod === 'delivery'
    ? steps
    : steps.filter((step) => step.status !== 'out-for-delivery');
};

const getNextActionStatus = (order) => {
  const currentStatus = normalizeOrderStatus(order?.status);
  const deliveryMethod = String(order?.deliveryMethod || '').toLowerCase();

  if (normalizeReviewStatus(order?.reviewStatus) === 'under_review') {
    return '';
  }

  if (isWalkInOrder(order)) {
    if (currentStatus === 'confirmed') {
      return 'preparing';
    }

    if (currentStatus === 'preparing') {
      return 'ready';
    }

    if (currentStatus === 'ready') {
      return 'completed';
    }

    return '';
  }

  if (currentStatus === 'pending') {
    return 'confirmed';
  }

  if (currentStatus === 'confirmed') {
    return 'preparing';
  }

  if (currentStatus === 'preparing') {
    return 'ready';
  }

  if (currentStatus === 'ready') {
    return deliveryMethod === 'delivery' ? 'out-for-delivery' : 'delivered';
  }

  if (currentStatus === 'out-for-delivery') {
    return 'delivered';
  }

  return '';
};

const DetailBox = ({ label, value, className = '' }) => (
  <div className={cx('admin-orders-info-box', className)}>
    <span className="admin-orders-info-label">{label}</span>
    <strong className="admin-orders-info-value">{value}</strong>
  </div>
);

const WorkflowRow = ({ steps, nextActionStatus = '', updatingStatus = '', onStatusClick }) => (
  <div
    className="admin-orders-progress-row"
    style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
  >
    {steps.map((step) => {
      const canClick = step.status === nextActionStatus && !updatingStatus;
      const isLoading = updatingStatus === step.status;

      return (
      <button
        key={step.status}
        type="button"
        className={cx(
          'admin-orders-progress-step',
          step.isComplete && 'is-complete',
          step.isCurrent && 'is-current',
          canClick && 'is-clickable',
        )}
        disabled={!canClick}
        onClick={() => onStatusClick(step.status)}
      >
        <span
          className="admin-orders-progress-dot"
          style={{ backgroundColor: step.isComplete || step.isCurrent || canClick ? '#f97316' : '#d1d5db' }}
        />
        <span className="admin-orders-progress-label">
          {isLoading ? 'Updating...' : step.label}
        </span>
      </button>
      );
    })}
  </div>
);

const AdminOrders = () => {
  const {
    orders,
    isOrdersLoading,
    updateOrderStatus,
    bookLalamoveDelivery,
    syncLalamoveDelivery,
    cancelLalamoveDelivery,
    saveLalamoveReference,
    getLalamoveStatus,
    refreshOrders,
    reviewOrderIssue,
    updateReturnRefundRequest,
  } = useOrders();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [pageError, setPageError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState('');
  const [lalamoveAction, setLalamoveAction] = useState('');
  const [lalamoveFeedback, setLalamoveFeedback] = useState(null);
  const [lalamoveCancellation, setLalamoveCancellation] = useState(null);
  const [lalamoveAddressStatus, setLalamoveAddressStatus] = useState('');
  const [lalamoveDraft, setLalamoveDraft] = useState(() => createLalamoveDraftFromOrder());
  const [lalamoveReferenceDraft, setLalamoveReferenceDraft] = useState('');
  const [lalamoveStatus, setLalamoveStatus] = useState(null);
  const [updatingIssueReview, setUpdatingIssueReview] = useState('');
  const [updatingReturnRefundStatus, setUpdatingReturnRefundStatus] = useState('');
  const [rejectionModal, setRejectionModal] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');
  const lalamoveActionInFlightRef = useRef(false);
  const detailsScrollRef = useRef(null);
  const lalamoveDraftStateRef = useRef({ orderId: '', dirty: false });

  useEffect(() => {
    let isActive = true;

    const loadLalamoveStatus = async () => {
      if (!getLalamoveStatus) {
        return;
      }

      try {
        const status = await getLalamoveStatus();
        if (isActive) {
          setLalamoveStatus(status || null);
        }
      } catch {
        if (isActive) {
          setLalamoveStatus(null);
        }
      }
    };

    loadLalamoveStatus();

    return () => {
      isActive = false;
    };
  }, [getLalamoveStatus]);

  const filteredOrders = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const filterValue = normalizeFilterValue(selectedFilter);

    return [...orders]
      .filter((order) => {
        const reviewStatus = normalizeReviewStatus(order?.reviewStatus);
        const lineItemNames = getLineItems(order).map((item) => item?.name || '').join(' ').toLowerCase();
        const searchMatches = !search
          || getDisplayId(order).toLowerCase().includes(search)
          || getOrderCustomerLabel(order).toLowerCase().includes(search)
          || String(order?.customer || '').toLowerCase().includes(search)
          || String(order?.items || '').toLowerCase().includes(search)
          || lineItemNames.includes(search);
        const statusMatches = filterValue === 'all'
          || normalizeOrderStatus(order?.status) === filterValue
          || (filterValue === 'under_review' && reviewStatus === 'under_review');

        return searchMatches && statusMatches;
      })
      .sort((left, right) => {
        const leftPriority = STATUS_PRIORITY[String(left?.status || '').toLowerCase()] ?? 99;
        const rightPriority = STATUS_PRIORITY[String(right?.status || '').toLowerCase()] ?? 99;

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return new Date(right?.createdAt || right?.date || 0).getTime()
          - new Date(left?.createdAt || left?.date || 0).getTime();
      });
  }, [orders, searchTerm, selectedFilter]);

  const refundRequestOrders = useMemo(() => (
    orders
      .map((order) => ({ order, request: getRefundQueueRequest(order) }))
      .filter(({ request }) => Boolean(request))
      .sort((left, right) => new Date(right.request.submittedAt || right.request.updatedAt || 0).getTime()
        - new Date(left.request.submittedAt || left.request.updatedAt || 0).getTime())
  ), [orders]);

  const pendingReturnRefundCount = refundRequestOrders.filter(({ request }) => request.status === 'pending').length;

  useEffect(() => {
    const requestedOrderId = searchParams.get('request');
    if (!requestedOrderId || !orders.some((order) => order.id === requestedOrderId)) {
      return;
    }

    setSelectedFilter('all');
    setSelectedOrderId(requestedOrderId);
  }, [orders, searchParams]);

  useEffect(() => {
    if (filteredOrders.length === 0) {
      if (selectedOrderId) {
        setSelectedOrderId('');
      }
      return;
    }

    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0].id);
    }
  }, [filteredOrders, selectedOrderId]);

  const selectedOrder = useMemo(
    () => filteredOrders.find((order) => order.id === selectedOrderId) || filteredOrders[0] || null,
    [filteredOrders, selectedOrderId],
  );

  const workflowSteps = selectedOrder ? getVisibleWorkflowSteps(selectedOrder) : [];
  const topRowSteps = workflowSteps.slice(0, 4);
  const bottomRowSteps = workflowSteps.slice(4);
  const nextActionStatus = selectedOrder ? getNextActionStatus(selectedOrder) : '';
  const selectedLalamoveTracking = selectedOrder ? getLalamoveTracking(selectedOrder) : {};
  const selectedOrderIdForDraft = selectedOrder?.id || '';
  useEffect(() => {
    detailsScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedOrderIdForDraft]);
  const selectedLalamoveFeedback = lalamoveFeedback?.orderId === selectedOrderIdForDraft
    ? lalamoveFeedback
    : null;
  const isLalamoveCancellationVisible = lalamoveCancellation?.orderId === selectedOrderIdForDraft
    && lalamoveCancellation?.bookingId === selectedLalamoveTracking.orderId
    && canCancelLalamove(selectedOrder);
  const isLalamoveCancelled = ['CANCELED', 'CANCELLED'].includes(selectedLalamoveTracking.status);
  const selectedIssueReport = selectedOrder?.latestIssueReport
    || (Array.isArray(selectedOrder?.issueReports) ? selectedOrder.issueReports[0] : null)
    || null;
  const selectedReturnRefundRequest = getReturnRefundRequest(selectedOrder);
  const lalamovePickup = lalamoveStatus?.pickup || {};
  const isLalamoveReady = Boolean(lalamoveStatus?.configured) && isValidLocation(lalamovePickup);
  const selectedLalamoveShareLink = getLalamoveLaunchUrl({}, selectedLalamoveTracking);
  const lalamovePickupMapEmbedUrl = buildOpenStreetMapEmbedUrl(lalamovePickup);

  useEffect(() => {
    setLalamoveFeedback(null);
  }, [selectedOrderIdForDraft]);

  useEffect(() => {
    setLalamoveCancellation(null);
  }, [selectedOrderIdForDraft, selectedLalamoveTracking.orderId]);

  useEffect(() => {
    if (!selectedOrderIdForDraft) {
      return;
    }

    setLalamoveReferenceDraft(selectedLalamoveTracking.orderId || '');
    // Background refreshes must not discard a pin that staff are correcting.
    if (lalamoveDraftStateRef.current.orderId === selectedOrderIdForDraft && lalamoveDraftStateRef.current.dirty) return;
    const draft = createLalamoveDraftFromOrder(selectedOrder);
    lalamoveDraftStateRef.current = { orderId: selectedOrderIdForDraft, dirty: false };
    setLalamoveDraft(draft);
    setLalamoveAddressStatus(isValidLocation(draft)
      ? 'The saved customer address and map pin will be sent to Lalamove.'
      : 'This order needs a delivery pin. Select the customer’s exact destination on the map below.');
  }, [selectedOrder, selectedOrderIdForDraft, selectedLalamoveTracking.orderId]);

  const handleStatusClick = async (nextStatus) => {
    if (!selectedOrder || updatingStatus) {
      return;
    }

    setPageNotice('');
    setPageError('');
    setUpdatingStatus(nextStatus);

    try {
      const updatedOrder = await updateOrderStatus(selectedOrder.id, nextStatus);
      setPageNotice(`Order ${getDisplayId(updatedOrder || selectedOrder)} moved to ${getOrderStatusLabel(nextStatus, 'admin')}.`);
    } catch (error) {
      setPageError(error.message || 'Unable to update the order status right now.');
    } finally {
      setUpdatingStatus('');
    }
  };

  const handleReturnRefundStatus = async (request, nextStatus) => {
    if (!request || updatingReturnRefundStatus) {
      return;
    }

    if (nextStatus === 'rejected') {
      setRejectionModal({ type: 'return-refund', request });
      setRejectionReason('');
      setRejectionError('');
      return;
    }

    setPageNotice('');
    setPageError('');
    setUpdatingReturnRefundStatus(nextStatus);

    try {
      await updateReturnRefundRequest(request.id, nextStatus);
      setPageNotice(`Request moved to ${getReturnRefundStatusLabel(nextStatus)}.`);
    } catch (error) {
      setPageError(error.message || 'Unable to update the return/refund request right now.');
    } finally {
      setUpdatingReturnRefundStatus('');
    }
  };

  const handleIssueReview = async (report, decision) => {
    if (!report || updatingIssueReview) {
      return;
    }

    if (decision === 'reject') {
      setRejectionModal({ type: 'issue-report', report });
      setRejectionReason('');
      setRejectionError('');
      return;
    }

    setPageNotice('');
    setPageError('');
    setUpdatingIssueReview(decision);

    try {
      await reviewOrderIssue(report.id, decision);
      setPageNotice(decision === 'approve'
        ? 'Return request confirmed. The customer has been notified.'
        : 'Return request rejected. The customer has been notified.');
    } catch (error) {
      setPageError(error.message || 'Unable to update the return request right now.');
    } finally {
      setUpdatingIssueReview('');
    }
  };

  const closeRejectionModal = () => {
    if (updatingIssueReview || updatingReturnRefundStatus) {
      return;
    }

    setRejectionModal(null);
    setRejectionReason('');
    setRejectionError('');
  };

  const handleConfirmRejection = async () => {
    const reason = rejectionReason.trim();
    if (!reason) {
      setRejectionError('Please provide a reason for rejection.');
      return;
    }

    if (!rejectionModal) {
      return;
    }

    setPageNotice('');
    setPageError('');
    setRejectionError('');

    try {
      if (rejectionModal.type === 'return-refund') {
        setUpdatingReturnRefundStatus('rejected');
        await updateReturnRefundRequest(rejectionModal.request.id, 'rejected', reason);
      } else {
        setUpdatingIssueReview('reject');
        await reviewOrderIssue(rejectionModal.report.id, 'reject', reason);
      }

      setPageNotice('Return/refund request rejected. The customer has been notified.');
      setRejectionModal(null);
      setRejectionReason('');
    } catch (error) {
      setRejectionError(error.message || 'Unable to reject the return/refund request right now.');
    } finally {
      setUpdatingReturnRefundStatus('');
      setUpdatingIssueReview('');
    }
  };

  const isRejectingRequest = Boolean(rejectionModal) && (
    updatingReturnRefundStatus === 'rejected' || updatingIssueReview === 'reject'
  );

  const handleLalamoveDraftChange = (event) => {
    const { name, value } = event.target;
    lalamoveDraftStateRef.current.dirty = true;
    setLalamoveDraft((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleLalamovePinChange = ({ latitude, longitude }) => {
    lalamoveDraftStateRef.current.dirty = true;
    setLalamoveDraft((current) => ({
      ...current,
      destinationLatitude: latitude,
      destinationLongitude: longitude,
      placeId: '',
    }));
    setLalamoveFeedback(null);
    setLalamoveAddressStatus(isValidLocation({ latitude, longitude })
      ? 'Delivery pin selected. This location will be saved to the order when you book.'
      : ADDRESS_PIN_ERROR);
  };

  const handleBookLalamove = async () => {
    if (!selectedOrder || !canBookLalamove(selectedOrder) || lalamoveAction || lalamoveActionInFlightRef.current) {
      return;
    }

    if (!isLalamoveReady) {
      const message = 'Error 503: Delivery booking is temporarily unavailable. Please check the store pickup details and try again later.';
      setPageNotice('');
      setPageError(message);
      setLalamoveFeedback({ orderId: selectedOrder.id, type: 'error', message });
      return;
    }

    if (!lalamoveDraft.recipientName.trim() || !lalamoveDraft.contactNumber.trim()) {
      const message = 'Recipient name and contact number are required before booking Lalamove.';
      setPageNotice('');
      setPageError(message);
      setLalamoveFeedback({ orderId: selectedOrder.id, type: 'error', message });
      return;
    }

    if (!lalamoveDraft.address.trim() && !lalamoveDraft.formattedAddress.trim()) {
      const message = 'A delivery address is required before booking Lalamove.';
      setPageNotice('');
      setPageError(message);
      setLalamoveFeedback({ orderId: selectedOrder.id, type: 'error', message });
      return;
    }

    if (!isValidLocation(lalamoveDraft)) {
      setPageNotice('');
      setPageError(ADDRESS_PIN_ERROR);
      setLalamoveFeedback({ orderId: selectedOrder.id, type: 'error', message: ADDRESS_PIN_ERROR });
      return;
    }

    setPageNotice('');
    setPageError('');
    setLalamoveAction('book');
    setLalamoveFeedback(null);
    lalamoveActionInFlightRef.current = true;
    const bookingWindow = reserveLalamoveWindow();
    let bookingRequestStarted = false;

    try {
      setLalamoveAddressStatus('Sending the pickup and delivery pins to Lalamove...');
      bookingRequestStarted = true;
      const { order: updatedOrder, lalamoveLaunch } = await bookLalamoveDelivery(selectedOrder.id, lalamoveDraft);
      const shareLink = getLalamoveLaunchUrl(lalamoveLaunch, getLalamoveTracking(updatedOrder));
      const didOpenTracking = openLalamoveBooking(bookingWindow, shareLink);
      const openNote = didOpenTracking
        ? 'The delivery tracking page opened.'
        : (shareLink
          ? 'Use Open Tracking to view the delivery.'
          : 'Your booking is saved. Use Refresh Tracking to check delivery updates.');

      const message = `Lalamove booked for ${getDisplayId(updatedOrder || selectedOrder)} with the saved customer details. ${openNote}`;
      setPageNotice(message);
      setLalamoveFeedback({ orderId: selectedOrder.id, type: 'success', message });
      setLalamoveAddressStatus('Saved customer address sent to Lalamove.');
    } catch (error) {
      closeLalamoveWindow(bookingWindow);
      const message = error.message || 'Unable to book Lalamove right now.';
      const needsBookingCheck = bookingRequestStarted
        && (!error.status || error.status >= 500)
        && !/partner portal/i.test(message);
      const errorMessage = `${message}${needsBookingCheck ? ' Check Lalamove Partner Portal before trying again.' : ''}`;
      setPageError(errorMessage);
      setLalamoveFeedback({ orderId: selectedOrder.id, type: 'error', message: errorMessage });
      setLalamoveAddressStatus('');
      if (bookingRequestStarted) {
        // Fetch the durable booking status before allowing another attempt.
        await refreshOrders().catch(() => {});
      }
    } finally {
      lalamoveActionInFlightRef.current = false;
      setLalamoveAction('');
    }
  };

  const handleSyncLalamove = async () => {
    if (!selectedOrder || lalamoveAction || lalamoveActionInFlightRef.current) {
      return;
    }

    setPageNotice('');
    setPageError('');
    setLalamoveAction('sync');
    lalamoveActionInFlightRef.current = true;

    try {
      const updatedOrder = await syncLalamoveDelivery(selectedOrder.id);
      setPageNotice(`Lalamove tracking refreshed for ${getDisplayId(updatedOrder || selectedOrder)}.`);
    } catch (error) {
      setPageError(error.message || 'Unable to refresh Lalamove tracking right now.');
    } finally {
      lalamoveActionInFlightRef.current = false;
      setLalamoveAction('');
    }
  };

  const handleRequestLalamoveCancellation = () => {
    if (!canCancelLalamove(selectedOrder) || lalamoveAction || lalamoveActionInFlightRef.current) return;

    setLalamoveFeedback(null);
    setLalamoveCancellation({
      orderId: selectedOrder.id,
      bookingId: selectedLalamoveTracking.orderId,
    });
  };

  const handleCancelLalamove = async () => {
    if (!isLalamoveCancellationVisible || lalamoveAction || lalamoveActionInFlightRef.current) return;

    const orderToCancel = selectedOrder;
    lalamoveActionInFlightRef.current = true;
    setLalamoveAction('cancel');
    setPageNotice('');
    setPageError('');
    setLalamoveFeedback(null);

    try {
      const updatedOrder = await cancelLalamoveDelivery(orderToCancel.id);
      const message = `Lalamove booking cancelled for ${getDisplayId(updatedOrder || orderToCancel)}. The dessert order is unchanged.`;
      setPageNotice(message);
      setLalamoveFeedback({ orderId: orderToCancel.id, type: 'success', message });
    } catch (error) {
      const message = error.message || 'Unable to cancel this Lalamove booking. Refresh tracking to check its current status.';
      setPageError(message);
      setLalamoveFeedback({ orderId: orderToCancel.id, type: 'error', message });
      // Reconcile a cancellation that may have reached Lalamove before a network failure.
      await refreshOrders().catch(() => {});
    } finally {
      setLalamoveCancellation(null);
      lalamoveActionInFlightRef.current = false;
      setLalamoveAction('');
    }
  };

  const handleSaveLalamoveReference = async () => {
    if (!selectedOrder || lalamoveAction || lalamoveActionInFlightRef.current) {
      return;
    }

    const reference = lalamoveReferenceDraft.trim();
    if (!reference) {
      setPageNotice('');
      setPageError('Lalamove booking reference is required.');
      return;
    }

    setPageNotice('');
    setPageError('');
    setLalamoveAction('reference');
    lalamoveActionInFlightRef.current = true;

    try {
      const updatedOrder = await saveLalamoveReference(selectedOrder.id, {
        reference,
      });
      setPageNotice(`Lalamove reference saved for ${getDisplayId(updatedOrder || selectedOrder)}.`);
    } catch (error) {
      setPageError(error.message || 'Unable to save the Lalamove reference right now.');
    } finally {
      lalamoveActionInFlightRef.current = false;
      setLalamoveAction('');
    }
  };

  const showDeliveryBooking = () => {
    const bookingPanel = document.getElementById('order-delivery-booking');
    bookingPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    bookingPanel?.querySelector('input, button, a')?.focus({ preventScroll: true });
  };

  const handleSendReceipt = async () => {
    if (!selectedOrder) return;
    const payment = getOrderPaymentSummary(selectedOrder);
    const title = 'V&G Dessert receipt — ' + getDisplayId(selectedOrder);
    const text = [title, 'Customer: ' + (selectedOrder.customer || 'Customer'),
      'Date: ' + formatDateTime(selectedOrder.createdAt || selectedOrder.date),
      'Payment: ' + getPaymentLabel(selectedOrder),
      ...getLineItems(selectedOrder).map((item) => item.name + ' ×' + item.quantity + ' — ' + formatCurrency(getItemSubtotal(item))),
      'Subtotal: ' + formatCurrency(payment.subtotal), 'Discount: ' + formatCurrency(payment.discount),
      'Tax: ' + formatCurrency(payment.tax), 'Delivery Fee: ' + formatCurrency(payment.deliveryFee),
      'Total: ' + formatCurrency(payment.total),
    ].join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
      } else {
        const recipient = selectedOrder.customerEmail || selectedOrder.email || '';
        window.location.href = 'mailto:' + encodeURIComponent(recipient) + '?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(text);
      }
    } catch (error) {
      if (error.name !== 'AbortError') setPageError('Unable to share this receipt. Please use Print Receipt to save a copy.');
    }
  };

  return (
    <div className="admin-orders-page">
      <div className="admin-orders-workspace">
        <h1 className="admin-orders-page-title">Orders</h1>
        {(pageNotice || pageError) && (
          <div className="admin-orders-alert-stack" aria-live="polite">
            {pageNotice && (
              <div className="admin-orders-alert admin-orders-alert--success">
                {pageNotice}
              </div>
            )}
            {pageError && (
              <div className="admin-orders-alert admin-orders-alert--error">
                {pageError}
              </div>
            )}
          </div>
        )}

        <section className="admin-orders-search-panel">
          <div className="relative">
            <Search
              size={20}
              className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by order number, customer..."
              aria-label="Search by order number, customer, or items"
              className="admin-orders-search-input"
            />
          </div>

          <div className="admin-orders-filter-row">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                className={cx(
                  'admin-orders-filter-pill',
                  `filter-${filter}`,
                  normalizeFilterValue(selectedFilter) === filter && 'is-active',
                )}
                onClick={() => setSelectedFilter(filter)}
                aria-pressed={normalizeFilterValue(selectedFilter) === filter}
              >
                {getFilterLabel(filter)}
                <span className="admin-orders-filter-count">{getFilterCount(orders, filter)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="admin-orders-content-grid gap-6">
          <div className="admin-orders-list" role="region" aria-label="Order list" tabIndex={0}>
        {refundRequestOrders.length > 0 && (
          <section className="admin-orders-refund-queue" aria-labelledby="refund-request-queue-title">
            <div className="admin-orders-refund-queue-head">
              <div>
                <p className="admin-orders-kicker">Refund/Return Requests</p>
                <h2 id="refund-request-queue-title">Customer requests</h2>
              </div>
              <span className="admin-orders-refund-count">{pendingReturnRefundCount} pending</span>
            </div>

            <div className="admin-orders-refund-list">
              {refundRequestOrders.map(({ order, request }) => (
                <button
                  key={request.id}
                  type="button"
                  className="admin-orders-refund-row"
                  onClick={() => {
                    setSelectedFilter('all');
                    setSelectedOrderId(order.id);
                  }}
                >
                  <span>
                    <strong>{getDisplayId(order)}</strong>
                    <small>{order.customer || 'Customer'} - {request.type === 'return' ? 'Return' : 'Refund'} - {request.reason}</small>
                  </span>
                  <span className="admin-orders-refund-status">{getReturnRefundStatusLabel(request.status)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

            {isOrdersLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={`loading-order-${index}`} className="admin-orders-card">
                  <div className="h-3 w-16 rounded-full bg-slate-100" />
                  <div className="mt-3 h-7 w-52 rounded-lg bg-slate-100" />
                  <div className="mt-3 h-4 w-44 rounded-lg bg-slate-100" />
                  <div className="admin-orders-info-grid">
                    {Array.from({ length: 3 }).map((__, tileIndex) => (
                      <div key={`loading-tile-${tileIndex}`} className="admin-orders-info-box">
                        <div className="h-3 w-14 rounded bg-slate-100" />
                        <div className="mt-3 h-5 w-24 rounded bg-slate-100" />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : filteredOrders.length === 0 ? (
              <div className="admin-orders-card text-sm text-slate-500">
                No orders match the current search or filter.
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isSelected = selectedOrder?.id === order.id;
                const returnRefundRequest = getReturnRefundRequest(order);

                return (
                  <button
                    key={order.id}
                    type="button"
                    className={cx('admin-orders-card', isSelected && 'is-selected')}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <div className="flex items-start justify-between gap-4 admin-orders-card-header">
                      <div className="min-w-0">
                        <p className="admin-orders-kicker">Order</p>
                        <h2 className="admin-orders-id">{getDisplayId(order)}</h2>
                        <p className="admin-orders-meta">{getOrderMeta(order)}</p>
                      </div>

                      <span className={cx('admin-orders-status-badge', getStatusClass(order))}>
                        {getDisplayStatusLabel(order)}
                      </span>
                      {returnRefundRequest && (
                        <span className="admin-orders-refund-status">
                          {getReturnRefundStatusLabel(returnRefundRequest.status)}
                        </span>
                      )}
                    </div>

                    <div className="admin-orders-info-grid">
                      <DetailBox label="Total" value={getOrderTotal(order)} />
                      <DetailBox label="Method" value={getPaymentLabel(order)} />
                      <DetailBox label="Items" value={String(getItemCount(order))} />
                    </div>

                    {getLineItems(order).length > 0 && (
                      <div className="admin-orders-card-preview">
                        <OrderItemThumbnail item={getLineItems(order)[0]} />
                        <div className="admin-orders-preview-copy">
                          <strong>{getLineItems(order)[0]?.name || 'Order item'}</strong>
                          <small>{getLineItems(order)[0]?.variant || getLineItems(order)[0]?.variantName || getLineItems(order)[0]?.size || 'Regular'}</small>
                        </div>
                        <small>×{Math.max(1, Number(getLineItems(order)[0]?.quantity) || 0)}</small>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-4 text-sm admin-orders-card-footer">
                      <span className="admin-orders-card-summary"><Globe size={15} aria-hidden="true" />Order type <strong>{getCardSummary(order)}</strong></span>
                      <ChevronRight size={18} className="shrink-0 text-slate-400" />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <aside ref={detailsScrollRef} className="admin-orders-sidebar" aria-label="View Order Details" tabIndex={0}>
            <div className="admin-orders-detail-panel">
              {!selectedOrder ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Select an order to view its details.
                </div>
              ) : (
                <>
                  <header className="admin-orders-detail-header">
                    <span className="admin-orders-document-icon"><FileText size={28} aria-hidden="true" /></span>
                    <div className="admin-orders-detail-heading">
                      <h2>View Order Details</h2>
                      <p className="admin-orders-detail-id">Order ID: <strong>#{getDisplayId(selectedOrder).replace(/^#/, '')}</strong></p>
                    </div>
                    <div className="admin-orders-detail-meta">
                      <span className={cx('admin-orders-status-badge', getStatusClass(selectedOrder))}>{getDisplayStatusLabel(selectedOrder)}</span>
                      <span className="admin-orders-detail-date"><CalendarDays size={15} aria-hidden="true" />{formatDateTime(selectedOrder.createdAt || selectedOrder.date)}</span>
                    </div>
                  </header>

                  <div className="admin-orders-detail-columns">
                    <div className="admin-orders-detail-main">
                      <section className="admin-orders-section admin-orders-customer" aria-labelledby="customer-information-title">
                        <h2 id="customer-information-title" className="admin-orders-section-title"><UserRound size={23} aria-hidden="true" />Customer Information</h2>
                        <dl className="admin-orders-customer-fields">
                          <div><dt><UserRound size={15} aria-hidden="true" />Name</dt><dd>{selectedOrder.customer || 'Customer'}</dd></div>
                          <div><dt><Phone size={15} aria-hidden="true" />Contact</dt><dd>{selectedOrder.phoneNumber || selectedOrder.deliveryContactNumber || 'Not provided'}</dd></div>
                          <div><dt><Truck size={15} aria-hidden="true" />Delivery Type</dt><dd>{getDeliveryLabel(selectedOrder)}</dd></div>
                          <div><dt><CreditCard size={15} aria-hidden="true" />Payment Method</dt><dd>{getPaymentLabel(selectedOrder)}</dd></div>
                        </dl>
                      </section>
                      <OrderedItemsCard order={selectedOrder} />
                      <PaymentSummaryCard order={selectedOrder} />
                      <OrderQrCard key={selectedOrder.id} order={selectedOrder} />
                      <OrderFeedbackReceiptCard order={selectedOrder} />
                    </div>

                    <div className="admin-orders-detail-secondary">
                      <section className="admin-orders-section admin-orders-status-card" aria-labelledby="order-status-title">
                        <h2 id="order-status-title" className="admin-orders-section-title">
                          <span className={cx('admin-orders-status-icon', getStatusClass(selectedOrder))}>
                            {normalizeReviewStatus(selectedOrder.reviewStatus) === 'under_review' || normalizeOrderStatus(selectedOrder.status) === 'pending'
                              ? <Clock3 size={23} aria-hidden="true" />
                              : ['cancelled', 'refunded'].includes(normalizeOrderStatus(selectedOrder.status)) ? <XCircle size={23} aria-hidden="true" /> : <CheckCircle2 size={23} aria-hidden="true" />}
                          </span>Order Status
                        </h2>
                        <span className={cx('admin-orders-status-badge', getStatusClass(selectedOrder))}>{getDisplayStatusLabel(selectedOrder)}</span>
                        <p className="admin-orders-muted">{getStatusDescription(selectedOrder)}</p>
                        <details className="admin-orders-workflow-disclosure"><summary>Order progress</summary>
                  <div className="admin-orders-progress">
                    {topRowSteps.length > 0 && (
                      <WorkflowRow
                        steps={topRowSteps}
                        nextActionStatus={nextActionStatus}
                        updatingStatus={updatingStatus}
                        onStatusClick={handleStatusClick}
                      />
                    )}
                    {bottomRowSteps.length > 0 && (
                      <div className="admin-orders-progress-row-wrap">
                        <WorkflowRow
                          steps={bottomRowSteps}
                          nextActionStatus={nextActionStatus}
                          updatingStatus={updatingStatus}
                          onStatusClick={handleStatusClick}
                        />
                      </div>
                    )}
                    {nextActionStatus && (
                      <div className="admin-orders-next-action">
                        Click {getOrderStatusLabel(nextActionStatus, 'admin')} to move this order forward.
                      </div>
                    )}
                  </div>


                        </details>
                      </section>

                      <section className="admin-orders-section admin-orders-quick-actions" aria-labelledby="quick-actions-title">
                        <h2 id="quick-actions-title" className="admin-orders-section-title"><Zap size={22} aria-hidden="true" />Quick Actions</h2>
                        {nextActionStatus && (
                          <button type="button" className="admin-orders-action-button admin-orders-action-button--primary" onClick={() => handleStatusClick(nextActionStatus)} disabled={Boolean(updatingStatus)}>
                            {updatingStatus ? <Loader2 size={18} className="spin" /> : <CheckCircle2 size={18} aria-hidden="true" />}
                            {updatingStatus ? 'Updating...' : nextActionStatus === 'confirmed' ? 'Confirm Order' : nextActionStatus === 'preparing' ? 'Start Preparing' : 'Mark as ' + getOrderStatusLabel(nextActionStatus, 'admin')}
                          </button>
                        )}
                        <button type="button" className="admin-orders-action-button admin-orders-action-button--ghost" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />Print Receipt</button>
                        <button type="button" className="admin-orders-action-button admin-orders-action-button--ghost" onClick={handleSendReceipt}><Send size={18} aria-hidden="true" />Send Receipt</button>
                      </section>

                      {isLalamoveDeliveryOrder(selectedOrder) && (
                        <section className="admin-orders-section admin-orders-cod" aria-labelledby="cod-order-title">
                          <h2 id="cod-order-title" className="admin-orders-section-title"><CircleDollarSign size={24} aria-hidden="true" />{selectedOrder.paymentMethod === 'cash' ? 'COD Order' : 'Delivery'}</h2>
                          <p className="admin-orders-muted">{selectedOrder.paymentMethod === 'cash' ? 'This order is set to Cash on Delivery.' : 'This order uses Lalamove delivery.'}</p>
                          {canBookLalamove(selectedOrder) ? (
                            <button type="button" className="admin-orders-action-button admin-orders-action-button--primary" onClick={showDeliveryBooking}><CalendarDays size={17} aria-hidden="true" />Book Now</button>
                          ) : selectedLalamoveTracking.booked ? (
                            <button type="button" className="admin-orders-action-button admin-orders-action-button--ghost" onClick={showDeliveryBooking}><Truck size={17} aria-hidden="true" />View Delivery</button>
                          ) : <p className="admin-orders-muted">{normalizeOrderStatus(selectedOrder.status) === 'pending' ? 'Confirm this order before booking.' : 'Booking is unavailable for the current order state.'}</p>}
                        </section>
                      )}

                      <section className="admin-orders-section admin-orders-notes" aria-labelledby="order-notes-title">
                        <h2 id="order-notes-title" className="admin-orders-section-title"><StickyNote size={20} aria-hidden="true" />Notes</h2>
                        <p className="admin-orders-muted">{selectedOrder.notes || selectedOrder.specialInstructions || selectedOrder.deliveryInstructions || 'No special notes for this order.'}</p>
                      </section>
                      <details className="admin-orders-section admin-orders-fulfillment">
                        <summary><ClipboardList size={18} aria-hidden="true" />Fulfillment Details</summary>
                        <dl className="admin-orders-customer-fields">
                          <div><dt>Source</dt><dd>{getSourceLabel(selectedOrder)}</dd></div>
                          <div><dt>Distance</dt><dd>{getDistanceLabel(selectedOrder)}</dd></div>
                          <div><dt>Address</dt><dd>{selectedOrder.address || 'Not provided'}</dd></div>
                          <div><dt>Delivery App</dt><dd>{selectedLalamoveTracking.booked ? 'Lalamove' : 'Not booked'}</dd></div>
                        </dl>
                      </details>
                    </div>
                  </div>
                  <div className="admin-orders-detail-extras">
                  {selectedIssueReport && (
                    <section className="admin-orders-refund-detail" aria-labelledby="selected-issue-report-title">
                      <div className="admin-orders-refund-detail-head">
                        <div>
                          <p className="admin-orders-kicker">Damage Report</p>
                          <h2 id="selected-issue-report-title" className="admin-orders-items-title">
                            {selectedIssueReport.reviewStatus === 'under_review' ? 'Under Review' : getOrderStatusLabel(selectedIssueReport.reviewStatus, 'admin')}
                          </h2>
                        </div>
                        <span className="admin-orders-refund-status">
                          {selectedIssueReport.reviewStatus === 'under_review' ? 'Under Review' : getOrderStatusLabel(selectedIssueReport.reviewStatus, 'admin')}
                        </span>
                      </div>
                      <div className="admin-orders-refund-detail-grid">
                        <DetailBox label="Submitted" value={formatDateTime(selectedIssueReport.detectionDate || selectedIssueReport.createdAt)} />
                        <DetailBox label="Issue Type" value={String(selectedIssueReport.issueType || 'damage').replace(/_/g, ' ')} />
                        <DetailBox label="Customer" value={selectedIssueReport.customerName || selectedOrder.customer || 'Customer'} />
                        <DetailBox label="Contact" value={selectedOrder.phoneNumber || 'N/A'} />
                      </div>
                      <p><strong>Customer message:</strong> {selectedIssueReport.description || 'No description provided.'}</p>
                      {selectedIssueReport.evidenceImageUrl && (
                        <a
                          className="admin-orders-refund-evidence"
                          href={selectedIssueReport.evidenceImageUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span>Customer photo proof</span>
                          <img src={selectedIssueReport.evidenceImageUrl} alt="Customer damage report evidence" />
                        </a>
                      )}
                      {selectedIssueReport.reviewReason && (
                        <p className="admin-orders-refund-rejection"><strong>Review note:</strong> {selectedIssueReport.reviewReason}</p>
                      )}
                      {selectedIssueReport.reviewStatus === 'under_review' && (
                        <div className="admin-orders-refund-actions">
                          <button
                            type="button"
                            className="admin-orders-action-button admin-orders-action-button--primary"
                            onClick={() => void handleIssueReview(selectedIssueReport, 'approve')}
                            disabled={Boolean(updatingIssueReview)}
                          >
                            {updatingIssueReview === 'approve' ? <Loader2 size={16} className="spin" /> : null}
                            Confirm Return/Refund
                          </button>
                          <button
                            type="button"
                            className="admin-orders-action-button admin-orders-action-button--danger"
                            onClick={() => void handleIssueReview(selectedIssueReport, 'reject')}
                            disabled={Boolean(updatingIssueReview)}
                          >
                            {updatingIssueReview === 'reject' ? <Loader2 size={16} className="spin" /> : null}
                            Reject Return & Refund
                          </button>
                        </div>
                      )}
                    </section>
                  )}

                  {selectedReturnRefundRequest && (
                    <section className="admin-orders-refund-detail" aria-labelledby="selected-return-refund-title">
                      <div className="admin-orders-refund-detail-head">
                        <div>
                          <p className="admin-orders-kicker">{selectedReturnRefundRequest.type === 'return' ? 'Return' : 'Refund'} Request</p>
                          <h2 id="selected-return-refund-title" className="admin-orders-items-title">
                            {getReturnRefundStatusLabel(selectedReturnRefundRequest.status)}
                          </h2>
                        </div>
                        <span className="admin-orders-refund-status">
                          {getReturnRefundStatusLabel(selectedReturnRefundRequest.status)}
                        </span>
                      </div>
                      <div className="admin-orders-refund-detail-grid">
                        <DetailBox label="Submitted" value={formatDateTime(selectedReturnRefundRequest.submittedAt)} />
                        <DetailBox label="Customer" value={selectedOrder.customer || 'Customer'} />
                        <DetailBox label="Contact" value={selectedOrder.phoneNumber || 'N/A'} />
                        <DetailBox label="Payment" value={getPaymentLabel(selectedOrder)} />
                      </div>
                      <p><strong>Reason:</strong> {selectedReturnRefundRequest.reason}</p>
                      {selectedReturnRefundRequest.customerMessage && <p>{selectedReturnRefundRequest.customerMessage}</p>}
                      {selectedReturnRefundRequest.evidenceImageUrl && (
                        <a
                          className="admin-orders-refund-evidence"
                          href={selectedReturnRefundRequest.evidenceImageUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span>Customer photo proof</span>
                          <img src={selectedReturnRefundRequest.evidenceImageUrl} alt="Customer return or refund evidence" />
                        </a>
                      )}
                      {selectedReturnRefundRequest.rejectionReason && (
                        <p className="admin-orders-refund-rejection"><strong>Rejection reason:</strong> {selectedReturnRefundRequest.rejectionReason}</p>
                      )}
                      <div className="admin-orders-refund-history">
                        {(selectedReturnRefundRequest.history || []).map((entry, index) => (
                          <div key={`${entry.createdAt || entry.created_at || index}-${index}`}>
                            <strong>{getReturnRefundStatusLabel(entry.status)}</strong>
                            <span>{formatDateTime(entry.createdAt || entry.created_at)}</span>
                            {entry.note && <small>{entry.note}</small>}
                          </div>
                        ))}
                      </div>
                      {getNextReturnRefundStatuses(selectedReturnRefundRequest.status).length > 0 && (
                        <div className="admin-orders-refund-actions">
                          {getNextReturnRefundStatuses(selectedReturnRefundRequest.status).map((nextStatus) => (
                            <button
                              key={nextStatus}
                              type="button"
                              className={cx(
                                'admin-orders-action-button',
                                nextStatus === 'rejected'
                                  ? 'admin-orders-action-button--danger'
                                  : 'admin-orders-action-button--primary',
                              )}
                              onClick={() => void handleReturnRefundStatus(selectedReturnRefundRequest, nextStatus)}
                              disabled={Boolean(updatingReturnRefundStatus)}
                            >
                              {updatingReturnRefundStatus === nextStatus ? <Loader2 size={16} className="spin" /> : null}
                              {getReturnRefundActionLabel(nextStatus)}
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  )}


                  {isLalamoveDeliveryOrder(selectedOrder) && (
                    <div className="admin-orders-lalamove-panel" id="order-delivery-booking">
                      <div className="admin-orders-lalamove-header">
                        <div>
                          <p className="admin-orders-kicker">Lalamove</p>
                          <h2 className="admin-orders-items-title">Delivery Booking</h2>
                        </div>
                        <Truck size={20} />
                      </div>

                      {normalizeOrderStatus(selectedOrder.status) === 'pending' ? (
                        <div className="admin-orders-lalamove-note">
                          {String(selectedOrder.paymentMethod || '').toLowerCase() === 'online' && !isOnlinePaymentSettled(selectedOrder)
                            ? 'Complete the online payment before booking Lalamove.'
                            : 'Confirm this order before booking Lalamove.'}
                        </div>
                      ) : String(selectedOrder.paymentMethod || '').toLowerCase() === 'online' && !isOnlinePaymentSettled(selectedOrder) ? (
                        <div className="admin-orders-lalamove-note">
                          Online payment has not been confirmed yet. Lalamove booking will be available after payment succeeds.
                        </div>
                      ) : selectedLalamoveTracking.booked ? (
                        <>
                          <div className="admin-orders-lalamove-grid">
                            <DetailBox label="Booking ID" value={selectedLalamoveTracking.orderId || 'N/A'} />
                            <DetailBox label="Status" value={selectedLalamoveTracking.statusLabel || 'Not Booked'} />
                            <DetailBox label="Driver" value={selectedLalamoveTracking.driver?.name || 'Waiting'} />
                            <DetailBox label="Plate" value={selectedLalamoveTracking.driver?.plateNumber || 'N/A'} />
                            <DetailBox label="Driver Phone" value={selectedLalamoveTracking.driver?.phone || 'N/A'} />
                            <DetailBox label="ETA" value={formatDateTime(selectedLalamoveTracking.estimatedDeliveryAt)} />
                            <DetailBox label="Courier Distance" value={formatMeters(selectedLalamoveTracking.distanceMeters)} />
                            <DetailBox label="Last Sync" value={formatDateTime(selectedLalamoveTracking.lastSyncedAt)} />
                          </div>

                          <div className="admin-orders-lalamove-actions">
                            {selectedLalamoveShareLink && (
                              <a
                                className="admin-orders-action-button admin-orders-action-button--ghost"
                                href={lalamoveAction ? undefined : selectedLalamoveShareLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-disabled={Boolean(lalamoveAction)}
                                tabIndex={lalamoveAction ? -1 : undefined}
                                onClick={(event) => {
                                  if (lalamoveAction || lalamoveActionInFlightRef.current) event.preventDefault();
                                }}
                              >
                                <ExternalLink size={16} />
                                Open Tracking
                              </a>
                            )}
                            <button
                              type="button"
                              className="admin-orders-action-button admin-orders-action-button--primary"
                              onClick={handleSyncLalamove}
                              disabled={Boolean(lalamoveAction)}
                            >
                              {lalamoveAction === 'sync' ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                              {lalamoveAction === 'sync' ? 'Refreshing...' : 'Refresh Tracking'}
                            </button>
                            {canCancelLalamove(selectedOrder) && !isLalamoveCancellationVisible && (
                              <button
                                type="button"
                                className="admin-orders-action-button admin-orders-action-button--danger"
                                onClick={handleRequestLalamoveCancellation}
                                disabled={Boolean(lalamoveAction)}
                              >
                                Cancel Lalamove Booking
                              </button>
                            )}
                          </div>

                          {isLalamoveCancellationVisible && (
                            <div
                              className="admin-orders-lalamove-cancellation"
                              role="group"
                              aria-labelledby="lalamove-cancellation-title"
                              aria-describedby="lalamove-cancellation-description"
                            >
                              <strong id="lalamove-cancellation-title">
                                Cancel Lalamove booking {lalamoveCancellation.bookingId}?
                              </strong>
                              <p id="lalamove-cancellation-description">
                                Only the courier delivery will be cancelled. The dessert order will remain unchanged.
                              </p>
                              <div className="admin-orders-lalamove-actions">
                                <button
                                  type="button"
                                  className="admin-orders-action-button admin-orders-action-button--ghost"
                                  onClick={() => {
                                    if (!lalamoveActionInFlightRef.current) setLalamoveCancellation(null);
                                  }}
                                  disabled={Boolean(lalamoveAction)}
                                >
                                  Keep Booking
                                </button>
                                <button
                                  type="button"
                                  className="admin-orders-action-button admin-orders-action-button--danger"
                                  onClick={handleCancelLalamove}
                                  disabled={Boolean(lalamoveAction)}
                                >
                                  {lalamoveAction === 'cancel' && <Loader2 size={16} className="spin" />}
                                  {lalamoveAction === 'cancel' ? 'Cancelling...' : 'Confirm Cancellation'}
                                </button>
                              </div>
                            </div>
                          )}

                          {isLalamoveCancelled && (
                            <div className="admin-orders-lalamove-note" role="status">
                              This Lalamove courier delivery has been cancelled. The dessert order is unchanged.
                              The booking reference and tracking link are kept for your records.
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="admin-orders-address-section">
                            <div className="admin-orders-lalamove-header">
                              <div>
                                <p className="admin-orders-kicker">Store Pickup</p>
                                <h3 className="admin-orders-address-title">Registered Pickup Pin</h3>
                              </div>
                              <MapPin size={18} />
                            </div>

                            {!isLalamoveReady && (
                              <div className="admin-orders-lalamove-error">
                                Lalamove booking is unavailable. Check the Lalamove connection and the store pickup address, phone number, and map pin.
                              </div>
                            )}

                            <div className="admin-orders-lalamove-grid">
                              <DetailBox label="Store" value={lalamovePickup.name || 'V&G Dessert Shop'} />
                              <DetailBox label="Store Phone" value={lalamovePickup.phone || 'Not configured'} />
                              <DetailBox
                                label="Pickup Address"
                                value={lalamovePickup.address || 'Not configured'}
                                className="admin-orders-lalamove-address-box"
                              />
                            </div>

                            {lalamovePickupMapEmbedUrl && (
                              <div className="admin-orders-map-preview">
                                <iframe
                                  title="Store pickup OpenStreetMap pin"
                                  src={lalamovePickupMapEmbedUrl}
                                  loading="lazy"
                                  referrerPolicy="no-referrer-when-downgrade"
                                />
                              </div>
                            )}

                            {lalamovePickup.mapUrl && (
                              <a
                                className="admin-orders-action-button admin-orders-action-button--ghost"
                                href={lalamovePickup.mapUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink size={16} />
                                Open Pickup Pin in OpenStreetMap
                              </a>
                            )}
                          </div>

                          <div className="admin-orders-address-section">
                            <div>
                              <p className="admin-orders-kicker">Customer Delivery Address</p>
                              <h3 className="admin-orders-address-title">Recipient and Destination</h3>
                              <p className="admin-orders-lalamove-note">
                                The saved customer details and address are sent automatically when you book.
                              </p>
                            </div>

                            <div className="admin-orders-form-field admin-orders-form-field--wide">
                              <span>Saved customer address</span>
                              <div className="admin-orders-address-status" aria-live="polite">
                                {lalamoveDraft.formattedAddress || lalamoveDraft.address || 'No delivery address was saved with this order.'}
                              </div>
                            </div>

                            {lalamoveAddressStatus && (
                              <div className="admin-orders-address-status">
                                {lalamoveAddressStatus}
                              </div>
                            )}

                            <LocationPinPicker
                              key={selectedOrderIdForDraft}
                              label="Customer delivery pin"
                              latitude={lalamoveDraft.destinationLatitude}
                              longitude={lalamoveDraft.destinationLongitude}
                              initialCenter={lalamovePickup}
                              onChange={handleLalamovePinChange}
                              disabled={Boolean(lalamoveAction) || !canBookLalamove(selectedOrder)}
                            />

                            <div className="admin-orders-form-grid">
                              <label className="admin-orders-form-field">
                                <span>Recipient Name</span>
                                <input
                                  type="text"
                                  name="recipientName"
                                  value={lalamoveDraft.recipientName}
                                  readOnly
                                  placeholder="Juan Dela Cruz"
                                  required
                                />
                              </label>
                              <label className="admin-orders-form-field">
                                <span>Contact Number</span>
                                <input
                                  type="tel"
                                  name="contactNumber"
                                  value={lalamoveDraft.contactNumber}
                                  readOnly
                                  placeholder="09123456789"
                                  required
                                />
                              </label>
                              <label className="admin-orders-form-field admin-orders-form-field--wide">
                                <span>Street Address</span>
                                <input
                                  type="text"
                                  name="streetAddress"
                                  value={lalamoveDraft.streetAddress}
                                  readOnly
                                  placeholder="House number, unit, street"
                                  required
                                />
                              </label>
                              <label className="admin-orders-form-field">
                                <span>Barangay (Optional)</span>
                                <input
                                  type="text"
                                  name="barangay"
                                  value={lalamoveDraft.barangay}
                                  readOnly
                                  placeholder="Barangay"
                                />
                              </label>
                              <label className="admin-orders-form-field">
                                <span>City/Municipality</span>
                                <input
                                  type="text"
                                  name="city"
                                  value={lalamoveDraft.city}
                                  readOnly
                                  placeholder="City or municipality"
                                  required
                                />
                              </label>
                              <label className="admin-orders-form-field">
                                <span>Province</span>
                                <input
                                  type="text"
                                  name="province"
                                  value={lalamoveDraft.province}
                                  readOnly
                                  placeholder="Province"
                                  required
                                />
                              </label>
                              <label className="admin-orders-form-field">
                                <span>ZIP/Postal Code (Optional)</span>
                                <input
                                  type="text"
                                  name="postalCode"
                                  value={lalamoveDraft.postalCode}
                                  readOnly
                                  placeholder="Postal code"
                                />
                              </label>
                            </div>
                          </div>

                          <div className="admin-orders-form-grid">
                            <label className="admin-orders-form-field admin-orders-form-field--wide">
                              <span>Special Instructions</span>
                              <textarea
                                name="instructions"
                                value={lalamoveDraft.instructions}
                                onChange={handleLalamoveDraftChange}
                                placeholder="Landmark, gate code, handoff instructions"
                              />
                            </label>
                          </div>

                          {selectedLalamoveTracking.bookingError && (
                            <div className="admin-orders-lalamove-error">
                              {selectedLalamoveTracking.bookingError}
                            </div>
                          )}
                          {['BOOKING', 'BOOKING_UNCONFIRMED'].includes(selectedLalamoveTracking.status) && (
                            <div className="admin-orders-lalamove-note">
                              {selectedLalamoveTracking.status === 'BOOKING'
                                ? 'A booking request is already in progress. Check Lalamove Partner Portal before making another booking.'
                                : 'The booking result needs to be checked. Find the delivery in Lalamove Partner Portal, then save its booking reference below.'}
                            </div>
                          )}

                          <button
                            type="button"
                            className="admin-orders-action-button admin-orders-action-button--primary"
                            onClick={handleBookLalamove}
                            disabled={!canBookLalamove(selectedOrder) || Boolean(lalamoveAction) || !isLalamoveReady}
                          >
                            {lalamoveAction === 'book' ? <Loader2 size={16} className="spin" /> : <MapPin size={16} />}
                            {lalamoveAction === 'book' ? 'Booking...' : 'Book Now'}
                          </button>

                          {['BOOKING', 'BOOKING_UNCONFIRMED'].includes(selectedLalamoveTracking.status) && (
                            <div className="admin-orders-reference-row">
                              <label className="admin-orders-form-field">
                                <span>Lalamove Booking Reference</span>
                                <input
                                  type="text"
                                  value={lalamoveReferenceDraft}
                                  onChange={(event) => setLalamoveReferenceDraft(event.target.value)}
                                  placeholder="Paste confirmed booking ID"
                                />
                              </label>
                              <button
                                type="button"
                                className="admin-orders-action-button admin-orders-action-button--ghost"
                                onClick={handleSaveLalamoveReference}
                                disabled={Boolean(lalamoveAction)}
                              >
                                {lalamoveAction === 'reference' ? <Loader2 size={16} className="spin" /> : <ExternalLink size={16} />}
                                {lalamoveAction === 'reference' ? 'Saving...' : 'Save Reference'}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      {selectedLalamoveFeedback && (
                        <div
                          className={cx('admin-orders-alert', `admin-orders-alert--${selectedLalamoveFeedback.type}`)}
                          role={selectedLalamoveFeedback.type === 'error' ? 'alert' : 'status'}
                        >
                          {selectedLalamoveFeedback.message}
                        </div>
                      )}
                    </div>
                  )}


                  </div>
                </>
              )}
            </div>
          </aside>
        </section>

        {rejectionModal && (
          <div className="admin-orders-rejection-backdrop">
            <section
              className="admin-orders-rejection-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-return-refund-title"
              aria-describedby="reject-return-refund-message"
            >
              <div className="admin-orders-rejection-dialog-head">
                <h2 id="reject-return-refund-title">Reject Return &amp; Refund Request</h2>
              </div>
              <p id="reject-return-refund-message">
                Please provide a reason for rejecting this return/refund request.
              </p>
              <label className="admin-orders-rejection-field">
                <span>Rejection Reason</span>
                <textarea
                  value={rejectionReason}
                  onChange={(event) => {
                    setRejectionReason(event.target.value);
                    setRejectionError('');
                  }}
                  placeholder="Explain why this request cannot be approved."
                  aria-invalid={Boolean(rejectionError)}
                  aria-describedby={rejectionError ? 'reject-return-refund-error' : undefined}
                  autoFocus
                  maxLength={1000}
                  disabled={isRejectingRequest}
                />
              </label>
              {rejectionError && (
                <div id="reject-return-refund-error" className="admin-orders-rejection-error" role="alert">
                  {rejectionError}
                </div>
              )}
              <div className="admin-orders-rejection-actions">
                <button
                  type="button"
                  className="admin-orders-action-button admin-orders-action-button--ghost"
                  onClick={closeRejectionModal}
                  disabled={isRejectingRequest}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="admin-orders-action-button admin-orders-action-button--danger"
                  onClick={() => void handleConfirmRejection()}
                  disabled={isRejectingRequest}
                >
                  {isRejectingRequest ? <Loader2 size={16} className="spin" /> : null}
                  {isRejectingRequest ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminOrders;

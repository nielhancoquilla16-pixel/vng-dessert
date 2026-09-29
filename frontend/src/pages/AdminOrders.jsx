import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, ExternalLink, Loader2, MapPin, RefreshCw, Search, Truck } from 'lucide-react';
import { useOrders } from '../context/OrderContext';
import LocationPinPicker from '../components/LocationPinPicker';
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
  'out-for-delivery',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
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
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getFilterLabel = (value) => {
  if (value === 'all') {
    return 'All';
  }

  if (value === 'under_review') {
    return 'Under Review';
  }

  return getOrderStatusLabel(value, 'admin');
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
  if (typeof order?.total === 'string' && order.total.trim()) {
    return formatCurrency(order.total);
  }

  const totalFromLineItems = getLineItems(order).reduce(
    (sum, item) => sum + (Number(item?.lineTotal) || (Number(item?.price) || 0) * (Number(item?.quantity) || 0)),
    0,
  );

  return formatCurrency(totalFromLineItems || order?.totalAmount || 0);
};

const getOrderCustomerLabel = (order) => {
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
    return 'Walk-in order';
  }

  if (String(order?.deliveryMethod || '').toLowerCase() === 'delivery') {
    return 'Delivery order';
  }

  return 'Standard order';
};

const getDisplayStatusLabel = (order) => (
  normalizeReviewStatus(order?.reviewStatus) === 'under_review'
    ? 'Under Review'
    : getOrderStatusLabel(order?.status, 'admin')
);

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
          || String(order?.status || '').toLowerCase() === filterValue
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

  return (
    <div className="admin-orders-page max-w-[1400px] mx-auto px-6 py-6">
      <div className="space-y-6 text-slate-900">
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

        <section className="admin-orders-refund-queue" aria-labelledby="refund-request-queue-title">
          <div className="admin-orders-refund-queue-head">
            <div>
              <p className="admin-orders-kicker">Refund/Return Requests</p>
              <h2 id="refund-request-queue-title">Customer requests</h2>
            </div>
            <span className="admin-orders-refund-count">{pendingReturnRefundCount} pending</span>
          </div>

          {refundRequestOrders.length === 0 ? (
            <p className="admin-orders-refund-empty">No return or refund requests have been submitted.</p>
          ) : (
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
          )}
        </section>

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
              placeholder="Search order ID, source, or items"
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
                  normalizeFilterValue(selectedFilter) === filter && 'is-active',
                )}
                onClick={() => setSelectedFilter(filter)}
              >
                {getFilterLabel(filter)}
              </button>
            ))}
          </div>
        </section>

        <section className="admin-orders-content-grid gap-6">
          <div className="space-y-4 admin-orders-list">
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

                      <span className="admin-orders-status-badge">
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
                      <DetailBox label="Method" value={getDeliveryLabel(order)} />
                      <DetailBox label="Items" value={String(getItemCount(order))} />
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-4 text-sm admin-orders-card-footer">
                      <span className="admin-orders-card-summary">{getCardSummary(order)}</span>
                      <ChevronRight size={18} className="shrink-0 text-slate-400" />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <aside className="admin-orders-sidebar">
            <div className="space-y-4 admin-orders-detail-panel">
              {!selectedOrder ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Select an order to view its details.
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4 admin-orders-detail-header">
                    <div className="min-w-0">
                      <p className="admin-orders-detail-kicker">Selected order</p>
                      <h1 className="admin-orders-detail-id">{getDisplayId(selectedOrder)}</h1>
                      <p className="admin-orders-detail-meta">{getOrderMeta(selectedOrder)}</p>
                    </div>

                    <span className="admin-orders-status-badge">
                      {getDisplayStatusLabel(selectedOrder)}
                    </span>
                  </div>

                  <div className="admin-orders-detail-grid">
                    <DetailBox label="Delivery" value={getDeliveryLabel(selectedOrder)} />
                    <DetailBox label="Payment" value={getPaymentLabel(selectedOrder)} />
                    <DetailBox label="Source" value={getSourceLabel(selectedOrder)} />
                    <DetailBox label="Distance" value={getDistanceLabel(selectedOrder)} />
                    <DetailBox label="Customer" value={selectedOrder.customer || 'Customer'} />
                    <DetailBox label="Contact" value={selectedOrder.phoneNumber || 'N/A'} />
                    <DetailBox
                      label="Address"
                      value={selectedOrder.address || 'N/A'}
                      className="col-span-2"
                    />
                    <DetailBox label="Revenue" value={getOrderTotal(selectedOrder)} />
                    <DetailBox label="Delivery App" value={selectedLalamoveTracking.booked ? 'Lalamove' : 'Not booked'} />
                  </div>

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

                  {isLalamoveDeliveryOrder(selectedOrder) && (
                    <div className="admin-orders-lalamove-panel">
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

                  <div className="space-y-3 admin-orders-items-section">
                    <h2 className="admin-orders-items-title">Items</h2>

                    {getLineItems(selectedOrder).length === 0 ? (
                      <div className="flex items-center justify-between admin-orders-item-row">
                        <span className="text-sm text-slate-500">No items found.</span>
                      </div>
                    ) : (
                      getLineItems(selectedOrder).map((item) => {
                        const lineTotal = Number(item?.lineTotal) || (Number(item?.price) || 0) * (Number(item?.quantity) || 0);

                        return (
                          <div
                            key={`${selectedOrder.id}-${item?.id || item?.productId || item?.name}`}
                            className="flex items-center justify-between gap-4 admin-orders-item-row"
                          >
                            <div className="min-w-0">
                              <strong className="admin-orders-item-name">{item?.name || 'Unknown item'}</strong>
                              <span className="admin-orders-item-subtext">
                                {Math.max(1, Number(item?.quantity) || 0)} x {formatCurrency(item?.price)}
                              </span>
                            </div>

                            <strong className="admin-orders-item-price">
                              {formatCurrency(lineTotal)}
                            </strong>
                          </div>
                        );
                      })
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

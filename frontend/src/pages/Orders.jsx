import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  BellRing,
  Camera,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  History,
  Loader2,
  PackageCheck,
  QrCode,
  ReceiptText,
  Send,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Upload,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { apiRequest } from '../lib/api';
import { formatCurrency } from '../utils/currency';
import {
  buildOrderWorkflowProgress,
  canCustomerCancelOrder,
  canCustomerConfirmReceipt,
  canCustomerRequestReturnRefund,
  getReturnRefundStatusLabel,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  getReviewStatusLabel,
  isHistoryOrderStatus,
  isWalkInOrder,
  normalizeReviewStatus,
  hasCustomerConfirmationPending,
} from '../utils/orderWorkflow';
import { generateQrDataUrl } from '../utils/qrCode';
import { appUrl } from '../lib/appUrl';
import useDialogFocus from '../hooks/useDialogFocus';
import './Orders.css';

const ORDER_PRIORITY = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  'out-for-delivery': 4,
  delivered: 5,
};

const formatDateTime = (value) => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatMeters = (value) => {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters <= 0) {
    return 'Not available';
  }

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(meters)} m`;
};

const getLalamoveTracking = (order) => order?.lalamoveTracking || order?.lalamove || {};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Unable to read the selected image.'));
  reader.readAsDataURL(file);
});

const OrderVerificationPanel = ({ order }) => {
  const { session } = useAuth();
  const { refreshOrders } = useOrders();
  const [clock, setClock] = useState(Date.now());
  const [isRegeneratingQr, setIsRegeneratingQr] = useState(false);
  const [qrActionError, setQrActionError] = useState('');
  const [qrActionMessage, setQrActionMessage] = useState('');
  const hasQrPayload = Boolean(order?.verificationRequired && order?.qrPayload);
  const isAwaitingOnlinePayment = String(order?.paymentMethod || '').toLowerCase() === 'online'
    && String(order?.paymentCheckoutStatus || '').toLowerCase() === 'created'
    && Boolean(order?.paymentCheckout?.checkoutUrl);
  const orderQrPayload = order?.qrPayload || '';
  const orderQrUsedAt = order?.qrUsedAt || null;
  const orderQrExpiryTime = Date.parse(order?.qrExpiresAt || '');
  const orderQrExpired = hasQrPayload
    && (!Number.isFinite(orderQrExpiryTime) || orderQrExpiryTime <= clock);
  const isFinalOrder = ['delivered', 'completed', 'cancelled', 'refunded']
    .includes(String(order?.status || '').toLowerCase());
  const canRegenerateQr = hasQrPayload && (orderQrExpired || orderQrUsedAt) && !isFinalOrder;
  const qrImage = useMemo(() => (
    hasQrPayload && !orderQrUsedAt && !orderQrExpired
      ? generateQrDataUrl(orderQrPayload, 220)
      : ''
  ), [hasQrPayload, orderQrPayload, orderQrUsedAt, orderQrExpired]);

  useEffect(() => {
    if (!hasQrPayload) return undefined;
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [hasQrPayload, order?.qrExpiresAt]);

  const regenerateQr = async () => {
    if (!order?.id || isRegeneratingQr) return;
    setIsRegeneratingQr(true);
    setQrActionError('');
    setQrActionMessage('');
    try {
      await apiRequest('/api/orders/' + encodeURIComponent(order.id) + '/qr/regenerate', {
        method: 'POST',
      }, {
        auth: true,
        accessToken: session?.access_token,
      });
      await refreshOrders();
      setQrActionMessage('A new QR Code/Order ID is ready and will expire in six minutes.');
    } catch (error) {
      setQrActionError(error.message || 'Unable to generate a new QR Code/Order ID.');
    } finally {
      setIsRegeneratingQr(false);
    }
  };

  if (!order) {
    return null;
  }

  if (order.isCodOrder) {
    return (
      <div className="order-qr-panel">
        <div className="order-qr-header">
          <div>
            <p className="order-panel-kicker">Verification</p>
            <h3>COD Processing</h3>
          </div>
          <QrCode size={20} />
        </div>
      </div>
    );
  }

  if (!order.verificationRequired) {
    return null;
  }

  return (
    <div className="order-qr-panel">
      <div className="order-qr-header">
        <div>
          <p className="order-panel-kicker">Verification</p>
          <h3>Order QR and ID</h3>
        </div>
        <QrCode size={20} />
      </div>

      <div className="order-qr-body">
        {qrImage ? (
          <img
            src={qrImage}
            alt={`QR for order ${order.orderCode || order.id}`}
            className="order-qr-image"
          />
        ) : (
          <div className="order-qr-image" style={{ display: 'grid', placeItems: 'center', color: '#64748b', fontWeight: 700 }}>
            QR Unavailable
          </div>
        )}

        <div>
          <p className="order-qr-code-label">Order ID</p>
          <strong>{order.orderCode || order.orderId || order.id}</strong>
          <p className="order-qr-note">
            {orderQrExpired
              ? 'This QR Code/Order ID has expired. Please generate a new one.'
              : order.qrUsedAt
              ? 'This QR code has already been used and cannot be scanned again.'
              : isAwaitingOnlinePayment
                ? 'Your QR and Order ID are ready. Complete the online payment to continue processing this order.'
                : isWalkInOrder(order)
                  ? 'Show this QR code or Order ID to staff when your pickup order is ready.'
                  : 'Please present your QR code or Order ID when claiming your order. QR codes are valid for six minutes and one-time use only.'}
          </p>
          {!orderQrExpired && !orderQrUsedAt && Number.isFinite(orderQrExpiryTime) && (
            <p className="order-qr-note" aria-live="polite">
              Expires in {String(Math.floor(Math.max(0, orderQrExpiryTime - clock) / 60000)).padStart(2, '0')}:
              {String(Math.floor((Math.max(0, orderQrExpiryTime - clock) % 60000) / 1000)).padStart(2, '0')}
            </p>
          )}
          {qrActionError && <p className="order-qr-note" role="alert">{qrActionError}</p>}
          {qrActionMessage && <p className="order-qr-note" role="status">{qrActionMessage}</p>}
          {canRegenerateQr && (
            <div className="order-qr-actions">
              <button
                type="button"
                className="order-button order-button--primary"
                onClick={regenerateQr}
                disabled={isRegeneratingQr}
              >
                <RotateCcw size={16} />
                {isRegeneratingQr ? 'Generating…' : 'Generate a New QR / Order ID'}
              </button>
            </div>
          )}
          {isAwaitingOnlinePayment && (
            <div className="order-qr-actions">
              <a
                className="order-button order-button--primary"
                href={order.paymentCheckout.checkoutUrl}
                style={{ textDecoration: 'none' }}
              >
                Continue Online Payment
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const OrderFeedbackPanel = ({ order }) => {
  const status = String(order?.status || '').toLowerCase();
  const feedbackToken = String(order?.feedbackToken || '').trim();
  const feedbackUrl = feedbackToken ? appUrl(`/feedback/${feedbackToken}`) : '';
  const qrImage = useMemo(() => (
    feedbackUrl ? generateQrDataUrl(feedbackUrl, 220) : ''
  ), [feedbackUrl]);

  if (!['delivered', 'completed'].includes(status) || !feedbackToken) {
    return null;
  }

  return (
    <div className="order-qr-panel order-feedback-panel">
      <div className="order-qr-header">
        <div>
          <p className="order-panel-kicker">Feedback QR</p>
          <h3>Rate your experience</h3>
        </div>
        <QrCode size={20} />
      </div>

      <div className="order-qr-body">
        <img
          src={qrImage}
          alt={`Feedback QR for order ${order.orderCode || order.id}`}
          className="order-qr-image"
        />
        <div>
          <p className="order-qr-code-label">Order Feedback</p>
          <strong>{order.orderCode || order.displayId || order.id}</strong>
          <p className="order-qr-note">We value your feedback. Scan this QR code to rate your experience.</p>
          <div className="order-qr-actions">
            <a className="order-button order-button--primary" href={feedbackUrl}>
              Open Feedback Form
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

const Orders = () => {
  const location = useLocation();
  const { loggedInCustomer, isAuthLoading } = useAuth();
  const {
    orders,
    isOrdersLoading,
    confirmOrderReceipt,
    submitReturnRefundRequest,
    cancelOrder,
  } = useOrders();
  const [pageNotice, setPageNotice] = useState('');
  const [pageError, setPageError] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);
  const [receiptDrafts, setReceiptDrafts] = useState({});
  const [cancelDrafts, setCancelDrafts] = useState({});
  const [openCancelOrderId, setOpenCancelOrderId] = useState('');
  const [returnRefundDrafts, setReturnRefundDrafts] = useState({});
  const [openReturnRefundOrderId, setOpenReturnRefundOrderId] = useState('');
  const [confirmReturnRefundOrderId, setConfirmReturnRefundOrderId] = useState('');
  const confirmationDialogRef = useDialogFocus({
    isOpen: Boolean(confirmReturnRefundOrderId),
    onClose: () => setConfirmReturnRefundOrderId(''),
    closeDisabled: loadingAction?.type === 'return-refund',
  });
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const confirmOrderId = useMemo(() => (
    new URLSearchParams(location.search).get('confirm') || ''
  ), [location.search]);

  const activeOrders = useMemo(() => (
    [...orders]
      .filter((order) => !isHistoryOrderStatus(order.status))
      .sort((left, right) => {
        const leftPriority = ORDER_PRIORITY[left.status] ?? 99;
        const rightPriority = ORDER_PRIORITY[right.status] ?? 99;

        if ((left.reviewStatus === 'under_review') !== (right.reviewStatus === 'under_review')) {
          return left.reviewStatus === 'under_review' ? -1 : 1;
        }

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return new Date(right.createdAt || right.date || 0).getTime() - new Date(left.createdAt || left.date || 0).getTime();
      })
  ), [orders]);

  const historyOrders = useMemo(() => (
    [...orders]
      .filter((order) => isHistoryOrderStatus(order.status))
      .sort((left, right) => new Date(right.updatedAt || right.completedAt || right.cancelledAt || right.refundedAt || right.createdAt || 0).getTime()
        - new Date(left.updatedAt || left.completedAt || left.cancelledAt || left.refundedAt || left.createdAt || 0).getTime())
  ), [orders]);

  useEffect(() => {
    if (!confirmOrderId || isOrdersLoading) {
      return;
    }

    const targetElement = document.getElementById(`customer-order-${confirmOrderId}`);
    if (!targetElement) {
      return;
    }

    const timer = window.setTimeout(() => {
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [confirmOrderId, isOrdersLoading, orders]);

  const notifications = useMemo(() => (
    orders
      .filter((order) => hasCustomerConfirmationPending(order))
      .sort((left, right) => (
        new Date(right.deliveredAt || right.updatedAt || right.createdAt || 0).getTime()
        - new Date(left.deliveredAt || left.updatedAt || left.createdAt || 0).getTime()
      ))
      .map((order) => ({
        id: order.id,
        orderId: order.displayId || order.orderCode || order.id,
        createdAt: order.deliveredAt || order.updatedAt || order.createdAt || '',
        message: 'This delivered order is waiting for your confirmation.',
      }))
  ), [orders]);

  const summaryCards = useMemo(() => ([
    {
      label: 'Active Orders',
      value: activeOrders.length,
      icon: PackageCheck,
    },
    {
      label: 'History',
      value: historyOrders.length,
      icon: History,
    },
    {
      label: 'Under Review',
      value: orders.filter((order) => normalizeReviewStatus(order.reviewStatus) === 'under_review').length,
      icon: ShieldAlert,
    },
  ]), [activeOrders.length, historyOrders.length, orders]);

  if (!isAuthLoading && !loggedInCustomer) {
    return (
      <div className="orders-workflow-page">
        <section className="orders-alert-stack">
          <div className="orders-alert-card orders-alert-card--error">
            <CircleAlert size={18} />
            <div>You must be logged in as a customer to view your orders.</div>
          </div>
        </section>
      </div>
    );
  }

  const setReceiptDraft = (orderId, patch) => {
    setReceiptDrafts((current) => ({
      ...current,
      [orderId]: {
        ...(current[orderId] || {
          receiptImageDataUrl: '',
          receiptImageName: '',
          error: '',
        }),
        ...patch,
      },
    }));
  };

  const setCancelDraft = (orderId, patch) => {
    setCancelDrafts((current) => ({
      ...current,
      [orderId]: {
        ...(current[orderId] || {
          reason: '',
          error: '',
        }),
        ...patch,
      },
    }));
  };

  const setReturnRefundDraft = (orderId, patch) => {
    setReturnRefundDrafts((current) => ({
      ...current,
      [orderId]: {
        ...(current[orderId] || {
          type: 'refund',
          reason: 'Product quality concern',
          customerMessage: '',
          evidenceImageDataUrl: '',
          evidenceImageName: '',
          error: '',
        }),
        ...patch,
      },
    }));
  };

  const handleReceiptFileChange = async (orderId, event) => {
    const file = event.target.files?.[0];

    if (!file) {
      setReceiptDraft(orderId, {
        receiptImageDataUrl: '',
        receiptImageName: '',
        error: '',
      });
      return;
    }

    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      setReceiptDraft(orderId, {
        receiptImageDataUrl: imageDataUrl,
        receiptImageName: file.name,
        error: '',
      });
    } catch (error) {
      setReceiptDraft(orderId, {
        receiptImageDataUrl: '',
        receiptImageName: '',
        error: error.message || 'Unable to load that image.',
      });
    }
  };

  const handleConfirmReceipt = async (order) => {
    const draft = receiptDrafts[order.id] || {};

    if (!draft.receiptImageDataUrl) {
      setReceiptDraft(order.id, { error: 'Receipt proof image is required.' });
      return;
    }

    setLoadingAction({ type: 'receipt', orderId: order.id });
    setPageError('');

    try {
      await confirmOrderReceipt(order.id, draft.receiptImageDataUrl);
      setReceiptDrafts((current) => ({ ...current, [order.id]: undefined }));
      setPageNotice(`Order ${order.displayId || order.orderCode || order.id} is now completed.`);
    } catch (error) {
      setReceiptDraft(order.id, {
        error: error.message || 'Unable to confirm this order right now.',
      });
      setPageError(error.message || 'Unable to confirm this order right now.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancelOrder = async (order) => {
    const draft = cancelDrafts[order.id] || {};
    const cancellationReason = String(draft.reason || '').trim();

    setLoadingAction({ type: 'cancel', orderId: order.id });
    setPageError('');

    try {
      await cancelOrder(order.id, cancellationReason);
      setCancelDraft(order.id, {
        reason: '',
        error: '',
      });
      setOpenCancelOrderId('');
      setPageNotice(`Order ${order.displayId || order.orderCode || order.id} has been cancelled.`);
    } catch (error) {
      setCancelDraft(order.id, {
        error: error.message || 'Unable to cancel this order right now.',
      });
      setPageError(error.message || 'Unable to cancel this order right now.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReturnRefundFileChange = async (orderId, event) => {
    const file = event.target.files?.[0];

    if (!file) {
      setReturnRefundDraft(orderId, {
        evidenceImageDataUrl: '',
        evidenceImageName: '',
        error: '',
      });
      return;
    }

    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      setReturnRefundDraft(orderId, {
        evidenceImageDataUrl: imageDataUrl,
        evidenceImageName: file.name,
        error: '',
      });
    } catch (error) {
      setReturnRefundDraft(orderId, {
        evidenceImageDataUrl: '',
        evidenceImageName: '',
        error: error.message || 'Unable to load that image.',
      });
    }
  };

  const handleConfirmReturnRefund = async (order) => {
    const draft = returnRefundDrafts[order.id] || {};
    const reason = String(draft.reason || '').trim();
    const evidenceImageDataUrl = String(draft.evidenceImageDataUrl || '').trim();

    if (!reason) {
      setReturnRefundDraft(order.id, { error: 'Please select or enter a reason for the request.' });
      setConfirmReturnRefundOrderId('');
      return;
    }

    setLoadingAction({ type: 'return-refund', orderId: order.id });
    setPageError('');

    try {
      await submitReturnRefundRequest(order.id, {
        type: draft.type || 'refund',
        reason,
        customerMessage: String(draft.customerMessage || '').trim(),
        evidenceImageDataUrl,
      });
      setReturnRefundDrafts((current) => ({ ...current, [order.id]: undefined }));
      setOpenReturnRefundOrderId('');
      setConfirmReturnRefundOrderId('');
      setPageNotice(`Your ${draft.type || 'refund'} request for order ${order.displayId || order.orderCode || order.id} was submitted.`);
    } catch (error) {
      setReturnRefundDraft(order.id, { error: error.message || 'Unable to submit the request right now.' });
      setPageError(error.message || 'Unable to submit the request right now.');
      setConfirmReturnRefundOrderId('');
    } finally {
      setLoadingAction(null);
    }
  };

  const renderWorkflowRail = (order) => {
    try {
      if (!order || typeof order.status !== 'string') {
        return null;
      }

      const steps = buildOrderWorkflowProgress(order.status);
      if (!Array.isArray(steps) || steps.length === 0) {
        return null;
      }

      return (
        <div className="workflow-rail" aria-label={`Order workflow for ${order.displayId || order.id}`}>
          {steps.map((step, index) => (
            <div key={step.status} className="workflow-step">
              <div className={`workflow-dot ${step.isComplete ? 'is-complete' : ''} ${step.isCurrent ? 'is-current' : ''}`} />
              <div className="workflow-step-copy">
                <span className="workflow-step-label">{step.label}</span>
                <span className="workflow-step-index">{index + 1}</span>
              </div>
            </div>
          ))}
        </div>
      );
    } catch (error) {
      console.error('Error rendering workflow rail:', error);
      return null;
    }
  };

  const renderLalamoveTrackingPanel = (order) => {
    try {
      if (!order || String(order.deliveryMethod || '').toLowerCase() !== 'delivery') {
        return null;
      }

      const tracking = getLalamoveTracking(order);
      const isBooked = Boolean(tracking.booked);

      return (
        <div className="customer-delivery-panel">
          <div className="customer-delivery-header">
            <div>
              <p className="order-panel-kicker">Delivery Tracking</p>
              <h3>{isBooked ? 'Lalamove Delivery' : 'Waiting for Courier Booking'}</h3>
            </div>
            <Truck size={20} />
          </div>

          {!isBooked ? (
            <p className="order-panel-copy">
              Your order is waiting for admin or staff to book a Lalamove delivery after confirmation.
            </p>
          ) : (
            <>
              <div className="customer-delivery-grid">
                <div>
                  <span>Status</span>
                  <strong>{tracking.statusLabel || 'Booked'}</strong>
                </div>
                <div>
                  <span>ETA</span>
                  <strong>{formatDateTime(tracking.estimatedDeliveryAt)}</strong>
                </div>
                <div>
                  <span>Driver</span>
                  <strong>{tracking.driver?.name || 'Waiting'}</strong>
                </div>
                <div>
                  <span>Plate</span>
                  <strong>{tracking.driver?.plateNumber || 'N/A'}</strong>
                </div>
                <div>
                  <span>Distance</span>
                  <strong>{formatMeters(tracking.distanceMeters)}</strong>
                </div>
                <div>
                  <span>Last Update</span>
                  <strong>{formatDateTime(tracking.lastSyncedAt)}</strong>
                </div>
              </div>

              {tracking.shareLink && (
                <a
                  className="order-button order-button--primary order-button--compact customer-delivery-link"
                  href={tracking.shareLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} />
                  Track with Lalamove
                </a>
              )}
            </>
          )}
        </div>
      );
    } catch (error) {
      console.error('Error rendering Lalamove tracking panel:', error);
      return null;
    }
  };

  const renderReceiptPanel = (order) => {
    try {
      if (!order || !canCustomerConfirmReceipt(order)) {
        return null;
      }

      const draft = receiptDrafts[order.id] || {};
      const isLoading = loadingAction?.type === 'receipt' && loadingAction.orderId === order.id;

      return (
        <div className="order-action-panel order-action-panel--proof">
          <div className="order-action-panel-header">
            <div>
              <p className="order-panel-kicker">Confirm Receipt</p>
              <h3>Upload receipt proof</h3>
            </div>
            <BadgeCheck size={20} />
          </div>

          <p className="order-panel-copy">
            A photo is required before the order can move to Completed.
          </p>

          <label className="order-upload-card">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => void handleReceiptFileChange(order.id, event)}
              className="order-hidden-input"
            />
            <Upload size={18} />
            <div>
              <strong>{draft.receiptImageName || 'Choose an image file'}</strong>
              <span>Image proof is required to mark the order completed.</span>
            </div>
          </label>

          {draft.receiptImageDataUrl && (
            <img
              src={draft.receiptImageDataUrl}
              alt="Receipt proof preview"
              className="order-image-preview"
            />
          )}

          {draft.error && <div className="order-inline-error">{draft.error}</div>}

          <button
            type="button"
            className="order-button order-button--primary"
            onClick={() => handleConfirmReceipt(order)}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
            {isLoading ? 'Submitting...' : 'Confirm Received'}
          </button>
        </div>
      );
    } catch (error) {
      console.error('Error rendering receipt panel:', error);
      return null;
    }
  };

  /*
  const renderIssuePanel = (order, isOpen) => {
    try {
      if (!order || !canCustomerReportIssue(order) || !isOpen) {
        return null;
      }

      const draft = issueDrafts[order.id] || {
        customerName: loggedInCustomer?.fullName || loggedInCustomer?.username || order.customer || '',
        description: '',
        issueType: 'damage',
        evidenceImageDataUrl: '',
        evidenceImageName: '',
        error: '',
        success: '',
      };
      const isLoading = loadingAction?.type === 'issue' && loadingAction.orderId === order.id;
      const detectionDate = new Date().toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return (
      <div className="order-action-panel order-action-panel--issue">
        <div className="order-action-panel-header">
          <div>
            <p className="order-panel-kicker">Request Return</p>
            <h3>Damage or discrepancy report</h3>
          </div>
          <button
            type="button"
            className="order-button order-button--ghost order-button--compact"
            onClick={() => setOpenIssueOrderId('')}
          >
            Hide form
          </button>
        </div>

        <p className="order-panel-copy">
          If the delivered order is damaged, missing items, or otherwise mismatched, submit a return request with image proof so admin or staff can review it.
        </p>

        <div className="order-form-grid">
          <div className="order-form-field">
            <label htmlFor={`order-customer-name-${order.id}`}>Customer Name</label>
            <input id={`order-customer-name-${order.id}`}
              type="text"
              className="order-input"
              value={draft.customerName || ''}
              onChange={(event) => setIssueDraft(order.id, { customerName: event.target.value })}
              placeholder="Full name"
            />
          </div>

          <div className="order-form-field">
            <label htmlFor={`order-order-id-${order.id}`}>Order ID</label>
            <input id={`order-order-id-${order.id}`}
              type="text"
              className="order-input"
              value={order.displayId || order.orderCode || order.id}
              readOnly
            />
          </div>
        </div>

        <div className="order-form-field">
          <label htmlFor={`order-issue-type-${order.id}`}>Issue Type</label>
          <select id={`order-issue-type-${order.id}`}
            className="order-input"
            value={draft.issueType || 'damage'}
            onChange={(event) => setIssueDraft(order.id, { issueType: event.target.value })}
          >
            <option value="damage">Damaged item</option>
            <option value="missing_items">Missing items</option>
            <option value="wrong_order">Wrong order</option>
            <option value="quality_issue">Quality issue</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="order-form-field">
          <label htmlFor={`order-description-${order.id}`}>Description</label>
          <textarea id={`order-description-${order.id}`}
            className="order-textarea"
            value={draft.description || ''}
            onChange={(event) => setIssueDraft(order.id, { description: event.target.value })}
            placeholder="Describe what went wrong with the order."
          />
        </div>

        <div className="order-form-meta">
          <div className="order-form-meta-item">
            <span>Date of Detection</span>
            <strong>{detectionDate}</strong>
          </div>
          <div className="order-form-meta-item">
            <span>Proof Required</span>
            <strong>Yes</strong>
          </div>
        </div>

        <label className="order-upload-card">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => void handleIssueFileChange(order.id, event)}
            className="order-hidden-input"
          />
          <Camera size={18} />
          <div>
            <strong>{draft.evidenceImageName || 'Upload photographic evidence'}</strong>
            <span>No image means no report submission.</span>
          </div>
        </label>

        {draft.evidenceImageDataUrl && (
          <img
            src={draft.evidenceImageDataUrl}
            alt="Issue evidence preview"
            className="order-image-preview"
          />
        )}

        {draft.error && <div className="order-inline-error">{draft.error}</div>}
        {draft.success && <div className="order-inline-success">{draft.success}</div>}

        <button
          type="button"
          className="order-button order-button--primary"
          onClick={() => handleSubmitIssue(order)}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
          {isLoading ? 'Sending...' : 'Submit Return Request'}
        </button>
      </div>
    );
    } catch (error) {
      console.error('Error rendering issue panel:', error);
      return null;
    }
  };
  */

  const renderCancelPanel = (order, isOpen) => {
    try {
      if (!order || !canCustomerCancelOrder(order) || !isOpen) {
        return null;
      }

      const draft = cancelDrafts[order.id] || {
        reason: '',
        error: '',
      };
      const isLoading = loadingAction?.type === 'cancel' && loadingAction.orderId === order.id;

      return (
        <div className="order-action-panel order-action-panel--cancel">
          <div className="order-action-panel-header">
            <div>
              <p className="order-panel-kicker">Cancel Order</p>
              <h3>Cancellation reason</h3>
            </div>
            <button
              type="button"
              className="order-button order-button--ghost order-button--compact"
              onClick={() => setOpenCancelOrderId('')}
            >
              Hide form
            </button>
          </div>

          <p className="order-panel-copy">
            Cancel this order while it is still pending. A reason is optional, but it helps the team understand the request.
          </p>

          <div className="order-form-field">
            <label htmlFor={`order-cancel-reason-${order.id}`}>Reason (optional)</label>
            <textarea id={`order-cancel-reason-${order.id}`}
              className="order-textarea"
              value={draft.reason || ''}
              onChange={(event) => setCancelDraft(order.id, { reason: event.target.value, error: '' })}
              placeholder="Add a short reason for the cancellation."
            />
          </div>

          {draft.error && <div className="order-inline-error">{draft.error}</div>}

          <button
            type="button"
            className="order-button order-button--danger"
            onClick={() => void handleCancelOrder(order)}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 size={16} className="spin" /> : <XCircle size={16} />}
            {isLoading ? 'Cancelling...' : 'Confirm Cancellation'}
          </button>
        </div>
      );
    } catch (error) {
      console.error('Error rendering cancel panel:', error);
      return null;
    }
  };

  const renderReturnRefundPanel = (order, isOpen) => {
    if (!order || !canCustomerRequestReturnRefund(order) || !isOpen) {
      return null;
    }

    const draft = returnRefundDrafts[order.id] || {
      type: 'refund',
      reason: 'Product quality concern',
      customerMessage: '',
      evidenceImageDataUrl: '',
      evidenceImageName: '',
      error: '',
    };
    const isLoading = loadingAction?.type === 'return-refund' && loadingAction.orderId === order.id;

    return (
      <div className="order-action-panel order-action-panel--issue">
        <div className="order-action-panel-header">
          <div>
            <p className="order-panel-kicker">Return or Refund</p>
            <h3>Submit a request</h3>
          </div>
          <button
            type="button"
            className="order-button order-button--ghost order-button--compact"
            onClick={() => setOpenReturnRefundOrderId('')}
          >
            Hide form
          </button>
        </div>

        <p className="order-panel-copy">
          Your request will be linked to this order and appear immediately in the admin or staff orders dashboard.
        </p>

        <div className="order-form-grid">
          <div className="order-form-field">
            <label htmlFor={`order-request-type-${order.id}`}>Request Type</label>
            <select id={`order-request-type-${order.id}`}
              className="order-input"
              value={draft.type || 'refund'}
              onChange={(event) => setReturnRefundDraft(order.id, { type: event.target.value, error: '' })}
            >
              <option value="refund">Refund</option>
              <option value="return">Return</option>
            </select>
          </div>
          <div className="order-form-field">
            <label htmlFor={`order-refund-reason-${order.id}`}>Reason</label>
            <select id={`order-refund-reason-${order.id}`}
              className="order-input"
              value={draft.reason || ''}
              onChange={(event) => setReturnRefundDraft(order.id, { reason: event.target.value, error: '' })}
            >
              <option value="">Select a reason</option>
              <option value="Product quality concern">Product quality concern</option>
              <option value="Damaged or incorrect item">Damaged or incorrect item</option>
              <option value="Missing item">Missing item</option>
              <option value="Order was not received">Order was not received</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="order-form-field">
          <label htmlFor={`order-refund-message-${order.id}`}>Additional Message</label>
          <textarea id={`order-refund-message-${order.id}`}
            className="order-textarea"
            value={draft.customerMessage || ''}
            onChange={(event) => setReturnRefundDraft(order.id, { customerMessage: event.target.value, error: '' })}
            placeholder="Add any detail that will help the team review your request."
          />
        </div>

        <div className="order-form-field">
          <label>Photo Proof <span className="order-field-optional">Optional</span></label>
          <label className="order-upload-card">
            <input
              type="file"
              accept="image/png,image/jpeg"
              capture="environment"
              onChange={(event) => void handleReturnRefundFileChange(order.id, event)}
              className="order-hidden-input"
            />
            <Camera size={18} />
            <div>
              <strong>{draft.evidenceImageName || 'Add photo proof of the damaged item'}</strong>
              <span>PNG or JPG/JPEG, up to 5 MB.</span>
            </div>
          </label>
        </div>

        {draft.evidenceImageDataUrl && (
          <img
            src={draft.evidenceImageDataUrl}
            alt="Return or refund evidence preview"
            className="order-image-preview"
          />
        )}

        {draft.error && <div className="order-inline-error">{draft.error}</div>}

        <button
          type="button"
          className="order-button order-button--primary"
          onClick={() => setConfirmReturnRefundOrderId(order.id)}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />}
          {isLoading ? 'Submitting...' : 'Request Return/Refund'}
        </button>
      </div>
    );
  };

  const renderReturnRefundStatus = (order) => {
    const request = order?.latestReturnRefundRequest;
    if (!request) return null;

    return (
      <div className="order-action-panel order-action-panel--issue">
        <div className="order-action-panel-header">
          <div>
            <p className="order-panel-kicker">{request.type === 'return' ? 'Return' : 'Refund'} Request</p>
            <h3>{getReturnRefundStatusLabel(request.status)}</h3>
          </div>
          <span className="customer-order-badge customer-order-badge--review">
            {getReturnRefundStatusLabel(request.status)}
          </span>
        </div>
        <p className="order-panel-copy"><strong>Reason:</strong> {request.reason}</p>
        {request.customerMessage && <p className="order-panel-copy">{request.customerMessage}</p>}
        {request.evidenceImageUrl && (
          <a href={request.evidenceImageUrl} target="_blank" rel="noreferrer" className="order-evidence-link">
            <img src={request.evidenceImageUrl} alt="Photo proof supplied with the request" className="order-image-preview" />
          </a>
        )}
        {request.rejectionReason && <div className="order-inline-error">Rejection reason: {request.rejectionReason}</div>}
        <div className="order-form-meta">
          {(request.history || []).map((entry, index) => (
            <div key={`${entry.createdAt || entry.created_at || index}-${index}`} className="order-form-meta-item">
              <span>{getReturnRefundStatusLabel(entry.status)}</span>
              <strong>{formatDateTime(entry.createdAt || entry.created_at)}</strong>
              {entry.note && <small>{entry.note}</small>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderOrderCard = (order, variant = 'active') => {
    // Guard: Ensure order data is valid
    if (!order || typeof order !== 'object') {
      console.warn('Invalid order data:', order);
      return null;
    }

    const statusLabel = getOrderStatusLabel(order.status);
    const reviewStatusLabel = getReviewStatusLabel(order.reviewStatus);
    const latestReport = order.latestIssueReport;
    const isUnderReview = normalizeReviewStatus(order.reviewStatus) === 'under_review';
    const isHistoryCard = variant === 'history';
    const isCancelled = order.status === 'cancelled';
    const isRefunded = order.status === 'refunded';
    const isCancelOpen = openCancelOrderId === order.id;
    const isReturnRefundOpen = openReturnRefundOrderId === order.id;
    const latestReturnRefundRequest = order.latestReturnRefundRequest;
    const loadingCancel = loadingAction?.type === 'cancel' && loadingAction.orderId === order.id;
    const isTargetedForConfirmation = confirmOrderId === order.id && hasCustomerConfirmationPending(order);

    return (
      <article
        key={order.id}
        id={`customer-order-${order.id}`}
        className={`customer-order-card ${isHistoryCard ? 'customer-order-card--history' : ''} ${isUnderReview ? 'customer-order-card--review' : ''} ${isTargetedForConfirmation ? 'customer-order-card--targeted' : ''}`}
      >
        <div className="customer-order-header">
          <div className="customer-order-title-block">
            <p className="order-panel-kicker">{variant === 'history' ? 'History' : 'Active Order'}</p>
            <h2>{order.displayId || order.orderCode || order.id}</h2>
            <p className="customer-order-meta">
              {formatDateTime(order.createdAt || order.updatedAt || order.date)} - {order.deliveryMethod === 'delivery' ? 'Delivery' : 'Pick-up'}
            </p>
          </div>

          <div className="customer-order-badges">
            <span className={`customer-order-badge customer-order-badge--${order.status}`}>{statusLabel}</span>
            {isUnderReview && <span className="customer-order-badge customer-order-badge--review">{reviewStatusLabel}</span>}
            {isRefunded && <span className="customer-order-badge customer-order-badge--refunded">Returned</span>}
            {latestReturnRefundRequest && (
              <span className="customer-order-badge customer-order-badge--review">
                {getReturnRefundStatusLabel(latestReturnRefundRequest.status)}
              </span>
            )}
          </div>
        </div>

        <div className="customer-order-summary">
          <div>
            <span>Customer</span>
            <strong>{order.customer || 'Customer'}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{formatCurrency(order.total || order.totalAmount)}</strong>
          </div>
          <div>
            <span>Payment</span>
            <strong>{order.paymentStatusLabel || getPaymentStatusLabel(order)}</strong>
          </div>
          <div>
            <span>Delivery</span>
            <strong>{order.deliveryMethod === 'delivery' ? 'Courier delivery' : 'Pick-up'}</strong>
          </div>
        </div>

        <div className="customer-order-items">
          <div className="customer-order-section-title">
            <ReceiptText size={16} />
            <span>Items</span>
          </div>

          {(order.lineItems || []).map((item) => (
            <div key={`${order.id}-${item.id || item.productId || item.name}`} className="customer-order-item">
              <div>
                <strong>{item.name}</strong>
                <p>{item.quantity} x {formatCurrency(item.price)}</p>
              </div>
              <span>{formatCurrency(item.lineTotal || ((Number(item.price) || 0) * (Number(item.quantity) || 0)))}</span>
            </div>
          ))}
        </div>

        <div className="customer-order-notes">
          <div className="customer-order-note">
            <Clock3 size={16} />
            <div>
              <strong>Status update</strong>
              <p>
                {isCancelled && order.cancellationReason
                  ? order.cancellationReason
                  : isRefunded && order.reviewReason
                    ? order.reviewReason
                    : order.status === 'delivered'
                      ? 'The order has been marked as delivered. Please confirm receipt once you have received the order.'
                      : order.status === 'ready'
                        ? ' The order is ready for pickup/delivery. Please wait for the delivery or pick it up at the store.'
                        : `Current state: ${statusLabel}.`}
              </p>
            </div>
          </div>

          {order.containsLecheFlan && order.deliveryDistanceKm != null && (
            <div className="customer-order-note customer-order-note--warning">
              <ShieldAlert size={16} />
              <div>
                <strong>Leche flan restriction</strong>
                <p>Delivery distance: {Number(order.deliveryDistanceKm).toFixed(1)} km.</p>
              </div>
            </div>
          )}

          {isUnderReview && latestReport && (
            <div className="customer-order-note customer-order-note--review">
              <ShieldCheck size={16} />
              <div>
                <strong>Under review</strong>
                <p>
                  {latestReport.description}
                </p>
                {latestReport.evidenceImageUrl && (
                  <a
                    href={latestReport.evidenceImageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="order-evidence-link"
                  >
                    <img
                      src={latestReport.evidenceImageUrl}
                      alt="Photo proof submitted for this order"
                      className="order-image-preview"
                    />
                  </a>
                )}
              </div>
            </div>
          )}

          {!isUnderReview && latestReport?.reviewStatus === 'rejected' && (
            <div className="customer-order-note customer-order-note--warning">
              <ShieldAlert size={16} />
              <div>
                <strong>Return request rejected</strong>
                <p>{latestReport.reviewReason || 'The return request was not approved.'}</p>
              </div>
            </div>
          )}

          {order.status === 'delivered' && !isUnderReview && (
            <div className="customer-order-note customer-order-note--delivery">
              <AlertTriangle size={16} />
              <div>
                <strong>Delivery discrepancy check</strong>
              </div>
            </div>
          )}
        </div>

        {variant === 'active' && <OrderVerificationPanel order={order} />}

        <OrderFeedbackPanel order={order} />

        {variant === 'active' && renderLalamoveTrackingPanel(order)}

        {variant === 'active' && renderWorkflowRail(order)}

        {renderReturnRefundStatus(order)}

        {variant === 'active' && isTargetedForConfirmation && (
          <div className="customer-order-note customer-order-note--confirmation">
            <CheckCircle2 size={16} />
            <div>
              <strong>Confirmation required</strong>
              <p>Confirm this delivered order below to clear your reminder banner.</p>
            </div>
          </div>
        )}

        <div className="customer-order-actions">
          {variant === 'active' && (
            <>
            {canCustomerCancelOrder(order) && (
              <button
                type="button"
                className={`order-button order-button--danger ${isCancelOpen ? 'is-active' : ''}`}
                onClick={() => setOpenCancelOrderId((current) => (current === order.id ? '' : order.id))}
                disabled={loadingCancel}
              >
                {loadingCancel ? <Loader2 size={16} className="spin" /> : <XCircle size={16} />}
                {isCancelOpen ? 'Hide Cancel Form' : 'Cancel Order'}
              </button>
            )}
            </>
          )}
          {canCustomerRequestReturnRefund(order) && (
            <button
              type="button"
              className={`order-button order-button--refund ${isReturnRefundOpen ? 'is-active' : ''}`}
              onClick={() => setOpenReturnRefundOrderId((current) => (current === order.id ? '' : order.id))}
            >
              <RotateCcw size={16} />
              {isReturnRefundOpen ? 'Hide Request Form' : 'Request Return/Refund'}
            </button>
          )}
        </div>

        {variant === 'active' && renderReceiptPanel(order)}
        {variant === 'active' && renderCancelPanel(order, isCancelOpen)}
        {renderReturnRefundPanel(order, isReturnRefundOpen)}
      </article>
    );
  };

  return (
    <div className="orders-workflow-page">
      <header className="orders-customer-heading">
        <h1>My orders</h1>
        <p>Track your treats and find your order history.</p>
      </header>
      {(pageNotice || pageError) && (
        <section className="orders-alert-stack" aria-live="polite">
          {pageNotice && (
            <div className="orders-alert-card orders-alert-card--success">
              <CheckCircle2 size={18} />
              <div>{pageNotice}</div>
            </div>
          )}
          {pageError && (
            <div className="orders-alert-card orders-alert-card--error">
              <CircleAlert size={18} />
              <div>{pageError}</div>
            </div>
          )}
        </section>
      )}

      <section className="orders-summary-grid">
        {summaryCards.map((card) => (
          <article key={card.label} className="orders-summary-card">
            <div className="orders-summary-icon">
              <card.icon size={20} />
            </div>
            <div>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
              <span>{card.helper}</span>
            </div>
          </article>
        ))}
      </section>

      {notifications.length > 0 && (
        <section className="orders-notification-panel">
          <div className="orders-section-header">
            <div>
              <p className="orders-eyebrow">Action Needed</p>
              <h2>Pending Confirmation</h2>
            </div>
            <span className="orders-section-chip">{notifications.length} pending</span>
          </div>

          <div className="orders-notification-grid">
            {notifications.map((notification) => (
              <article key={notification.id} className="orders-notification-card">
                <div className="orders-notification-icon">
                  <BellRing size={18} />
                </div>
                <div className="orders-notification-body">
                  <p className="orders-notification-title">
                    {notification.orderId} - pending confirmation
                  </p>
                  <h3>{notification.message}</h3>
                  <span>{formatDateTime(notification.createdAt)}</span>
                </div>
                <Link
                  to={`/orders?confirm=${encodeURIComponent(notification.id)}`}
                  className="order-button order-button--primary order-button--compact orders-notification-action"
                >
                  Confirm Now
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="orders-section">
        <div className="orders-section-header">
          <div>
            <p className="orders-eyebrow">Active Orders</p>
            <h2>Track your order</h2>
          </div>
          <span className="orders-section-chip">{activeOrders.length} open</span>
        </div>

        {isOrdersLoading ? (
          <div className="orders-empty-state">
            <Loader2 size={28} className="spin" />
            <p>Loading orders...</p>
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="orders-empty-state">
            <ShieldCheck size={28} />
            <p>No active orders right now.</p>
            <span>Once you place a new order, it will appear here from Pending through Delivered.</span>
            <Link to="/products" className="order-button order-button--primary">Browse Products</Link>
          </div>
        ) : (
          <div className="orders-card-stack">
            {activeOrders.map((order) => renderOrderCard(order, 'active'))}
          </div>
        )}
      </section>

      <section className="orders-section">
        <div className="orders-section-header">
          <div>
            <p className="orders-eyebrow">History</p>
            <h2>Past orders</h2>
          </div>
          <div className="orders-section-actions">
            <span className="orders-section-chip">{historyOrders.length} archived</span>
            {historyOrders.length > 0 && (
              <button
                type="button"
                className="order-button order-button--ghost order-button--compact orders-history-toggle"
                onClick={() => setIsHistoryExpanded((current) => !current)}
                aria-expanded={isHistoryExpanded}
                aria-controls="orders-history-list"
              >
                {isHistoryExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {isHistoryExpanded ? 'Hide History' : 'View History'}
              </button>
            )}
          </div>
        </div>

        {historyOrders.length === 0 ? (
          <div className="orders-empty-state">
            <History size={28} />
            <p>History will appear here once orders are completed, cancelled, or returned.</p>
          </div>
        ) : !isHistoryExpanded ? (
          <div className="orders-history-collapsed">
            <History size={24} />
            <div>
              <p>Your archived orders are ready to view.</p>
            </div>
          </div>
        ) : (
          <div id="orders-history-list" className="orders-card-stack">
            {historyOrders.map((order) => renderOrderCard(order, 'history'))}
          </div>
        )}
      </section>

      {confirmReturnRefundOrderId && (() => {
        const order = orders.find((item) => item.id === confirmReturnRefundOrderId);
        const draft = order ? (returnRefundDrafts[order.id] || {}) : {};
        if (!order) return null;

        return (
          <div className="order-confirmation-backdrop" role="presentation">
            <section ref={confirmationDialogRef} tabIndex={-1} className="order-confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="return-refund-confirm-title">
              <p className="order-panel-kicker">Confirm Request</p>
              <h2 id="return-refund-confirm-title">Submit {draft.type === 'return' ? 'return' : 'refund'} request?</h2>
              <p>Are you sure you want to submit this refund request for {order.displayId || order.orderCode || order.id}?</p>
              <p><strong>Reason:</strong> {draft.reason}</p>
              <div className="order-confirmation-actions">
                <button type="button" className="order-button order-button--ghost" disabled={loadingAction?.type === 'return-refund'} onClick={() => setConfirmReturnRefundOrderId('')}>Cancel</button>
                <button type="button" className="order-button order-button--primary" disabled={loadingAction?.type === 'return-refund'} onClick={() => void handleConfirmReturnRefund(order)}>{loadingAction?.type === 'return-refund' ? 'Submitting…' : 'Confirm Request'}</button>
              </div>
            </section>
          </div>
        );
      })()}
    </div>
  );
};

export default Orders;

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  BellRing,
  Camera,
  CheckCircle2,
  CircleAlert,
  Clock3,
  History,
  Loader2,
  PackageCheck,
  ReceiptText,
  Send,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import {
  buildOrderWorkflowProgress,
  canCustomerCancelOrder,
  canCustomerConfirmReceipt,
  canCustomerReportIssue,
  getOrderStatusLabel,
  getReviewStatusLabel,
  isHistoryOrderStatus,
  normalizeReviewStatus,
} from '../utils/orderWorkflow';
import './Orders.css';

const ORDER_PRIORITY = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  'out-for-delivery': 4,
  delivered: 5,
};

const formatCurrency = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

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

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Unable to read the selected image.'));
  reader.readAsDataURL(file);
});

const getNotificationAudience = (notification) => String(notification?.audience || 'customer').toLowerCase();

const getNotificationType = (notification) => String(notification?.type || 'info').toLowerCase();

const formatIssueType = (value) => String(value || 'damage').replace(/_/g, ' ');

const Orders = () => {
  const { loggedInCustomer } = useAuth();
  const { orders, isOrdersLoading, confirmOrderReceipt, submitOrderIssue, cancelOrder } = useOrders();
  const [pageNotice, setPageNotice] = useState('');
  const [pageError, setPageError] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);
  const [receiptDrafts, setReceiptDrafts] = useState({});
  const [issueDrafts, setIssueDrafts] = useState({});
  const [openIssueOrderId, setOpenIssueOrderId] = useState('');
  const [cancelDrafts, setCancelDrafts] = useState({});
  const [openCancelOrderId, setOpenCancelOrderId] = useState('');

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

  const notifications = useMemo(() => {
    const feed = orders.flatMap((order) => (
      (order.notifications || [])
        .filter((notification) => {
          const audience = getNotificationAudience(notification);
          return audience === 'customer' || audience === 'all';
        })
        .map((notification) => ({
          ...notification,
          orderId: order.displayId || order.orderCode || order.id,
          orderStatus: order.status,
        }))
    ));

    return feed
      .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
      .slice(0, 6);
  }, [orders]);

  const summaryCards = useMemo(() => ([
    {
      label: 'Active Orders',
      value: activeOrders.length,
      helper: 'Pending through delivered',
      icon: PackageCheck,
    },
    {
      label: 'History',
      value: historyOrders.length,
      helper: 'Completed, cancelled, refunded',
      icon: History,
    },
    {
      label: 'Under Review',
      value: orders.filter((order) => normalizeReviewStatus(order.reviewStatus) === 'under_review').length,
      helper: 'Waiting on staff review',
      icon: ShieldAlert,
    },
  ]), [activeOrders.length, historyOrders.length, orders]);

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

  const setIssueDraft = (orderId, patch) => {
    const customerName = loggedInCustomer?.fullName || loggedInCustomer?.username || '';

    setIssueDrafts((current) => ({
      ...current,
      [orderId]: {
        ...(current[orderId] || {
          customerName,
          description: '',
          issueType: 'damage',
          evidenceImageDataUrl: '',
          evidenceImageName: '',
          error: '',
          success: '',
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

  const handleIssueFileChange = async (orderId, event) => {
    const file = event.target.files?.[0];

    if (!file) {
      setIssueDraft(orderId, {
        evidenceImageDataUrl: '',
        evidenceImageName: '',
        error: '',
      });
      return;
    }

    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      setIssueDraft(orderId, {
        evidenceImageDataUrl: imageDataUrl,
        evidenceImageName: file.name,
        error: '',
      });
    } catch (error) {
      setIssueDraft(orderId, {
        evidenceImageDataUrl: '',
        evidenceImageName: '',
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

  const handleSubmitIssue = async (order) => {
    const draft = issueDrafts[order.id] || {};
    const customerName = String(draft.customerName || '').trim();
    const description = String(draft.description || '').trim();
    const evidenceImageDataUrl = String(draft.evidenceImageDataUrl || '').trim();
    const issueType = String(draft.issueType || 'damage').trim() || 'damage';

    if (!customerName) {
      setIssueDraft(order.id, { error: 'Customer name is required.' });
      return;
    }

    if (!description) {
      setIssueDraft(order.id, { error: 'Description of the issue is required.' });
      return;
    }

    if (!evidenceImageDataUrl) {
      setIssueDraft(order.id, { error: 'Photographic evidence is required.' });
      return;
    }

    setLoadingAction({ type: 'issue', orderId: order.id });
    setPageError('');

    try {
      await submitOrderIssue(order.id, {
        customerName,
        description,
        issueType,
        evidenceImageDataUrl,
      });

      setIssueDraft(order.id, {
        description: '',
        evidenceImageDataUrl: '',
        evidenceImageName: '',
        error: '',
        success: 'Your issue report has been sent to the admin team for review.',
      });
      setOpenIssueOrderId('');
      setPageNotice(`Issue report submitted for order ${order.displayId || order.orderCode || order.id}.`);
    } catch (error) {
      setIssueDraft(order.id, {
        error: error.message || 'Unable to send this issue report right now.',
      });
      setPageError(error.message || 'Unable to send this issue report right now.');
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

  const renderWorkflowRail = (order) => {
    const steps = buildOrderWorkflowProgress(order.status);

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
  };

  const renderReceiptPanel = (order) => {
    if (!canCustomerConfirmReceipt(order)) {
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
          This button only appears after the order is marked Delivered. A photo is required before the order can move to Completed.
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
  };

  const renderIssuePanel = (order, isOpen) => {
    if (!canCustomerReportIssue(order) || !isOpen) {
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
            <p className="order-panel-kicker">Request Refund</p>
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
          If the delivered order is damaged, missing items, or otherwise mismatched, request a refund with image proof so the admin team can review it.
        </p>

        <div className="order-form-grid">
          <div className="order-form-field">
            <label>Customer Name</label>
            <input
              type="text"
              className="order-input"
              value={draft.customerName || ''}
              onChange={(event) => setIssueDraft(order.id, { customerName: event.target.value })}
              placeholder="Full name"
            />
          </div>

          <div className="order-form-field">
            <label>Order ID</label>
            <input
              type="text"
              className="order-input"
              value={order.displayId || order.orderCode || order.id}
              readOnly
            />
          </div>
        </div>

        <div className="order-form-field">
          <label>Issue Type</label>
          <select
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
          <label>Description</label>
          <textarea
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
          {isLoading ? 'Sending...' : 'Submit Refund Request'}
        </button>
      </div>
    );
  };

  const renderCancelPanel = (order, isOpen) => {
    if (!canCustomerCancelOrder(order) || !isOpen) {
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
          <label>Reason (optional)</label>
          <textarea
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
  };

  const renderOrderCard = (order, variant = 'active') => {
    const statusLabel = getOrderStatusLabel(order.status);
    const reviewStatusLabel = getReviewStatusLabel(order.reviewStatus);
    const workflowSteps = buildOrderWorkflowProgress(order.status);
    const orderNotifications = (order.notifications || [])
      .filter((notification) => {
        const audience = getNotificationAudience(notification);
        return audience === 'customer' || audience === 'all';
      })
      .slice(0, 3);
    const latestReport = order.latestIssueReport;
    const isUnderReview = normalizeReviewStatus(order.reviewStatus) === 'under_review';
    const isHistoryCard = variant === 'history';
    const isCancelled = order.status === 'cancelled';
    const isRefunded = order.status === 'refunded';
    const isIssueOpen = openIssueOrderId === order.id;
    const isCancelOpen = openCancelOrderId === order.id;
    const loadingCancel = loadingAction?.type === 'cancel' && loadingAction.orderId === order.id;

    return (
      <article key={order.id} className={`customer-order-card ${isHistoryCard ? 'customer-order-card--history' : ''} ${isUnderReview ? 'customer-order-card--review' : ''}`}>
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
            {isRefunded && <span className="customer-order-badge customer-order-badge--refunded">Returned/Refunded</span>}
          </div>
        </div>

        <div className="customer-order-summary">
          <div>
            <span>Customer</span>
            <strong>{order.customer || 'Customer'}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{order.total || formatCurrency(order.totalAmount)}</strong>
          </div>
          <div>
            <span>Payment</span>
            <strong>{String(order.paymentMethod || 'cash').toLowerCase() === 'online' ? 'Online' : 'Cash'}</strong>
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
                      ? 'Delivered orders can be confirmed with photo proof or reported if something is wrong.'
                      : order.status === 'ready'
                        ? 'The order is ready and inventory has already been reduced.'
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
              </div>
            </div>
          )}

          {order.status === 'delivered' && !isUnderReview && (
            <div className="customer-order-note customer-order-note--delivery">
              <AlertTriangle size={16} />
              <div>
                <strong>Delivery discrepancy check</strong>
                <p>If the order matches, confirm receipt with photo proof. If something is wrong, submit a report right away.</p>
              </div>
            </div>
          )}
        </div>

        {variant === 'active' && renderWorkflowRail(order)}

        {orderNotifications.length > 0 && (
          <div className="customer-order-feed">
            <div className="customer-order-section-title">
              <BellRing size={16} />
              <span>Order notifications</span>
            </div>
            {orderNotifications.map((notification, index) => (
              <div key={`${order.id}-${index}`} className="customer-order-feed-item">
                <div className={`customer-order-feed-icon customer-order-feed-icon--${getNotificationType(notification)}`}>
                  {getNotificationType(notification) === 'refund_approved' || getNotificationType(notification) === 'receipt_confirmed'
                    ? <CheckCircle2 size={14} />
                    : <BellRing size={14} />}
                </div>
                <div>
                  <strong>{notification.message}</strong>
                  <p>{formatDateTime(notification.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {variant === 'active' && (
          <div className="customer-order-actions">
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
            {canCustomerReportIssue(order) && (
              <button
                type="button"
                className={`order-button order-button--refund ${isIssueOpen ? 'is-active' : ''}`}
                onClick={() => setOpenIssueOrderId((current) => (current === order.id ? '' : order.id))}
              >
                <RotateCcw size={16} />
                {isIssueOpen ? 'Hide Refund Form' : 'Request Refund'}
              </button>
            )}
          </div>
        )}

        {variant === 'active' && renderReceiptPanel(order)}
        {variant === 'active' && renderCancelPanel(order, isCancelOpen)}
        {variant === 'active' && renderIssuePanel(order, isIssueOpen)}
      </article>
    );
  };

  return (
    <div className="orders-workflow-page">
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

      <section className="orders-notification-panel">
        <div className="orders-section-header">
          <div>
            <p className="orders-eyebrow">Latest Alerts</p>
            <h2>Notifications</h2>
          </div>
          <span className="orders-section-chip">{notifications.length} updates</span>
        </div>

        {notifications.length === 0 ? (
          <div className="orders-empty-state">
            <BellRing size={28} />
            <p>No order notifications yet.</p>
            <span>Status updates, delivery alerts, and report decisions will appear here.</span>
          </div>
        ) : (
          <div className="orders-notification-grid">
            {notifications.map((notification, index) => (
              <article key={`${notification.orderId}-${index}`} className="orders-notification-card">
                <div className="orders-notification-icon">
                  <BellRing size={18} />
                </div>
                <div>
                  <p className="orders-notification-title">
                    {notification.orderId} - {formatIssueType(notification.type)}
                  </p>
                  <h3>{notification.message}</h3>
                  <span>{formatDateTime(notification.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="orders-section">
        <div className="orders-section-header">
          <div>
            <p className="orders-eyebrow">Active Orders</p>
            <h2>Workflow in progress</h2>
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
            <h2>Completed, cancelled, and refunded orders</h2>
          </div>
          <span className="orders-section-chip">{historyOrders.length} archived</span>
        </div>

        {historyOrders.length === 0 ? (
          <div className="orders-empty-state">
            <History size={28} />
            <p>History will appear here once orders are completed, cancelled, or refunded.</p>
          </div>
        ) : (
          <div className="orders-card-stack">
            {historyOrders.map((order) => renderOrderCard(order, 'history'))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Orders;

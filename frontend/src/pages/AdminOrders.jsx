import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  BellRing,
  CheckCircle2,
  Clock3,
  ChevronRight,
  Loader2,
  PackageCheck,
  Search,
  ShieldAlert,
  Sparkles,
  Truck,
  Undo2,
  XCircle,
} from 'lucide-react';
import { useOrders } from '../context/OrderContext';
import {
  buildOrderWorkflowProgress,
  canStaffCancelOrder,
  getOrderStatusLabel,
  getReviewStatusLabel,
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

const formatCurrency = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

const formatDateTime = (value) => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const normalizeFilterValue = (value) => String(value || 'all').toLowerCase();

const getNextWorkflowAction = (order) => {
  const status = String(order?.status || '').toLowerCase();
  const deliveryMethod = String(order?.deliveryMethod || '').toLowerCase();

  if (status === 'pending') {
    return { label: 'Confirm Order', nextStatus: 'confirmed', icon: BadgeCheck };
  }

  if (status === 'confirmed') {
    return { label: 'Start Preparing', nextStatus: 'preparing', icon: Clock3 };
  }

  if (status === 'preparing') {
    return { label: 'Mark Ready', nextStatus: 'ready', icon: PackageCheck };
  }

  if (status === 'ready' && deliveryMethod === 'delivery') {
    return { label: 'Out for Delivery', nextStatus: 'out-for-delivery', icon: Truck };
  }

  if (status === 'ready' && deliveryMethod === 'pickup') {
    return { label: 'Mark Delivered', nextStatus: 'delivered', icon: CheckCircle2 };
  }

  if (status === 'out-for-delivery') {
    return { label: 'Mark Delivered', nextStatus: 'delivered', icon: CheckCircle2 };
  }

  return null;
};

const AdminOrders = () => {
  const { orders, updateOrderStatus, cancelOrder } = useOrders();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [pageError, setPageError] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);

  useEffect(() => {
    if (!selectedOrderId && orders.length > 0) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders, selectedOrderId]);

  const filteredOrders = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const filterValue = normalizeFilterValue(selectedFilter);

    return [...orders]
      .filter((order) => {
        const displayId = String(order.displayId || order.orderCode || order.id || '').toLowerCase();
        const customer = String(order.customer || '').toLowerCase();
        const items = String(order.items || '').toLowerCase();
        const reviewStatus = normalizeReviewStatus(order.reviewStatus);
        const statusMatches = filterValue === 'all'
          || String(order.status || '').toLowerCase() === filterValue
          || (filterValue === 'under_review' && reviewStatus === 'under_review');
        const searchMatches = !search
          || displayId.includes(search)
          || customer.includes(search)
          || items.includes(search);

        return statusMatches && searchMatches;
      })
      .sort((left, right) => {
        const leftPriority = STATUS_PRIORITY[left.status] ?? 99;
        const rightPriority = STATUS_PRIORITY[right.status] ?? 99;

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return new Date(right.createdAt || right.date || 0).getTime()
          - new Date(left.createdAt || left.date || 0).getTime();
      });
  }, [orders, searchTerm, selectedFilter]);

  useEffect(() => {
    if (filteredOrders.length === 0) {
      return;
    }

    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0].id);
    }
  }, [filteredOrders, selectedOrderId]);

  const selectedOrder = useMemo(() => (
    filteredOrders.find((order) => order.id === selectedOrderId) || filteredOrders[0] || null
  ), [filteredOrders, selectedOrderId]);

  const summaryCards = useMemo(() => {
    const underReviewCount = orders.filter((order) => normalizeReviewStatus(order.reviewStatus) === 'under_review').length;
    const pendingCount = orders.filter((order) => String(order.status || '').toLowerCase() === 'pending').length;
    const activeCount = orders.filter((order) => !['completed', 'cancelled', 'refunded'].includes(String(order.status || '').toLowerCase())).length;

    return [
      { label: 'Active Queue', value: activeCount, helper: 'Orders still in motion' },
      { label: 'Pending', value: pendingCount, helper: 'Waiting for confirmation' },
      { label: 'Under Review', value: underReviewCount, helper: 'Discrepancy or refund review' },
      { label: 'All Orders', value: orders.length, helper: 'Total records in the system' },
    ];
  }, [orders]);

  const updateStatus = async (order, nextStatus) => {
    setLoadingAction({ type: 'status', orderId: order.id, status: nextStatus });
    setPageError('');

    try {
      await updateOrderStatus(order.id, nextStatus);
      setPageNotice(`Order ${order.displayId || order.orderCode || order.id} moved to ${getOrderStatusLabel(nextStatus, 'admin')}.`);
    } catch (error) {
      setPageError(error.message || 'Unable to update this order right now.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancel = async (order) => {
    const reason = window.prompt('Cancellation reason', '') || '';

    setLoadingAction({ type: 'cancel', orderId: order.id });
    setPageError('');

    try {
      await cancelOrder(order.id, reason);
      setPageNotice(`Order ${order.displayId || order.orderCode || order.id} was cancelled.`);
    } catch (error) {
      setPageError(error.message || 'Unable to cancel this order right now.');
    } finally {
      setLoadingAction(null);
    }
  };

  const renderStatusRibbon = (order) => (
    <div className="admin-order-status-ribbon" aria-label={`Workflow for ${order.displayId || order.id}`}>
      {buildOrderWorkflowProgress(order.status).map((step) => (
        <div key={step.status} className={`admin-order-ribbon-step ${step.isComplete ? 'is-complete' : ''} ${step.isCurrent ? 'is-current' : ''}`}>
          <span className="admin-order-ribbon-dot" />
          <strong>{step.label}</strong>
        </div>
      ))}
    </div>
  );

  const selectedOrderNotifications = (selectedOrder?.notifications || [])
    .filter((notification) => {
      const audience = String(notification?.audience || '').toLowerCase();
      return audience === 'admin_staff' || audience === 'all';
    })
    .slice(0, 4);

  const selectedOrderReports = (selectedOrder?.issueReports || []).slice(0, 3);
  const nextAction = selectedOrder ? getNextWorkflowAction(selectedOrder) : null;
  const loadingStatus = loadingAction?.type === 'status' && loadingAction.orderId === selectedOrder?.id;
  const loadingCancel = loadingAction?.type === 'cancel' && loadingAction.orderId === selectedOrder?.id;

  return (
    <div className="admin-orders-page">
      <section className="admin-orders-hero">
        <div className="admin-orders-hero-copy">
          <p className="admin-orders-kicker">Workflow control</p>
          <h1>Orders</h1>
          <p>
            Move each order through the strict lifecycle only: Pending, Confirmed, Preparing, Ready, Out for Delivery, Delivered, Completed, Cancelled, and Refunded.
          </p>
        </div>

        <div className="admin-orders-hero-chip">
          <Sparkles size={18} />
          <div>
            <strong>{orders.length}</strong>
            <span>orders tracked</span>
          </div>
        </div>
      </section>

      {(pageNotice || pageError) && (
        <section className="admin-orders-alert-stack" aria-live="polite">
          {pageNotice && (
            <div className="admin-orders-alert admin-orders-alert--success">
              <CheckCircle2 size={18} />
              <span>{pageNotice}</span>
            </div>
          )}
          {pageError && (
            <div className="admin-orders-alert admin-orders-alert--error">
              <XCircle size={18} />
              <span>{pageError}</span>
            </div>
          )}
        </section>
      )}

      <section className="admin-orders-stats">
        {summaryCards.map((card) => (
          <article key={card.label} className="admin-orders-stat-card">
            <p>{card.label}</p>
            <strong>{card.value}</strong>
            <span>{card.helper}</span>
          </article>
        ))}
      </section>

      <section className="admin-orders-toolbar">
        <div className="admin-orders-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search order ID, customer, or items"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="admin-orders-filters">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`admin-orders-filter ${normalizeFilterValue(selectedFilter) === filter ? 'is-active' : ''}`}
              onClick={() => setSelectedFilter(filter)}
            >
              {filter === 'all'
                ? 'All'
                : filter === 'under_review'
                  ? 'Under Review'
                  : getOrderStatusLabel(filter, 'admin')}
            </button>
          ))}
        </div>
      </section>

      <section className="admin-orders-layout">
        <div className="admin-orders-list">
          {filteredOrders.length === 0 ? (
            <div className="admin-orders-empty">
              <ShieldAlert size={28} />
              <p>No orders match the current search or filter.</p>
              <span>Try another status or clear the search field.</span>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isSelected = selectedOrder?.id === order.id;
              const reviewStatus = normalizeReviewStatus(order.reviewStatus);

              return (
                <button
                  key={order.id}
                  type="button"
                  className={`admin-order-card ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <div className="admin-order-card-top">
                    <div>
                      <p className="admin-order-card-kicker">Order</p>
                      <h3>{order.displayId || order.orderCode || order.id}</h3>
                      <span>{order.customer || 'Customer'} - {formatDateTime(order.createdAt || order.date)}</span>
                    </div>
                    <div className="admin-order-card-badges">
                      <span className={`admin-order-badge admin-order-badge--${order.status}`}>{getOrderStatusLabel(order.status, 'admin')}</span>
                      {reviewStatus === 'under_review' && (
                        <span className="admin-order-badge admin-order-badge--review">{getReviewStatusLabel(reviewStatus)}</span>
                      )}
                    </div>
                  </div>

                  <div className="admin-order-card-meta">
                    <div>
                      <span>Total</span>
                      <strong>{order.total || formatCurrency(order.totalAmount)}</strong>
                    </div>
                    <div>
                      <span>Method</span>
                      <strong>{order.deliveryMethod === 'delivery' ? 'Delivery' : 'Pickup'}</strong>
                    </div>
                    <div>
                      <span>Items</span>
                      <strong>{(order.lineItems || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}</strong>
                    </div>
                  </div>

                  <div className="admin-order-card-foot">
                    <span>{order.containsLecheFlan ? 'Leche flan item' : 'Standard order'}</span>
                    <ChevronRight size={16} />
                  </div>
                </button>
              );
            })
          )}
        </div>

        <aside className="admin-order-detail">
          {!selectedOrder ? (
            <div className="admin-order-detail-empty">
              <PackageCheck size={28} />
              <p>Select an order to review the workflow, notes, and next action.</p>
            </div>
          ) : (
            <>
              <div className="admin-order-detail-header">
                <div>
                  <p className="admin-orders-kicker">Selected order</p>
                  <h2>{selectedOrder.displayId || selectedOrder.orderCode || selectedOrder.id}</h2>
                  <p>{selectedOrder.customer || 'Customer'} - {formatDateTime(selectedOrder.createdAt || selectedOrder.date)}</p>
                </div>

                <div className="admin-order-detail-badges">
                  <span className={`admin-order-badge admin-order-badge--${selectedOrder.status}`}>{getOrderStatusLabel(selectedOrder.status, 'admin')}</span>
                  {normalizeReviewStatus(selectedOrder.reviewStatus) === 'under_review' && (
                    <span className="admin-order-badge admin-order-badge--review">Under Review</span>
                  )}
                </div>
              </div>

              <div className="admin-order-detail-meta">
                <div>
                  <span>Delivery</span>
                  <strong>{selectedOrder.deliveryMethod === 'delivery' ? 'Delivery' : 'Pickup'}</strong>
                </div>
                <div>
                  <span>Payment</span>
                  <strong>{String(selectedOrder.paymentMethod || 'cash').toLowerCase() === 'online' ? 'Online' : 'Cash'}</strong>
                </div>
                <div>
                  <span>Distance</span>
                  <strong>{selectedOrder.deliveryDistanceKm != null ? `${Number(selectedOrder.deliveryDistanceKm).toFixed(1)} km` : 'N/A'}</strong>
                </div>
                <div>
                  <span>Revenue</span>
                  <strong>{selectedOrder.total || formatCurrency(selectedOrder.totalAmount)}</strong>
                </div>
              </div>

              {renderStatusRibbon(selectedOrder)}

              <div className="admin-order-detail-block">
                <div className="admin-order-detail-block-header">
                  <h3>Items</h3>
                </div>
                <div className="admin-order-items">
                  {(selectedOrder.lineItems || []).map((item) => (
                    <div key={`${selectedOrder.id}-${item.id || item.productId || item.name}`} className="admin-order-item-row">
                      <div>
                        <strong>{item.name}</strong>
                        <p>{item.quantity} x {formatCurrency(item.price)}</p>
                      </div>
                      <span>{formatCurrency(item.lineTotal || ((Number(item.price) || 0) * (Number(item.quantity) || 0)))}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedOrder.reviewStatus === 'under_review' && selectedOrder.latestIssueReport && (
                <div className="admin-order-detail-block admin-order-detail-block--review">
                  <div className="admin-order-detail-block-header">
                    <h3>Issue report</h3>
                    <Link to="/admin/reports" className="admin-order-link">Open reports</Link>
                  </div>
                  <p className="admin-order-report-copy">{selectedOrder.latestIssueReport.description}</p>
                  <div className="admin-order-report-meta">
                    <div>
                      <span>Customer</span>
                      <strong>{selectedOrder.latestIssueReport.customerName || 'Customer'}</strong>
                    </div>
                    <div>
                      <span>Submitted</span>
                      <strong>{formatDateTime(selectedOrder.latestIssueReport.detectionDate || selectedOrder.latestIssueReport.createdAt)}</strong>
                    </div>
                  </div>
                </div>
              )}

              {selectedOrderNotifications.length > 0 && (
                <div className="admin-order-detail-block">
                  <div className="admin-order-detail-block-header">
                    <h3>Notifications</h3>
                  </div>
                  <div className="admin-order-notifications">
                    {selectedOrderNotifications.map((notification, index) => (
                      <div key={`${selectedOrder.id}-notification-${index}`} className="admin-order-notification-row">
                        <BellRing size={16} />
                        <div>
                          <strong>{notification.message}</strong>
                          <p>{formatDateTime(notification.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedOrderReports.length > 0 && normalizeReviewStatus(selectedOrder.reviewStatus) !== 'under_review' && (
                <div className="admin-order-detail-block">
                  <div className="admin-order-detail-block-header">
                    <h3>Recent reports</h3>
                  </div>
                  <div className="admin-order-reports">
                    {selectedOrderReports.map((report) => (
                      <div key={report.id} className="admin-order-report-card">
                        <strong>{report.issueType.replace(/_/g, ' ')}</strong>
                        <p>{report.description}</p>
                        <span>{getReviewStatusLabel(report.reviewStatus)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="admin-order-actions">
                {nextAction && (
                  <button
                    type="button"
                    className="admin-order-action-btn admin-order-action-btn--primary"
                    onClick={() => void updateStatus(selectedOrder, nextAction.nextStatus)}
                    disabled={loadingStatus || loadingCancel}
                  >
                    {loadingStatus ? <Loader2 size={16} className="spin" /> : <nextAction.icon size={16} />}
                    {loadingStatus ? 'Updating...' : nextAction.label}
                  </button>
                )}

                {canStaffCancelOrder(selectedOrder) && (
                  <button
                    type="button"
                    className="admin-order-action-btn admin-order-action-btn--danger"
                    onClick={() => void handleCancel(selectedOrder)}
                    disabled={loadingStatus || loadingCancel}
                  >
                    {loadingCancel ? <Loader2 size={16} className="spin" /> : <Undo2 size={16} />}
                    {loadingCancel ? 'Cancelling...' : 'Cancel Order'}
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      </section>
    </div>
  );
};

export default AdminOrders;

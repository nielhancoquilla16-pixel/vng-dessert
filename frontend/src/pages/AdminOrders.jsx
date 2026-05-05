import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useOrders } from '../context/OrderContext';
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

const formatCurrency = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

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
    return order.total;
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
  const { orders, isOrdersLoading, updateOrderStatus } = useOrders();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [pageError, setPageError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState('');

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
                    <DetailBox
                      label="Revenue"
                      value={getOrderTotal(selectedOrder)}
                      className="col-span-2"
                    />
                  </div>

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
      </div>
    </div>
  );
};

export default AdminOrders;

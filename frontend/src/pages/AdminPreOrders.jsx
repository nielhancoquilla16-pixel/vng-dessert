import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Package2,
  Search,
  Store,
  Truck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { usePreOrders } from '../context/PreOrderContext';
import {
  formatPreOrderDateTime,
  getPreOrderMethodLabel,
  getPreOrderStatusLabel,
  getPreOrderStatusRank,
  normalizePreOrderStatus,
} from '../utils/preOrders';
import './AdminPreOrders.css';

const FILTERS = ['all', 'pending', 'confirmed', 'completed', 'rejected'];

const STATUS_CLASS_NAMES = {
  pending: 'admin-preorders-status--pending',
  confirmed: 'admin-preorders-status--confirmed',
  completed: 'admin-preorders-status--completed',
  rejected: 'admin-preorders-status--rejected',
};

const getScheduleTimestamp = (preOrder) => {
  const parsed = new Date(`${preOrder?.scheduledDate || ''}T${preOrder?.scheduledTime || '00:00'}`);
  return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
};

const AdminPreOrders = () => {
  const { preOrders, isPreOrdersLoading, updatePreOrderStatus } = usePreOrders();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedPreOrderId, setSelectedPreOrderId] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [pageError, setPageError] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);
  const [rejectionReasons, setRejectionReasons] = useState({});

  const filteredPreOrders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filterValue = normalizePreOrderStatus(selectedFilter);

    return [...preOrders]
      .filter((preOrder) => {
        const status = normalizePreOrderStatus(preOrder.status);
        const statusMatches = selectedFilter === 'all' || status === filterValue;
        const searchMatches = !normalizedSearch
          || String(preOrder.customerName || '').toLowerCase().includes(normalizedSearch)
          || String(preOrder.phoneNumber || '').toLowerCase().includes(normalizedSearch)
          || String(preOrder.productName || '').toLowerCase().includes(normalizedSearch)
          || String(preOrder.address || '').toLowerCase().includes(normalizedSearch);

        return statusMatches && searchMatches;
      })
      .sort((left, right) => {
        const leftSchedule = getScheduleTimestamp(left);
        const rightSchedule = getScheduleTimestamp(right);

        if (leftSchedule !== rightSchedule) {
          return leftSchedule - rightSchedule;
        }

        const leftRank = getPreOrderStatusRank(left.status);
        const rightRank = getPreOrderStatusRank(right.status);
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
      });
  }, [preOrders, searchTerm, selectedFilter]);

  useEffect(() => {
    if (!selectedPreOrderId && filteredPreOrders.length > 0) {
      setSelectedPreOrderId(filteredPreOrders[0].id);
      return;
    }

    if (selectedPreOrderId && !filteredPreOrders.some((preOrder) => preOrder.id === selectedPreOrderId)) {
      setSelectedPreOrderId(filteredPreOrders[0]?.id || '');
    }
  }, [filteredPreOrders, selectedPreOrderId]);

  const selectedPreOrder = useMemo(() => (
    filteredPreOrders.find((preOrder) => preOrder.id === selectedPreOrderId) || filteredPreOrders[0] || null
  ), [filteredPreOrders, selectedPreOrderId]);

  const summaryCards = useMemo(() => {
    const pendingCount = preOrders.filter((preOrder) => normalizePreOrderStatus(preOrder.status) === 'pending').length;
    const confirmedCount = preOrders.filter((preOrder) => normalizePreOrderStatus(preOrder.status) === 'confirmed').length;
    const completedCount = preOrders.filter((preOrder) => normalizePreOrderStatus(preOrder.status) === 'completed').length;
    const rejectedCount = preOrders.filter((preOrder) => normalizePreOrderStatus(preOrder.status) === 'rejected').length;

    return [
      { label: 'All Pre-Orders', value: preOrders.length, helper: 'Separate from regular orders' },
      { label: 'Pending', value: pendingCount, helper: 'Waiting for approval' },
      { label: 'Confirmed', value: confirmedCount, helper: 'Scheduled and accepted' },
      { label: 'Completed', value: completedCount, helper: 'Fulfilled successfully' },
      { label: 'Rejected', value: rejectedCount, helper: 'Declined requests' },
    ];
  }, [preOrders]);

  const setRejectionReason = (preOrderId, value) => {
    setRejectionReasons((current) => ({
      ...current,
      [preOrderId]: value,
    }));
  };

  const handleStatusUpdate = async (preOrder, nextStatus) => {
    const normalizedNextStatus = normalizePreOrderStatus(nextStatus);
    const reason = String(rejectionReasons[preOrder.id] || '').trim();

    if (normalizedNextStatus === 'rejected' && !reason) {
      setPageError('Please add a rejection reason before rejecting this pre-order.');
      return;
    }

    setLoadingAction({ preOrderId: preOrder.id, status: normalizedNextStatus });
    setPageError('');

    try {
      await updatePreOrderStatus(preOrder.id, normalizedNextStatus, reason);
      setPageNotice(`Pre-order for ${preOrder.productName} is now ${getPreOrderStatusLabel(normalizedNextStatus)}.`);
      if (normalizedNextStatus !== 'rejected') {
        setRejectionReason(preOrder.id, '');
      }
    } catch (error) {
      setPageError(error.message || 'Unable to update this pre-order right now.');
    } finally {
      setLoadingAction(null);
    }
  };

  const selectedReason = selectedPreOrder ? (rejectionReasons[selectedPreOrder.id] || selectedPreOrder.rejectionReason || '') : '';
  const selectedStatus = normalizePreOrderStatus(selectedPreOrder?.status || 'pending');

  return (
    <div className="admin-preorders-page">
      <section className="admin-preorders-hero">
        <div>
          <p className="admin-preorders-kicker">Schedule Management</p>
          <h1>Pre-Orders</h1>
        </div>
        <div className="admin-preorders-hero-pill">
          <CalendarDays size={22} />
          <div>
            <strong>{preOrders.length}</strong>
            <span>pre-orders tracked</span>
          </div>
        </div>
      </section>

      {(pageNotice || pageError) && (
        <section className="admin-preorders-alerts" aria-live="polite">
          {pageNotice && (
            <div className="admin-preorders-alert admin-preorders-alert--success">
              <CheckCircle2 size={18} />
              <span>{pageNotice}</span>
            </div>
          )}
          {pageError && (
            <div className="admin-preorders-alert admin-preorders-alert--error">
              <XCircle size={18} />
              <span>{pageError}</span>
            </div>
          )}
        </section>
      )}

      <section className="admin-preorders-summary">
        {summaryCards.map((card) => (
          <article key={card.label} className="admin-preorders-summary-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.helper}</p>
          </article>
        ))}
      </section>

      <section className="admin-preorders-controls">
        <div className="admin-preorders-search">
          <Search size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search customer, product, contact, or address"
          />
        </div>

        <div className="admin-preorders-filter-row">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`admin-preorders-filter ${selectedFilter === filter ? 'is-active' : ''}`}
              onClick={() => setSelectedFilter(filter)}
            >
              {filter === 'all' ? 'All' : getPreOrderStatusLabel(filter)}
            </button>
          ))}
        </div>
      </section>

      <section className="admin-preorders-layout">
        <div className="admin-preorders-list">
          <div className="admin-preorders-table-head">
            <span>Customer</span>
            <span>Product</span>
            <span>Schedule</span>
            <span>Method</span>
            <span>Status</span>
          </div>

          {isPreOrdersLoading ? (
            <div className="admin-preorders-empty">
              <Loader2 size={22} className="spin" />
              <p>Loading pre-orders...</p>
            </div>
          ) : filteredPreOrders.length === 0 ? (
            <div className="admin-preorders-empty">
              <Package2 size={22} />
              <p>No pre-orders match the current search or filter.</p>
            </div>
          ) : (
            filteredPreOrders.map((preOrder) => (
              <button
                key={preOrder.id}
                type="button"
                className={`admin-preorders-row ${selectedPreOrder?.id === preOrder.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedPreOrderId(preOrder.id)}
              >
                <div>
                  <strong>{preOrder.customerName}</strong>
                  <span>{preOrder.phoneNumber}</span>
                </div>
                <div>
                  <strong>{preOrder.productName}</strong>
                  <span>Qty {preOrder.quantity}</span>
                </div>
                <div>
                  <strong>{formatPreOrderDateTime(preOrder.scheduledDate, preOrder.scheduledTime)}</strong>
                  <span>{preOrder.deliveryMethod === 'pickup' ? 'Pickup schedule' : 'Delivery schedule'}</span>
                </div>
                <div>
                  <strong>{getPreOrderMethodLabel(preOrder.deliveryMethod)}</strong>
                  <span>{preOrder.deliveryMethod === 'pickup' ? 'Store handoff' : 'Cash payment'}</span>
                </div>
                <div>
                  <span className={`admin-preorders-status ${STATUS_CLASS_NAMES[normalizePreOrderStatus(preOrder.status)] || ''}`}>
                    {getPreOrderStatusLabel(preOrder.status)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        <aside className="admin-preorders-detail">
          {!selectedPreOrder ? (
            <div className="admin-preorders-empty admin-preorders-empty--detail">
              <CalendarDays size={26} />
              <p>Select a pre-order to review the customer details and schedule.</p>
            </div>
          ) : (
            <>
              <div className="admin-preorders-detail-header">
                <div>
                  <p className="admin-preorders-kicker">Selected Pre-Order</p>
                  <h2>{selectedPreOrder.productName}</h2>
                </div>
                <span className={`admin-preorders-status ${STATUS_CLASS_NAMES[selectedStatus] || ''}`}>
                  {getPreOrderStatusLabel(selectedStatus)}
                </span>
              </div>

              <div className="admin-preorders-detail-grid">
                <article className="admin-preorders-detail-card">
                  <div className="admin-preorders-detail-card-title">
                    <UserRound size={16} />
                    <span>Customer Details</span>
                  </div>
                  <strong>{selectedPreOrder.customerName}</strong>
                  <p>{selectedPreOrder.phoneNumber}</p>
                  <p>{selectedPreOrder.address}</p>
                </article>

                <article className="admin-preorders-detail-card">
                  <div className="admin-preorders-detail-card-title">
                    <Package2 size={16} />
                    <span>Order Details</span>
                  </div>
                  <strong>{selectedPreOrder.productName}</strong>
                  <p>Quantity: {selectedPreOrder.quantity}</p>
                  <p>Method: {getPreOrderMethodLabel(selectedPreOrder.deliveryMethod)}</p>
                </article>

                <article className="admin-preorders-detail-card">
                  <div className="admin-preorders-detail-card-title">
                    <Clock3 size={16} />
                    <span>Scheduled Date & Time</span>
                  </div>
                  <strong>{formatPreOrderDateTime(selectedPreOrder.scheduledDate, selectedPreOrder.scheduledTime)}</strong>
                  <p>
                    Preferred: {formatPreOrderDateTime(selectedPreOrder.preferredOrderDate, selectedPreOrder.preferredOrderTime)}
                  </p>
                  {selectedPreOrder.deliveryMethod === 'pickup' && (
                    <p>
                      Pickup: {formatPreOrderDateTime(selectedPreOrder.pickupDate, selectedPreOrder.pickupTime)}
                    </p>
                  )}
                </article>

                <article className="admin-preorders-detail-card">
                  <div className="admin-preorders-detail-card-title">
                    {selectedPreOrder.deliveryMethod === 'pickup' ? <Store size={16} /> : <Truck size={16} />}
                    <span>Fulfillment</span>
                  </div>
                  <strong>{getPreOrderMethodLabel(selectedPreOrder.deliveryMethod)}</strong>
                  <p>{selectedPreOrder.deliveryMethod === 'pickup' ? 'Store pickup required.' : 'Cash on delivery will be collected upon handoff.'}</p>
                  {selectedPreOrder.rejectionReason && (
                    <p className="admin-preorders-rejection-copy">Latest rejection note: {selectedPreOrder.rejectionReason}</p>
                  )}
                </article>
              </div>

              {selectedStatus !== 'completed' && (
                <div className="admin-preorders-action-panel">
                  <label className="admin-preorders-reason-field">
                    <span>Rejection Reason</span>
                    <textarea
                      value={selectedReason}
                      onChange={(event) => setRejectionReason(selectedPreOrder.id, event.target.value)}
                      placeholder="Explain why this pre-order is being rejected."
                      rows="3"
                    />
                  </label>

                  <div className="admin-preorders-actions">
                    {selectedStatus !== 'confirmed' && selectedStatus !== 'completed' && (
                      <button
                        type="button"
                        className="admin-preorders-action admin-preorders-action--primary"
                        onClick={() => void handleStatusUpdate(selectedPreOrder, 'confirmed')}
                        disabled={loadingAction?.preOrderId === selectedPreOrder.id}
                      >
                        {loadingAction?.preOrderId === selectedPreOrder.id && loadingAction?.status === 'confirmed'
                          ? <Loader2 size={16} className="spin" />
                          : <CheckCircle2 size={16} />}
                        Approve
                      </button>
                    )}

                    {selectedStatus !== 'pending' && selectedStatus !== 'completed' && (
                      <button
                        type="button"
                        className="admin-preorders-action admin-preorders-action--ghost"
                        onClick={() => void handleStatusUpdate(selectedPreOrder, 'pending')}
                        disabled={loadingAction?.preOrderId === selectedPreOrder.id}
                      >
                        {loadingAction?.preOrderId === selectedPreOrder.id && loadingAction?.status === 'pending'
                          ? <Loader2 size={16} className="spin" />
                          : <Clock3 size={16} />}
                        Set Pending
                      </button>
                    )}

                    {selectedStatus !== 'completed' && selectedStatus !== 'rejected' && (
                      <button
                        type="button"
                        className="admin-preorders-action admin-preorders-action--success"
                        onClick={() => void handleStatusUpdate(selectedPreOrder, 'completed')}
                        disabled={loadingAction?.preOrderId === selectedPreOrder.id}
                      >
                        {loadingAction?.preOrderId === selectedPreOrder.id && loadingAction?.status === 'completed'
                          ? <Loader2 size={16} className="spin" />
                          : <Package2 size={16} />}
                        Mark Completed
                      </button>
                    )}

                    {selectedStatus !== 'rejected' && selectedStatus !== 'completed' && (
                      <button
                        type="button"
                        className="admin-preorders-action admin-preorders-action--danger"
                        onClick={() => void handleStatusUpdate(selectedPreOrder, 'rejected')}
                        disabled={loadingAction?.preOrderId === selectedPreOrder.id}
                      >
                        {loadingAction?.preOrderId === selectedPreOrder.id && loadingAction?.status === 'rejected'
                          ? <Loader2 size={16} className="spin" />
                          : <XCircle size={16} />}
                        Reject
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="admin-preorders-notifications">
                <h3>Activity</h3>
                {selectedPreOrder.notifications?.length ? (
                  selectedPreOrder.notifications.slice().reverse().map((notification, index) => (
                    <div key={`${selectedPreOrder.id}-notification-${index}`} className="admin-preorders-notification-item">
                      <strong>{notification.message}</strong>
                      <span>{new Date(notification.createdAt || '').toLocaleString()}</span>
                    </div>
                  ))
                ) : (
                  <p className="admin-preorders-empty-copy">No activity recorded for this pre-order yet.</p>
                )}
              </div>
            </>
          )}
        </aside>
      </section>
    </div>
  );
};

export default AdminPreOrders;

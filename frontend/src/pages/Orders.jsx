import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCircle2, Package, QrCode, Upload, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import './Orders.css';

const MAX_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024;
const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready for Pickup',
  processing: 'Processing',
  completed: 'Completed',
  received: 'Received',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const formatDateLabel = (value = '') => {
  if (!value) {
    return 'Recently';
  }

  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
};

const getQrImageUrl = (value = '') => (
  `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(value)}`
);

const readImageFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Unable to read the selected image.'));
  reader.readAsDataURL(file);
});

const validateReceiptImageFile = (file) => {
  if (!file) {
    return;
  }

  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Only PNG and JPG/JPEG files are supported.');
  }

  if (file.size > MAX_RECEIPT_IMAGE_BYTES) {
    throw new Error('Receipt images must be 5MB or smaller.');
  }
};

const getStatusLabel = (status = '') => ORDER_STATUS_LABELS[String(status || '').toLowerCase()] || String(status || 'pending');

const isPickupCashOrder = (order = {}) => (
  String(order.deliveryMethod || '').toLowerCase() === 'pickup'
  && String(order.paymentMethod || '').toLowerCase() === 'cash'
);

const defaultDraft = () => ({
  previewUrl: '',
  fileName: '',
  error: '',
  isSubmitting: false,
});

const Orders = () => {
  const { loggedInCustomer } = useAuth();
  const { orders, refreshOrders, markOrderAsReceived, isOrdersLoading } = useOrders();
  const [receiptDrafts, setReceiptDrafts] = useState({});
  const fileInputRefs = useRef({});

  useEffect(() => {
    if (!loggedInCustomer) {
      return undefined;
    }

    let isActive = true;

    const syncOrders = async () => {
      try {
        await refreshOrders();
      } catch {
        if (!isActive) {
          return;
        }
      }
    };

    syncOrders();

    const intervalId = window.setInterval(syncOrders, 15000);
    const handleFocus = () => {
      syncOrders();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loggedInCustomer, refreshOrders]);

  const accountUsername = loggedInCustomer?.username?.toLowerCase?.() || '';
  const accountFullName = (loggedInCustomer?.fullName || '').trim().toLowerCase();

  const myOrders = useMemo(() => (
    orders.filter((order) => {
      const savedUsername = (order.customerUsername || '').toLowerCase();
      const fallbackName = (order.customer || '').toLowerCase();

      return savedUsername === accountUsername
        || fallbackName === accountUsername
        || (accountFullName && fallbackName === accountFullName);
    })
  ), [accountFullName, accountUsername, orders]);

  const readyNotifications = myOrders.filter((order) => (
    order.readyNotifiedAt
    && !order.receiptReceivedAt
    && ['ready', 'completed'].includes(order.status)
    && isPickupCashOrder(order)
  ));

  const handleReceiptFileSelection = async (orderId, file) => {
    try {
      validateReceiptImageFile(file);
      const previewUrl = await readImageFileAsDataUrl(file);

      setReceiptDrafts((current) => ({
        ...current,
        [orderId]: {
          ...defaultDraft(),
          previewUrl,
          fileName: file.name,
        },
      }));
    } catch (error) {
      setReceiptDrafts((current) => ({
        ...current,
        [orderId]: {
          ...(current[orderId] || defaultDraft()),
          error: error.message || 'Unable to use that image file.',
          isSubmitting: false,
        },
      }));
    }
  };

  const clearReceiptDraft = (orderId) => {
    setReceiptDrafts((current) => ({
      ...current,
      [orderId]: defaultDraft(),
    }));

    if (fileInputRefs.current[orderId]) {
      fileInputRefs.current[orderId].value = '';
    }
  };

  const handleMarkAsReceived = async (order) => {
    const draft = receiptDrafts[order.id] || defaultDraft();

    setReceiptDrafts((current) => ({
      ...current,
      [order.id]: {
        ...draft,
        isSubmitting: true,
        error: '',
      },
    }));

    try {
      await markOrderAsReceived(order.id, draft.previewUrl || '');
      clearReceiptDraft(order.id);
      await refreshOrders();
    } catch (error) {
      setReceiptDrafts((current) => ({
        ...current,
        [order.id]: {
          ...(current[order.id] || defaultDraft()),
          error: error.message || 'Unable to mark the order as received right now.',
          isSubmitting: false,
        },
      }));
    }
  };

  if (!loggedInCustomer) {
    return (
      <div className="orders-page-shell">
        <div className="orders-empty-card">
          <h2>My Orders</h2>
          <p>Please log in to view your orders and track their status.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-page-shell">
      <section className="orders-page-hero">
        <div>
          <p className="orders-eyebrow">Track and confirm</p>
          <h1>My Orders</h1>
          <p className="orders-hero-copy">
            Check your pickup QR code, see when your order is ready, and confirm receipt once you’ve picked it up.
          </p>
        </div>
        <div className="orders-summary-chip">
          <span>Total Orders</span>
          <strong>{myOrders.length}</strong>
        </div>
      </section>

      {readyNotifications.length > 0 && (
        <section className="orders-notifications">
          {readyNotifications.map((order) => (
            <div key={`notify-${order.id}`} className="orders-notification-card">
              <Bell size={18} />
              <div>
                <strong>{order.displayId || order.orderCode || order.id}</strong>
                <p>{order.readyNotificationMessage || 'Your order is ready for pickup. Please proceed to the cashier and present your QR code.'}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="orders-list-shell">
        {isOrdersLoading && myOrders.length === 0 ? (
          <div className="orders-empty-state">
            <Package size={44} />
            <p>Loading your orders...</p>
          </div>
        ) : myOrders.length === 0 ? (
          <div className="orders-empty-state">
            <Package size={44} />
            <p>You haven’t placed any orders yet.</p>
          </div>
        ) : (
          <div className="orders-stack">
            {myOrders.map((order) => {
              const draft = receiptDrafts[order.id] || defaultDraft();
              const canShowQr = Boolean(order.qrActive);
              const canConfirmReceipt = order.status === 'completed' && !order.receiptReceivedAt;
              const orderStatusLabel = getStatusLabel(order.status);

              return (
                <article key={order.id} className="order-card">
                  <div className="order-card-header">
                    <div>
                      <p className="order-card-kicker">Order ID</p>
                      <h2>{order.displayId || order.orderCode || order.id}</h2>
                      <p className="order-card-meta">{formatDateLabel(order.createdAt)}</p>
                    </div>

                    <div className="order-card-total-block">
                      <span>{order.total}</span>
                      <strong className={`order-status-pill status-${order.status}`}>{orderStatusLabel}</strong>
                    </div>
                  </div>

                  <div className="order-items-block">
                    <h3>Items</h3>
                    <ul>
                      {(order.lineItems || []).map((item) => (
                        <li key={`${order.id}-${item.id || item.productId || item.name}`}>
                          <div>
                            <strong>{item.name}</strong>
                            <span>{item.quantity} x PHP {Number(item.price || 0).toFixed(2)}</span>
                          </div>
                          <strong>PHP {Number(item.lineTotal || (item.quantity * item.price) || 0).toFixed(2)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="order-details-grid">
                    <div className="order-detail-card">
                      <span>Fulfillment</span>
                      <strong>{order.subtext || 'Pickup'}</strong>
                    </div>
                    <div className="order-detail-card">
                      <span>Status</span>
                      <strong>{orderStatusLabel}</strong>
                    </div>
                    <div className="order-detail-card">
                      <span>Payment</span>
                      <strong>{order.paymentMethod === 'cash' ? 'Cash on Pickup' : order.paymentMethod}</strong>
                    </div>
                  </div>

                  {order.readyNotifiedAt && (
                    <div className="ready-notification-banner">
                      <Bell size={18} />
                      <div>
                        <strong>Ready for pickup</strong>
                        <p>{order.readyNotificationMessage || 'Your order is ready for pickup. Please proceed to the cashier and present your QR code.'}</p>
                      </div>
                    </div>
                  )}

                  {canShowQr && (
                    <div className="order-qr-panel">
                      <div className="order-qr-header">
                        <div>
                          <p className="order-card-kicker">Pickup QR</p>
                          <h3>Show this code to the cashier</h3>
                        </div>
                        <QrCode size={20} />
                      </div>

                      <div className="order-qr-body">
                        <img
                          src={getQrImageUrl(order.orderCode || order.displayId || order.id)}
                          alt={`QR code for order ${order.displayId || order.orderCode || order.id}`}
                          className="order-qr-image"
                        />
                        <div>
                          <p className="order-qr-code-label">Order ID</p>
                          <strong>{order.displayId || order.orderCode || order.id}</strong>
                          <p className="order-qr-note">
                            This QR stays active until the cashier confirms the order.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {canConfirmReceipt && (
                    <div className="receipt-panel">
                      <div className="receipt-panel-header">
                        <div>
                          <p className="order-card-kicker">Confirm receipt</p>
                          <h3>Mark as Received</h3>
                        </div>
                        <CheckCircle2 size={20} />
                      </div>

                      <p className="receipt-help">
                        You can submit without an image, or attach a JPG/PNG proof first. Preview appears before submission.
                      </p>

                      <input
                        ref={(node) => {
                          fileInputRefs.current[order.id] = node;
                        }}
                        type="file"
                        accept="image/png,image/jpeg"
                        className="receipt-file-input"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            handleReceiptFileSelection(order.id, file);
                          }
                        }}
                      />

                      {draft.previewUrl && (
                        <div className="receipt-preview">
                          <img src={draft.previewUrl} alt="Receipt preview" />
                          <div className="receipt-preview-meta">
                            <strong>{draft.fileName || 'Selected receipt image'}</strong>
                            <button type="button" className="receipt-clear-button" onClick={() => clearReceiptDraft(order.id)}>
                              <X size={16} /> Remove image
                            </button>
                          </div>
                        </div>
                      )}

                      {draft.error && <div className="receipt-error">{draft.error}</div>}

                      <button
                        type="button"
                        className="receipt-submit-button"
                        onClick={() => handleMarkAsReceived(order)}
                        disabled={draft.isSubmitting}
                      >
                        <Upload size={16} />
                        {draft.isSubmitting ? 'Submitting...' : 'Mark as Received'}
                      </button>
                    </div>
                  )}

                  {order.receiptReceivedAt && (
                    <div className="received-proof-panel">
                      <div className="received-proof-header">
                        <CheckCircle2 size={18} />
                        <strong>Received</strong>
                      </div>
                      <p>Confirmed on {formatDateLabel(order.receiptReceivedAt)}</p>
                      {order.receiptImageUrl && (
                        <img
                          src={order.receiptImageUrl}
                          alt="Receipt proof"
                          className="receipt-proof-image"
                        />
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default Orders;

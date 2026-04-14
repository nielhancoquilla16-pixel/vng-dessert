import React, { useMemo } from 'react';
import { QrCode, ReceiptText } from 'lucide-react';
import { generateQrDataUrl } from '../utils/qrCode';
import { getPaymentStatusLabel } from '../utils/orderWorkflow';
import './ReceiptSlip.css';

const RECEIPT_TAX_RATE = 0.12;
const logoSrc = `${import.meta.env.BASE_URL || '/'}logo.png`;

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
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getPaymentMethodLabel = (order = {}) => {
  const paymentMethod = String(order.paymentMethod || order.payment_method || '').toLowerCase();
  const deliveryMethod = String(order.deliveryMethod || order.delivery_method || '').toLowerCase();

  if (paymentMethod === 'online') {
    return 'Online Payment';
  }

  if (paymentMethod === 'gcash') {
    return 'GCash';
  }

  if (deliveryMethod === 'delivery') {
    return 'Cash on Delivery';
  }

  return 'Pay at Store';
};

const ReceiptSlip = ({
  order = null,
  receiptNumber = '',
  paymentStatus = '',
  paidAt = '',
  companyName = 'V&G Dessert',
  variant = 'default',
  documentTitle = '',
  documentSubtitle = '',
  statusLabel = '',
  paymentMethodLabel: paymentMethodLabelOverride = '',
  paymentSummary = null,
}) => {
  const receiptVariant = variant === 'thermal' ? 'thermal' : 'default';
  const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];
  const grossTotal = Number(order?.totalAmount ?? order?.totalPrice ?? 0) || 0;
  const subtotal = grossTotal > 0 ? grossTotal / (1 + RECEIPT_TAX_RATE) : 0;
  const taxAmount = grossTotal - subtotal;
  const orderId = order?.orderCode || order?.displayId || order?.orderId || order?.id || 'N/A';
  const paymentReference = receiptNumber
    || order?.paymentReceiptNumber
    || order?.paymentCheckoutReferenceNumber
    || orderId;
  const paymentStatusLabel = statusLabel || getPaymentStatusLabel({
    ...order,
    paymentCheckoutStatus: paymentStatus || order?.paymentCheckoutStatus || '',
  });
  const paymentMethodLabel = paymentMethodLabelOverride || getPaymentMethodLabel(order);
  const isPendingOnlineReference = paymentMethodLabel === 'Online Payment'
    && /^waiting for online payment$/i.test(paymentStatusLabel);
  const resolvedDocumentTitle = documentTitle || (isPendingOnlineReference ? 'Order Reference Slip' : 'Official Receipt');
  const resolvedDocumentSubtitle = documentSubtitle || (isPendingOnlineReference
    ? 'Reference slip before online payment'
    : String(order?.deliveryMethod || '').toLowerCase() === 'delivery'
      ? 'Delivery order receipt'
      : 'Pickup order receipt');
  const qrImage = useMemo(() => (
    order?.verificationRequired && order?.qrPayload && !order?.qrUsedAt
      ? generateQrDataUrl(order.qrPayload, 180)
      : ''
  ), [order?.verificationRequired, order?.qrPayload, order?.qrUsedAt]);
  const showQrPanel = receiptVariant !== 'thermal' || Boolean(qrImage) || Boolean(order?.verificationRequired);
  const showPaymentReceived = Boolean(
    paymentSummary
    && paymentSummary.receivedAmount !== undefined
    && paymentSummary.receivedAmount !== null
    && paymentSummary.receivedAmount !== ''
  );
  const showChangeAmount = Boolean(
    paymentSummary
    && paymentSummary.changeAmount !== undefined
    && paymentSummary.changeAmount !== null
    && paymentSummary.changeAmount !== ''
  );
  const paymentReceivedAmount = showPaymentReceived ? Number(paymentSummary.receivedAmount) || 0 : 0;
  const changeAmount = showChangeAmount ? Number(paymentSummary.changeAmount) || 0 : 0;
  const paymentReceivedLabel = paymentSummary?.receivedLabel || 'Payment received';
  const changeLabel = paymentSummary?.changeLabel || 'Change';

  const receiptDate = paidAt
    || order?.paymentCheckoutPaidAt
    || order?.updatedAt
    || order?.createdAt
    || new Date().toISOString();

  return (
    <section
      className={`receipt-shell${receiptVariant === 'thermal' ? ' receipt-shell--thermal' : ''}`}
      aria-label="Printable receipt"
    >
      <div className={`receipt-card${receiptVariant === 'thermal' ? ' receipt-card--thermal' : ''}`}>
        <header className="receipt-header">
          <div className="receipt-brand">
            <img src={logoSrc} alt={`${companyName} logo`} className="receipt-logo" />
            <div className="receipt-brand-copy">
              <p className="receipt-kicker">{resolvedDocumentTitle}</p>
              <h2>{companyName}</h2>
              <p>{resolvedDocumentSubtitle}</p>
            </div>
          </div>

          <div className={`receipt-status-badge ${
            /failed|cancelled|expired/.test(paymentStatusLabel.toLowerCase())
              ? 'is-danger'
              : isPendingOnlineReference
                ? 'is-warning'
                : 'is-success'
          }`}>
            {paymentStatusLabel}
          </div>
        </header>

        <div className={`receipt-meta-grid${receiptVariant === 'thermal' ? ' receipt-meta-grid--thermal' : ''}`}>
          <article className="receipt-meta-card">
            <span>Receipt No.</span>
            <strong>{paymentReference}</strong>
          </article>
          <article className="receipt-meta-card">
            <span>Order ID</span>
            <strong>{orderId}</strong>
          </article>
          <article className="receipt-meta-card">
            <span>Date</span>
            <strong>{formatDateTime(receiptDate)}</strong>
          </article>
          <article className="receipt-meta-card">
            <span>Payment</span>
            <strong>{paymentMethodLabel}</strong>
          </article>
        </div>

        <div className={`receipt-customer-grid${receiptVariant === 'thermal' ? ' receipt-customer-grid--thermal' : ''}`}>
          <article className="receipt-info-card">
            <span>Customer</span>
            <strong>{order?.customer || 'Customer'}</strong>
          </article>
          <article className="receipt-info-card">
            <span>Contact</span>
            <strong>{order?.phoneNumber || 'Not provided'}</strong>
          </article>
          <article className="receipt-info-card">
            <span>Pickup / Delivery</span>
            <strong>{order?.deliveryMethod === 'delivery' ? (order?.address || 'Delivery address') : 'Pick up at store'}</strong>
          </article>
        </div>

        <div className={`receipt-body-grid${receiptVariant === 'thermal' ? ' receipt-body-grid--thermal' : ''}${showQrPanel ? '' : ' receipt-body-grid--no-qr'}`}>
          <div className="receipt-items-panel">
            <div className="receipt-section-title">
              <ReceiptText size={16} />
              <span>Items</span>
            </div>

            <div className="receipt-table">
              <div className="receipt-table-head">
                <span>Qty</span>
                <span>Description</span>
                <span>Unit</span>
                <span>Amount</span>
              </div>

              {lineItems.length > 0 ? lineItems.map((item, index) => (
                <div key={`${orderId}-${item.id || item.productId || item.name || index}`} className="receipt-table-row">
                  <span className="receipt-cell receipt-cell--qty">{item.quantity}</span>
                  <span className="receipt-cell receipt-cell--description">
                    <strong>{item.name || 'Item'}</strong>
                    <small>{item.category || item.description || 'Dessert order item'}</small>
                  </span>
                  <span className="receipt-cell receipt-cell--amount">{formatCurrency(item.price)}</span>
                  <span className="receipt-cell receipt-cell--amount">{formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 0))}</span>
                </div>
              )) : (
                <div className="receipt-empty-state">No items available.</div>
              )}
            </div>
          </div>

          {showQrPanel && (
            <aside className="receipt-qr-panel">
              <div className="receipt-section-title">
                <QrCode size={16} />
                <span>Order QR</span>
              </div>

              {qrImage ? (
                <img
                  src={qrImage}
                  alt={`QR for order ${orderId}`}
                  className="receipt-qr-image"
                />
              ) : (
                <div className="receipt-qr-image receipt-qr-image--fallback">
                  QR unavailable
                </div>
              )}

              <p className="receipt-note">
                {isPendingOnlineReference
                  ? 'Use this QR code or Order ID as your reference while completing the online payment.'
                  : 'Present this receipt with the QR code or Order ID when claiming the order.'}
                {order?.verificationRequired
                  ? ' QR codes are one-time use only.'
                  : ' Staff can process this order manually if needed.'}
              </p>
            </aside>
          )}
        </div>

        <div className={`receipt-summary${receiptVariant === 'thermal' ? ' receipt-summary--thermal' : ''}`}>
          <div className="receipt-summary-row">
            <span>Subtotal</span>
            <strong>{formatCurrency(subtotal)}</strong>
          </div>
          <div className="receipt-summary-row">
            <span>Tax (12%)</span>
            <strong>{formatCurrency(taxAmount)}</strong>
          </div>
          {showPaymentReceived && (
            <div className="receipt-summary-row">
              <span>{paymentReceivedLabel}</span>
              <strong>{formatCurrency(paymentReceivedAmount)}</strong>
            </div>
          )}
          {showChangeAmount && (
            <div className="receipt-summary-row">
              <span>{changeLabel}</span>
              <strong>{formatCurrency(changeAmount)}</strong>
            </div>
          )}
          <div className="receipt-summary-row receipt-summary-row--total">
            <span>Total</span>
            <strong>{formatCurrency(grossTotal)}</strong>
          </div>
        </div>

        <footer className={`receipt-footer${receiptVariant === 'thermal' ? ' receipt-footer--thermal' : ''}`}>
          <p>
            {isPendingOnlineReference
              ? `Keep this reference slip for ${companyName}. It confirms that your Order ID and QR were generated before payment confirmation.`
              : `Thank you for ordering with ${companyName}. Please keep this receipt for pickup and reference.`}
          </p>
          <p>
            {isPendingOnlineReference
              ? 'Need help? Show this reference slip and Order ID to staff if you need payment assistance.'
              : 'Need help? Show this receipt and Order ID to staff at the counter.'}
          </p>
        </footer>
      </div>
    </section>
  );
};

export default ReceiptSlip;

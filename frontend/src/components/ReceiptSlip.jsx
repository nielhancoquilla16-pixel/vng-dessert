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
}) => {
  const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];
  const grossTotal = Number(order?.totalAmount ?? order?.totalPrice ?? 0) || 0;
  const subtotal = grossTotal > 0 ? grossTotal / (1 + RECEIPT_TAX_RATE) : 0;
  const taxAmount = grossTotal - subtotal;
  const orderId = order?.orderCode || order?.displayId || order?.orderId || order?.id || 'N/A';
  const paymentReference = receiptNumber
    || order?.paymentReceiptNumber
    || order?.paymentCheckoutReferenceNumber
    || orderId;
  const paymentStatusLabel = getPaymentStatusLabel({
    ...order,
    paymentCheckoutStatus: paymentStatus || order?.paymentCheckoutStatus || '',
  });
  const paymentMethodLabel = getPaymentMethodLabel(order);
  const qrImage = useMemo(() => (
    order?.verificationRequired && order?.qrPayload && !order?.qrUsedAt
      ? generateQrDataUrl(order.qrPayload, 180)
      : ''
  ), [order?.verificationRequired, order?.qrPayload, order?.qrUsedAt]);

  const receiptDate = paidAt
    || order?.paymentCheckoutPaidAt
    || order?.updatedAt
    || order?.createdAt
    || new Date().toISOString();

  return (
    <section className="receipt-shell" aria-label="Printable receipt">
      <div className="receipt-card">
        <header className="receipt-header">
          <div className="receipt-brand">
            <img src={logoSrc} alt={`${companyName} logo`} className="receipt-logo" />
            <div className="receipt-brand-copy">
              <p className="receipt-kicker">Official Receipt</p>
              <h2>{companyName}</h2>
              <p>{String(order?.deliveryMethod || '').toLowerCase() === 'delivery' ? 'Delivery order receipt' : 'Pickup order receipt'}</p>
            </div>
          </div>

          <div className={`receipt-status-badge ${/failed|cancelled|expired/.test(paymentStatusLabel.toLowerCase()) ? 'is-danger' : 'is-success'}`}>
            {paymentStatusLabel}
          </div>
        </header>

        <div className="receipt-meta-grid">
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

        <div className="receipt-customer-grid">
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

        <div className="receipt-body-grid">
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
              Present this receipt with the QR code or Order ID when claiming the order.
              {order?.verificationRequired
                ? ' QR codes are one-time use only.'
                : ' Staff can process this order manually if needed.'}
            </p>
          </aside>
        </div>

        <div className="receipt-summary">
          <div className="receipt-summary-row">
            <span>Subtotal</span>
            <strong>{formatCurrency(subtotal)}</strong>
          </div>
          <div className="receipt-summary-row">
            <span>Tax (12%)</span>
            <strong>{formatCurrency(taxAmount)}</strong>
          </div>
          <div className="receipt-summary-row receipt-summary-row--total">
            <span>Total</span>
            <strong>{formatCurrency(grossTotal)}</strong>
          </div>
        </div>

        <footer className="receipt-footer">
          <p>Thank you for ordering with {companyName}. Please keep this receipt for pickup and reference.</p>
          <p>Need help? Show this receipt and Order ID to staff at the counter.</p>
        </footer>
      </div>
    </section>
  );
};

export default ReceiptSlip;

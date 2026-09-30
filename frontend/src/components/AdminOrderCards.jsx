import { useEffect, useMemo, useState } from 'react';
import { Clock3, Package, QrCode, CircleDollarSign, ShoppingCart } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { resolveAssetUrl } from '../lib/publicUrl';
import { appUrl } from '../lib/appUrl';
import { formatCurrency } from '../utils/currency';
import { generateQrDataUrl } from '../utils/qrCode';
import { getItemSubtotal, getOrderPaymentSummary } from '../utils/adminOrderDetails';
import { normalizeOrderStatus } from '../utils/orderWorkflow';

export const OrderItemThumbnail = ({ item }) => {
  const { products } = useProducts();
  const product = products.find((entry) => String(entry.id) === String(item.productId || item.product_id || item.id));
  const src = resolveAssetUrl(item.imageUrl || item.image_url || item.image || item.product?.imageUrl || item.product?.image || product?.imageUrl || product?.image);
  const [failedSrc, setFailedSrc] = useState('');
  return (
    <span className="admin-orders-thumbnail">
      {src && src !== failedSrc
        ? <img src={src} alt="" loading="lazy" onError={() => setFailedSrc(src)} />
        : <Package size={22} aria-hidden="true" />}
    </span>
  );
};

export const OrderedItemsCard = ({ order }) => (
  <section className="admin-orders-section admin-orders-items-section" aria-labelledby="ordered-items-title">
    <h2 id="ordered-items-title" className="admin-orders-section-title"><ShoppingCart size={20} aria-hidden="true" />Ordered Items</h2>
    {!order.lineItems?.length ? <p className="admin-orders-muted">No items found.</p> : (
      <div className="admin-orders-items-list">
        {order.lineItems.map((item, index) => (
          <div className="admin-orders-item-row" key={`${item.id || item.productId || item.name}-${index}`}>
            <OrderItemThumbnail item={item} />
            <div className="admin-orders-item-copy">
              <strong className="admin-orders-item-name">{item.name || 'Unknown item'}</strong>
              <span className="admin-orders-item-subtext">{item.variant || item.variantName || item.size || 'Regular'}</span>
              <span className="admin-orders-item-subtext">{formatCurrency(item.price)} each</span>
            </div>
            <span className="admin-orders-item-quantity" aria-label={`Quantity ${item.quantity}`}>×{item.quantity}</span>
            <strong className="admin-orders-item-price" aria-label={`Item subtotal ${formatCurrency(getItemSubtotal(item))}`}>{formatCurrency(getItemSubtotal(item))}</strong>
          </div>
        ))}
      </div>
    )}
  </section>
);

export const PaymentSummaryCard = ({ order }) => {
  const payment = getOrderPaymentSummary(order);
  return (
    <section className="admin-orders-section admin-orders-payment" aria-labelledby="payment-summary-title">
      <h2 id="payment-summary-title" className="admin-orders-section-title"><CircleDollarSign size={20} aria-hidden="true" />Payment Summary</h2>
      <dl className="admin-orders-payment-lines">
        {[['Subtotal', payment.subtotal], ['Discount', payment.discount], ['Tax', payment.tax], ['Delivery Fee', payment.deliveryFee]].map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{formatCurrency(value)}</dd></div>
        ))}
        <div className="admin-orders-payment-total"><dt>Total</dt><dd>{formatCurrency(payment.total)}</dd></div>
      </dl>
    </section>
  );
};

export const OrderFeedbackReceiptCard = ({ order }) => {
  const feedbackToken = String(order.feedbackToken || '').trim();
  const feedbackUrl = feedbackToken && !['pending', 'cancelled', 'refunded'].includes(normalizeOrderStatus(order.status))
    ? appUrl(`/feedback/${encodeURIComponent(feedbackToken)}`)
    : '';
  const image = useMemo(() => feedbackUrl ? generateQrDataUrl(feedbackUrl, 220) : '', [feedbackUrl]);

  if (!image) return null;

  return (
    <section className="admin-orders-section admin-orders-feedback-receipt" aria-labelledby="receipt-feedback-title">
      <h2 id="receipt-feedback-title" className="admin-orders-section-title"><QrCode size={20} aria-hidden="true" />Feedback QR</h2>
      <div className="admin-orders-feedback-body">
        <a href={feedbackUrl} aria-label="Open this order's feedback form">
          <img src={image} alt={`Feedback QR for order ${order.displayId || order.orderCode || order.id}`} width="132" height="132" />
        </a>
        <div>
          <strong>We value your feedback</strong>
          <p className="admin-orders-muted">Scan this QR code to rate your experience after receiving your order.</p>
        </div>
      </div>
    </section>
  );
};

export const OrderQrCard = ({ order }) => {
  const [now, setNow] = useState(Date.now);
  const expiresAt = Date.parse(order.qrExpiresAt || '');
  const isClaimed = Boolean(order.qrUsedAt || order.qrClaimedAt);
  const isFinal = ['delivered', 'completed', 'cancelled', 'refunded'].includes(normalizeOrderStatus(order.status));
  const isExpired = !Number.isFinite(expiresAt) || expiresAt <= now;
  const isActive = Boolean(order.verificationRequired && order.qrPayload && !isClaimed && !isFinal && !isExpired);
  useEffect(() => {
    if (!isActive) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isActive]);
  const image = useMemo(() => isActive ? generateQrDataUrl(order.qrPayload, 160) : '', [isActive, order.qrPayload]);
  const expiryLabel = isClaimed ? 'Claimed — code already used'
    : isFinal ? 'Code inactive for this order'
      : !order.verificationRequired || !order.qrPayload ? 'No QR code available'
        : isExpired ? 'Code expired — regenerate in the customer area'
          : `Expires at ${new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} or when claimed`;
  return (
    <section className="admin-orders-section admin-orders-qr" aria-labelledby="order-qr-title">
      <h2 id="order-qr-title" className="admin-orders-section-title"><QrCode size={20} aria-hidden="true" />QR Code</h2>
      <div className="admin-orders-qr-body">
        {image ? <img src={image} alt="Order verification QR code" width="100" height="100" /> : <div className="admin-orders-qr-placeholder"><QrCode size={40} aria-hidden="true" /></div>}
        <div>
          <p className="admin-orders-muted">Present this code to staff to verify and claim the order. It is also available in the customer area.</p>
          <p className="admin-orders-qr-expiry"><Clock3 size={15} aria-hidden="true" />{expiryLabel}</p>
        </div>
      </div>
    </section>
  );
};

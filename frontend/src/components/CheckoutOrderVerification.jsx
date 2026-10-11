import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, QrCode } from 'lucide-react';
import { generateQrDataUrl } from '../utils/qrCode';

const CheckoutOrderVerification = ({ order }) => {
  const [now, setNow] = useState(Date.now);
  const expiresAt = Date.parse(order.qrExpiresAt || '');
  const hasExpiry = Number.isFinite(expiresAt);
  const hasExpired = hasExpiry && expiresAt <= now;
  const canShowQr = Boolean(order.verificationRequired && order.qrPayload && hasExpiry && !hasExpired && !order.qrUsedAt);
  const qrImage = useMemo(() => (
    canShowQr ? generateQrDataUrl(order.qrPayload, 220) : ''
  ), [canShowQr, order.qrPayload]);

  useEffect(() => {
    if (!hasExpiry || order.qrUsedAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasExpiry, order.qrUsedAt]);

  const remainingSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const countdown = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;
  const orderId = order.orderCode || order.displayId || order.id;

  return (
    <section className="checkout-verification-card" aria-labelledby="checkout-verification-title">
      <h2 id="checkout-verification-title"><QrCode size={26} aria-hidden="true" />Order QR and ID</h2>
      <div className="checkout-verification-body">
        <div className="checkout-verification-qr">
          {qrImage ? (
            <img src={qrImage} alt={`QR for order ${orderId}`} />
          ) : (
            <><QrCode size={36} aria-hidden="true" /><span>QR Unavailable</span></>
          )}
        </div>
        <div className="checkout-verification-details">
          <span className="checkout-verification-label">Order ID</span>
          <strong>{orderId}</strong>
          <p>Keep your Order ID and QR for order verification. Present them when claiming your order.</p>
          {order.qrUsedAt ? (
            <span className="checkout-verification-expiry"><Clock3 size={18} aria-hidden="true" />QR already used</span>
          ) : hasExpiry ? (
            <span className="checkout-verification-expiry">
              <Clock3 size={18} aria-hidden="true" />
              {hasExpired ? 'QR expired' : `Expires in ${countdown}`}
            </span>
          ) : null}
          {hasExpired && !order.qrUsedAt && <p className="checkout-verification-help">You can generate a new QR from your order details when needed.</p>}
        </div>
      </div>
    </section>
  );
};

export default CheckoutOrderVerification;

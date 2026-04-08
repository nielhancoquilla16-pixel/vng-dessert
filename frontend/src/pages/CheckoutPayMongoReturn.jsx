import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Clock3, Printer, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useOrders } from '../context/OrderContext';
import { useProducts } from '../context/ProductContext';
import { apiRequest } from '../lib/api';
import ReceiptSlip from '../components/ReceiptSlip';

const wait = (ms) => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

const CheckoutPayMongoReturn = ({ mode = 'success' }) => {
  const location = useLocation();
  const { loggedInCustomer, isAuthLoading } = useAuth();
  const { refreshRemoteCart } = useCart();
  const { refreshOrders } = useOrders();
  const { refreshProducts } = useProducts();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkout, setCheckout] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const referenceNumber = useMemo(() => (
    new URLSearchParams(location.search).get('reference') || ''
  ), [location.search]);
  const checkoutStage = useMemo(() => (
    new URLSearchParams(location.search).get('stage') || ''
  ), [location.search]);
  const isPaymentSelectionStage = checkoutStage === 'payment-selection';

  useEffect(() => {
    let isActive = true;

    const handleReturn = async () => {
      setIsLoading(true);
      setError('');

      if (!referenceNumber) {
        if (isActive) {
          setError('The PayMongo reference number is missing from the return URL.');
          setIsLoading(false);
        }
        return;
      }

      if (isAuthLoading) {
        return;
      }

      if (!loggedInCustomer) {
        if (isActive) {
          setError('Please log in again so we can verify your payment result.');
          setIsLoading(false);
        }
        return;
      }

      try {
        const loadCheckout = () => apiRequest(
          `/api/payments/checkouts/${encodeURIComponent(referenceNumber)}`,
          {},
          { auth: true },
        );

        const refreshCheckoutSideEffects = async (nextCheckout) => {
          if (!nextCheckout?.orderId) {
            return;
          }

          await Promise.allSettled([
            refreshOrders(),
            refreshRemoteCart(),
            refreshProducts(),
          ]);
        };

        if (mode === 'cancel') {
          let cancelledCheckout = null;

          try {
            cancelledCheckout = await apiRequest(`/api/payments/checkouts/${encodeURIComponent(referenceNumber)}/cancel`, {
              method: 'POST',
            }, {
              auth: true,
            });
          } catch (nextError) {
            if (nextError?.status === 409) {
              cancelledCheckout = await loadCheckout();
            } else {
              throw nextError;
            }
          }

          if (!isActive) {
            return;
          }

          setCheckout(cancelledCheckout);
          await refreshCheckoutSideEffects(cancelledCheckout);
          setIsLoading(false);
          return;
        }

        let latestCheckout = null;

        if (isPaymentSelectionStage) {
          latestCheckout = await loadCheckout();
        } else {
          for (let attempt = 0; attempt < 5; attempt += 1) {
            latestCheckout = await loadCheckout();

            if (latestCheckout?.status !== 'created') {
              break;
            }

            await wait(1500);
          }
        }

        if (!isActive) {
          return;
        }

        setCheckout(latestCheckout);

        await refreshCheckoutSideEffects(latestCheckout);
      } catch (nextError) {
        if (isActive) {
          setError(nextError.message || 'Unable to verify the PayMongo payment right now.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    handleReturn();

    return () => {
      isActive = false;
    };
  }, [checkoutStage, isAuthLoading, isPaymentSelectionStage, loggedInCustomer, mode, referenceNumber, refreshKey, refreshOrders, refreshProducts, refreshRemoteCart]);

  const checkoutStatus = checkout?.status || (mode === 'cancel' ? 'cancelled' : 'created');
  const hasReceipt = Boolean(checkout?.order);
  const isSuccessful = checkoutStatus === 'fulfilled' || (checkoutStatus === 'paid' && hasReceipt);
  const isFailed = checkoutStatus === 'cancelled' || checkoutStatus === 'failed' || checkoutStatus === 'expired';
  const isManualReview = checkoutStatus === 'paid' && !checkout?.orderId;
  const isStillProcessing = checkoutStatus === 'created';
  const isReferenceReady = isPaymentSelectionStage && isStillProcessing && hasReceipt;
  const canContinuePayment = Boolean(checkout?.checkoutUrl) && isStillProcessing;
  const checkoutStatusLabel = isSuccessful ? 'paid' : checkoutStatus.replace(/_/g, ' ');

  const statusColor = isReferenceReady
    ? '#1d4ed8'
    : isSuccessful
    ? '#166534'
    : isFailed
      ? '#991b1b'
      : isManualReview
        ? '#1d4ed8'
        : '#92400e';

  const statusBackground = isReferenceReady
    ? '#dbeafe'
    : isSuccessful
    ? '#dcfce7'
    : isFailed
      ? '#fee2e2'
      : isManualReview
        ? '#dbeafe'
        : '#fef3c7';

  const HeaderIcon = mode === 'cancel' && checkoutStatus === 'cancelled'
    ? XCircle
    : isReferenceReady
      ? CheckCircle2
    : isLoading || isStillProcessing
      ? Clock3
      : isFailed
        ? XCircle
        : CheckCircle2;

  const headerIconColor = mode === 'cancel' && checkoutStatus === 'cancelled'
    ? '#dc2626'
    : isReferenceReady
      ? '#2563eb'
    : isLoading || isStillProcessing
      ? '#d97706'
      : isFailed
        ? '#dc2626'
        : '#16a34a';

  const pageTitle = mode === 'cancel' && checkoutStatus === 'cancelled'
    ? 'Payment Cancelled'
    : isReferenceReady
      ? 'Order Reference Ready'
    : isSuccessful
      ? 'Payment Confirmed'
      : isManualReview
        ? 'Payment Received'
        : isFailed
          ? 'Payment Not Completed'
          : 'Checking Your Payment';

  const handlePrintReceipt = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div
      className="checkout-paymongo-return-page"
      style={{ maxWidth: '960px', margin: '2rem auto', padding: '0 1.25rem 2rem' }}
    >
      <div
        className="checkout-return-shell"
        style={{
          background: 'white',
          borderRadius: '1.5rem',
          padding: '2rem',
          boxShadow: '0 16px 40px rgba(15, 23, 42, 0.08)',
          border: '1px solid rgba(148, 163, 184, 0.16)',
        }}
      >
        <div className="checkout-return-header" style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: '1.25rem' }}>
          <HeaderIcon size={28} color={headerIconColor} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.9rem', color: '#0f172a' }}>
              {pageTitle}
            </h1>
            <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>
              Reference: {referenceNumber || 'Unavailable'}
            </p>
          </div>
        </div>

        {isLoading && (
          <div
            style={{
              borderRadius: '1rem',
              padding: '1rem 1.1rem',
              background: '#eff6ff',
              color: '#1d4ed8',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <Clock3 size={18} />
            {isPaymentSelectionStage
              ? 'Preparing your order reference and payment details.'
              : 'We\'re syncing your PayMongo checkout and finishing your order.'}
          </div>
        )}

        {!isLoading && error && (
          <div
            style={{
              borderRadius: '1rem',
              padding: '1rem 1.1rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              lineHeight: 1.6,
            }}
          >
            {error}
          </div>
        )}

        {!isLoading && error && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.5rem' }}>
            {!loggedInCustomer && (
              <Link className="btn-primary" to="/login" style={{ textDecoration: 'none' }}>
                Log In
              </Link>
            )}
            <Link
              to="/checkout"
              style={{
                textDecoration: 'none',
                padding: '0.9rem 1.2rem',
                borderRadius: '0.9rem',
                background: '#e2e8f0',
                color: '#0f172a',
                fontWeight: 700,
              }}
            >
              Back to Checkout
            </Link>
          </div>
        )}

        {!isLoading && !error && checkout && (
          <>
            <div
              className="checkout-return-status"
              style={{
                display: 'inline-flex',
                marginTop: '0.5rem',
                marginBottom: '1rem',
                padding: '0.4rem 0.85rem',
                borderRadius: '999px',
                background: statusBackground,
                color: statusColor,
                fontWeight: 700,
                textTransform: 'capitalize',
              }}
            >
              {checkoutStatusLabel}
            </div>

        {isReferenceReady && (
          <p className="checkout-return-help" style={{ color: '#0f172a', lineHeight: 1.7 }}>
            Your Order ID and QR code are ready below. Use them as your reference for payment verification and pickup validation, then continue to PayMongo when you're ready.
          </p>
        )}

        {isSuccessful && (
          <p className="checkout-return-help" style={{ color: '#0f172a', lineHeight: 1.7 }}>
            Your payment was confirmed and your printable receipt is ready below. You can also track the order from your orders page.
          </p>
        )}

            {isManualReview && (
              <p className="checkout-return-help" style={{ color: '#0f172a', lineHeight: 1.7 }}>
                PayMongo marked this checkout as paid, but the order still needs manual review on our side.
                {checkout.failureReason ? ` ${checkout.failureReason}` : ''}
              </p>
            )}

            {isStillProcessing && !isPaymentSelectionStage && (
              <p className="checkout-return-help" style={{ color: '#0f172a', lineHeight: 1.7 }}>
                We have your checkout reference, but PayMongo has not confirmed the final result yet. If you just completed the payment, wait a few seconds and refresh this status.
              </p>
            )}

            {isFailed && (
              <p className="checkout-return-help" style={{ color: '#0f172a', lineHeight: 1.7 }}>
                The payment was not completed. Any temporary online order from this checkout has been marked cancelled, and you can go back to checkout to try again.
              </p>
            )}

            {checkout.order && (
              <div style={{ marginTop: '1.25rem' }}>
                <ReceiptSlip
                  order={checkout.order}
                  receiptNumber={checkout.referenceNumber}
                  paymentStatus={checkoutStatus}
                  paidAt={checkout.paidAt || checkout.order.paymentCheckoutPaidAt || checkout.order.updatedAt || checkout.order.createdAt}
                />
              </div>
            )}

            <div
              className="checkout-return-actions"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.5rem' }}
            >
              {canContinuePayment && (
                <a
                  className="btn-primary"
                  href={checkout.checkoutUrl}
                  style={{ textDecoration: 'none' }}
                >
                  Continue to PayMongo
                </a>
              )}
              {isSuccessful && checkout?.order && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handlePrintReceipt}
                >
                  <Printer size={16} />
                  Print Receipt
                </button>
              )}
              {isStillProcessing && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setRefreshKey((current) => current + 1)}
                >
                  Refresh Status
                </button>
              )}
              <Link className="btn-primary" to="/orders" style={{ textDecoration: 'none' }}>
                View Orders
              </Link>
              <Link
                to="/checkout"
                style={{
                  textDecoration: 'none',
                  padding: '0.9rem 1.2rem',
                  borderRadius: '0.9rem',
                  background: '#e2e8f0',
                  color: '#0f172a',
                  fontWeight: 700,
                }}
              >
                Back to Checkout
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CheckoutPayMongoReturn;

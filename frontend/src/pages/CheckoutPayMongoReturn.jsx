import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useOrders } from '../context/OrderContext';
import { useProducts } from '../context/ProductContext';
import { apiRequest } from '../lib/api';

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

        for (let attempt = 0; attempt < 5; attempt += 1) {
          latestCheckout = await loadCheckout();

          if (latestCheckout?.status !== 'created') {
            break;
          }

          await wait(1500);
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
  }, [isAuthLoading, loggedInCustomer, mode, referenceNumber, refreshKey, refreshOrders, refreshProducts, refreshRemoteCart]);

  const checkoutStatus = checkout?.status || (mode === 'cancel' ? 'cancelled' : 'created');
  const isSuccessful = checkoutStatus === 'fulfilled';
  const isFailed = checkoutStatus === 'cancelled' || checkoutStatus === 'failed' || checkoutStatus === 'expired';
  const isManualReview = checkoutStatus === 'paid' && !checkout?.orderId;
  const isStillProcessing = checkoutStatus === 'created';

  const statusColor = isSuccessful
    ? '#166534'
    : isFailed
      ? '#991b1b'
      : isManualReview
        ? '#1d4ed8'
        : '#92400e';

  const statusBackground = isSuccessful
    ? '#dcfce7'
    : isFailed
      ? '#fee2e2'
      : isManualReview
        ? '#dbeafe'
        : '#fef3c7';

  const HeaderIcon = mode === 'cancel' && checkoutStatus === 'cancelled'
    ? XCircle
    : isLoading || isStillProcessing
      ? Clock3
      : isFailed
        ? XCircle
        : CheckCircle2;

  const headerIconColor = mode === 'cancel' && checkoutStatus === 'cancelled'
    ? '#dc2626'
    : isLoading || isStillProcessing
      ? '#d97706'
      : isFailed
        ? '#dc2626'
        : '#16a34a';

  const pageTitle = mode === 'cancel' && checkoutStatus === 'cancelled'
    ? 'Payment Cancelled'
    : isSuccessful
      ? 'Payment Confirmed'
      : isManualReview
        ? 'Payment Received'
        : isFailed
          ? 'Payment Not Completed'
          : 'Checking Your Payment';

  return (
    <div style={{ maxWidth: '880px', margin: '2rem auto', padding: '0 1.25rem 2rem' }}>
      <div
        style={{
          background: 'white',
          borderRadius: '1.5rem',
          padding: '2rem',
          boxShadow: '0 16px 40px rgba(15, 23, 42, 0.08)',
          border: '1px solid rgba(148, 163, 184, 0.16)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: '1.25rem' }}>
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
            We're syncing your PayMongo checkout and finishing your order.
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
              {checkoutStatus}
            </div>

            {isSuccessful && (
              <p style={{ color: '#0f172a', lineHeight: 1.7 }}>
                Your payment was confirmed and your order has been created successfully. You can now track it from your orders page.
              </p>
            )}

            {isManualReview && (
              <p style={{ color: '#0f172a', lineHeight: 1.7 }}>
                PayMongo marked this checkout as paid, but the order still needs manual review on our side.
                {checkout.failureReason ? ` ${checkout.failureReason}` : ''}
              </p>
            )}

            {isStillProcessing && (
              <p style={{ color: '#0f172a', lineHeight: 1.7 }}>
                We have your checkout reference, but PayMongo has not confirmed the final result yet. If you just completed the payment, wait a few seconds and refresh this status.
              </p>
            )}

            {isFailed && (
              <p style={{ color: '#0f172a', lineHeight: 1.7 }}>
                The payment was not completed, so no paid online order was created. You can go back to checkout and try again.
              </p>
            )}

            {checkout.order && (
              <div
                style={{
                  marginTop: '1.25rem',
                  padding: '1rem 1.1rem',
                  borderRadius: '1rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.35rem' }}>
                  Order {checkout.order.displayId || checkout.order.id}
                </div>
                <div style={{ color: '#475569', lineHeight: 1.6 }}>
                  {checkout.order.items}
                </div>
                <div style={{ marginTop: '0.5rem', fontWeight: 700, color: '#0f172a' }}>
                  {checkout.order.total}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.5rem' }}>
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

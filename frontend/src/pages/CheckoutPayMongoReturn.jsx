import { customerErrorMessage } from '../lib/publicErrors';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, CreditCard, Printer, RotateCw, Truck, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useOrders } from '../context/OrderContext';
import { useProducts } from '../context/ProductContext';
import { apiRequest } from '../lib/api';
import ReceiptSlip from '../components/ReceiptSlip';
import CheckoutOrderVerification from '../components/CheckoutOrderVerification';
import { formatCurrency } from '../utils/currency';
import './Checkout.css';

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

          if (!isActive || latestCheckout?.status !== 'created') {
            break;
          }

          if (attempt < 4) await wait(1500);
        }

        if (!isActive) {
          return;
        }

        setCheckout(latestCheckout);

        await refreshCheckoutSideEffects(latestCheckout);
      } catch (nextError) {
        if (isActive) {
          setError(customerErrorMessage(nextError, 'Unable to verify the PayMongo payment right now.'));
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
  const hasReceipt = Boolean(checkout?.order);
  const isSuccessful = checkoutStatus === 'fulfilled' || (checkoutStatus === 'paid' && hasReceipt);
  const isFailed = checkoutStatus === 'cancelled' || checkoutStatus === 'failed' || checkoutStatus === 'expired';
  const isManualReview = checkoutStatus === 'paid' && !checkout?.orderId;
  const isStillProcessing = checkoutStatus === 'created';
  const canContinuePayment = Boolean(checkout?.checkoutUrl) && isStillProcessing;
  const checkoutStatusLabel = isSuccessful
    ? 'Paid online'
    : isFailed
      ? 'Payment not completed'
      : isManualReview ? 'Payment received' : 'Waiting for online payment';
  const statusTone = isSuccessful ? 'success' : isFailed ? 'danger' : 'pending';
  const order = checkout?.order;
  const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];
  const itemTotal = (item) => Number(item.lineTotal ?? (Number(item.price) * Number(item.quantity))) || 0;
  const subtotal = lineItems.reduce((sum, item) => sum + itemTotal(item), 0);
  const total = Number(checkout?.amount ?? order?.totalAmount ?? order?.totalPrice) || 0;
  // Checkout totals already include the delivery charge calculated by the API.
  const deliveryFee = (checkout?.deliveryMethod || order?.deliveryMethod) === 'delivery'
    ? Math.max(0, Math.round((total - subtotal) * 100) / 100)
    : 0;

  const HeaderIcon = mode === 'cancel' && checkoutStatus === 'cancelled'
    ? XCircle
    : isLoading || isStillProcessing
      ? Clock3
      : isFailed
        ? XCircle
        : CheckCircle2;

  const pageTitle = mode === 'cancel' && checkoutStatus === 'cancelled'
    ? 'Payment Cancelled'
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
    <div className={`checkout-paymongo-return-page checkout-paymongo-return-page--${statusTone}`}>
      <div className={`checkout-return-layout ${!order || error || isLoading ? 'checkout-return-layout--single' : ''}`}>
        <div className="checkout-return-main">
          <section className="checkout-return-shell" aria-labelledby="checkout-payment-title" aria-busy={isLoading}>
            <div className="checkout-return-header">
              <HeaderIcon className="checkout-return-header-icon" size={36} aria-hidden="true" />
              <div>
                <h1 id="checkout-payment-title">{pageTitle}</h1>
                <p>Reference: {referenceNumber || 'Unavailable'}</p>
              </div>
            </div>

            {isLoading && (
              <div className="checkout-return-notice" role="status">
                <Clock3 size={22} aria-hidden="true" />
                <p>We're syncing your PayMongo checkout and finishing your order.</p>
              </div>
            )}

            {!isLoading && error && (
              <>
                <div className="checkout-return-notice checkout-return-notice--danger" role="alert">
                  <XCircle size={22} aria-hidden="true" /><p>{error}</p>
                </div>
                <div className="checkout-return-secondary-actions">
                  {!loggedInCustomer && <Link className="checkout-payment-continue" to="/login">Log In</Link>}
                  <button className="checkout-return-text-action" type="button" onClick={() => setRefreshKey((current) => current + 1)}>Try Again</button>
                  <Link className="checkout-return-text-action" to="/checkout">Back to Checkout</Link>
                </div>
              </>
            )}

            {!isLoading && !error && checkout && (
              <>
                <div className={`checkout-return-notice ${isSuccessful ? 'checkout-return-notice--success' : isFailed ? 'checkout-return-notice--danger' : ''}`} role="status">
                  <HeaderIcon size={22} aria-hidden="true" />
                  <p>
                    {isSuccessful
                      ? 'Your payment is confirmed. Your order is ready for processing.'
                      : isFailed
                        ? 'Your payment was not completed. You can return to checkout to try again.'
                        : isManualReview
                          ? `Your payment was received. Your order needs manual review.${checkout.failureReason ? ` ${checkout.failureReason}` : ''}`
                          : 'Your order is ready. Please complete your payment to confirm.'}
                  </p>
                </div>

                {isStillProcessing && (
                  <div className="checkout-payment-card">
                    <CreditCard className="checkout-payment-card-icon" size={30} aria-hidden="true" />
                    <div>
                      <h2>You selected to pay online.</h2>
                      <p>After reviewing your order, click the button below to proceed with your online payment.</p>
                      {canContinuePayment ? (
                        <a className="checkout-payment-continue" href={checkout.checkoutUrl}>
                          <CreditCard size={23} aria-hidden="true" />
                          <span>Continue Online Payment</span>
                          <ArrowRight size={21} aria-hidden="true" />
                        </a>
                      ) : (
                        <p className="checkout-payment-link-unavailable">The payment link is unavailable. Refresh the status to try again.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="checkout-return-secondary-actions">
                  {isStillProcessing && (
                    <>
                      <p>Already paid?</p>
                      <button className="checkout-return-text-action" type="button" onClick={() => setRefreshKey((current) => current + 1)}>
                        <RotateCw size={16} aria-hidden="true" />Refresh Status
                      </button>
                    </>
                  )}
                  {isSuccessful && order && (
                    <button className="checkout-payment-continue" type="button" onClick={handlePrintReceipt}>
                      <Printer size={18} aria-hidden="true" />Print Receipt
                    </button>
                  )}
                  {!isStillProcessing && <Link className="checkout-return-text-action" to="/orders">View Orders<ArrowRight size={16} aria-hidden="true" /></Link>}
                  {isFailed && <Link className="checkout-return-text-action" to="/checkout">Back to Checkout</Link>}
                </div>
              </>
            )}
          </section>

          {!isLoading && !error && order && !isFailed && <CheckoutOrderVerification order={order} />}

          {!isLoading && !error && isSuccessful && order && (
            <ReceiptSlip
              order={order}
              receiptNumber={checkout.referenceNumber}
              paymentStatus={checkoutStatus}
              paidAt={checkout.paidAt || order.paymentCheckoutPaidAt || order.updatedAt || order.createdAt}
            />
          )}
        </div>

        {!isLoading && !error && order && (
          <aside className="checkout-return-summary" aria-labelledby="checkout-order-summary-title">
            <h2 id="checkout-order-summary-title">Order Summary</h2>
            <ul className="checkout-return-items">
              {lineItems.map((item, index) => (
                <li key={item.id || item.productId || index}>
                  <span className="checkout-return-item-quantity">{item.quantity}x</span>
                  <span className="checkout-return-item-name">{item.name}</span>
                  <strong>{formatCurrency(itemTotal(item))}</strong>
                </li>
              ))}
            </ul>
            <dl className="checkout-return-totals">
              <div><dt>Subtotal</dt><dd>{formatCurrency(subtotal)}</dd></div>
              <div><dt>Delivery Fee</dt><dd>{formatCurrency(deliveryFee)}</dd></div>
              <div className="checkout-return-total"><dt>Total</dt><dd>{formatCurrency(total)}</dd></div>
            </dl>
            <div className={`checkout-return-status checkout-return-status--${statusTone}`}>
              {isStillProcessing ? <Truck size={23} aria-hidden="true" /> : <HeaderIcon size={23} aria-hidden="true" />}
              <span>{checkoutStatusLabel}</span>
            </div>
            {isStillProcessing && <p className="checkout-return-payment-note">Complete your online payment to continue processing this order.</p>}
          </aside>
        )}
      </div>
    </div>
  );
};

export default CheckoutPayMongoReturn;

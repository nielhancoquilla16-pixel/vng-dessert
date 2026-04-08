import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { useProducts } from '../context/ProductContext';
import { apiRequest } from '../lib/api';
import { CreditCard, Banknote, MapPin, Store, Truck } from 'lucide-react';
import { hasLecheFlanItems } from '../utils/orderWorkflow';
import './Checkout.css';

const DELIVERY_FEE = 50;

const Checkout = () => {
  const { cartItems, clearCart } = useCart();
  const { loggedInCustomer, updateLoggedInCustomer } = useAuth();
  const { addOrder, refreshOrders } = useOrders();
  const { validateStockAvailability, refreshProducts } = useProducts();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullName: loggedInCustomer?.fullName || loggedInCustomer?.username || '',
    phone: '',
    address: '',
    deliveryMethod: 'delivery',
    paymentMethod: 'online',
    deliveryDistanceKm: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isPaymentStatusLoading, setIsPaymentStatusLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState({
    configured: false,
    paymentMethodTypes: [],
  });

  useEffect(() => {
    if (cartItems.length === 0 && !isSubmitting) {
      navigate('/cart');
    }
  }, [cartItems, navigate, isSubmitting]);

  useEffect(() => {
    let isActive = true;

    const loadPaymentStatus = async () => {
      try {
        const status = await apiRequest('/api/payments/status');
        if (isActive) {
          setPaymentStatus(status || { configured: false, paymentMethodTypes: [] });
        }
      } catch {
        if (isActive) {
          setPaymentStatus({ configured: false, paymentMethodTypes: [] });
        }
      } finally {
        if (isActive) {
          setIsPaymentStatusLoading(false);
        }
      }
    };

    loadPaymentStatus();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!paymentStatus.configured && formData.paymentMethod === 'online') {
      setFormData((current) => ({
        ...current,
        paymentMethod: 'cash',
      }));
    }
  }, [formData.paymentMethod, paymentStatus.configured]);

  useEffect(() => {
    if (formData.deliveryMethod === 'pickup' && formData.deliveryDistanceKm) {
      setFormData((current) => ({
        ...current,
        deliveryDistanceKm: '',
      }));
    }
  }, [formData.deliveryMethod, formData.deliveryDistanceKm]);

  const subtotal = cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  const deliveryFee = formData.deliveryMethod === 'delivery' ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;
  const containsLecheFlan = hasLecheFlanItems(cartItems);
  const deliveryDistance = Number(formData.deliveryDistanceKm);
  const isLecheFlanRestricted = formData.deliveryMethod === 'delivery'
    && containsLecheFlan
    && Number.isFinite(deliveryDistance)
    && deliveryDistance > 3;

  const handleChange = (e) => {
    setFormData((current) => ({
      ...current,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');

    try {
      if (!loggedInCustomer) {
        throw new Error('Please log in first before checking out.');
      }

      if (formData.deliveryMethod === 'delivery' && containsLecheFlan && (!Number.isFinite(deliveryDistance) || deliveryDistance <= 0)) {
        throw new Error('Please enter the delivery distance so we can verify the leche flan restriction.');
      }

      if (isLecheFlanRestricted) {
        throw new Error('Leche flan delivery is limited to 3 km only.');
      }

      const submittedFullName = formData.fullName.trim();

      if (submittedFullName) {
        await updateLoggedInCustomer({
          fullName: submittedFullName,
          address: formData.address.trim(),
          phoneNumber: formData.phone.trim(),
        });
      }

      const lineItems = cartItems.map((item) => ({
        productId: item.id,
        name: item.name,
        category: item.category || 'Uncategorized',
        quantity: item.quantity,
        price: Number(item.price) || 0,
        lineTotal: (Number(item.price) || 0) * item.quantity,
      }));

      const stockCheck = validateStockAvailability(lineItems);

      if (!stockCheck.isAvailable) {
        const shortageSummary = stockCheck.shortages
          .map((item) => `${item.name} (${item.available} left, you selected ${item.requested})`)
          .join(', ');

        setSubmitError(`Not enough stock for: ${shortageSummary}. Please update your cart and try again.`);
        setIsSubmitting(false);
        return;
      }

      if (formData.paymentMethod === 'online') {
        if (!paymentStatus.configured) {
          throw new Error('Online payment is not configured yet. Switch to cash for now, or add the PayMongo keys and restart the backend.');
        }

        const checkoutSession = await apiRequest('/api/payments/checkout-sessions', {
          method: 'POST',
          body: JSON.stringify({
            customerName: submittedFullName || loggedInCustomer.username || 'Customer',
            phoneNumber: formData.phone.trim(),
            address: formData.address.trim(),
            deliveryMethod: formData.deliveryMethod,
            paymentMethod: 'online',
            deliveryDistanceKm: formData.deliveryMethod === 'delivery' ? deliveryDistance : null,
            lineItems,
          }),
        }, {
          auth: true,
        });

        if (!checkoutSession?.checkoutUrl) {
          throw new Error('PayMongo did not return a checkout URL.');
        }

        if (!checkoutSession?.referenceNumber) {
          throw new Error('PayMongo did not return a checkout reference.');
        }

        await clearCart();
        void refreshOrders();
        navigate(`/checkout/paymongo/success?reference=${encodeURIComponent(checkoutSession.referenceNumber)}&stage=payment-selection`);
        return;
      }

      await addOrder({
        customer: submittedFullName || (loggedInCustomer ? loggedInCustomer.username : 'Guest'),
        customerUsername: loggedInCustomer?.username || '',
        phoneNumber: formData.phone,
        address: formData.address,
        subtext: formData.deliveryMethod === 'delivery'
          ? formData.address
          : 'Pick-up / Pay at Store',
        lineItems,
        totalAmount: total,
        total: `PHP ${total.toFixed(2)}`,
        paymentMethod: formData.paymentMethod,
        deliveryMethod: formData.deliveryMethod,
        status: 'confirmed',
        deliveryDistanceKm: formData.deliveryMethod === 'delivery' && Number.isFinite(deliveryDistance)
          ? deliveryDistance
          : null,
      });

      await refreshProducts();
      await clearCart();
      navigate('/orders');
    } catch (error) {
      const shortageItems = error?.details?.shortages;
      if (Array.isArray(shortageItems) && shortageItems.length > 0) {
        setSubmitError(shortageItems
          .map((item) => `${item.productName} (${item.available} left, you selected ${item.requested})`)
          .join(', '));
      } else {
        setSubmitError(error.message || 'Unable to place the order right now.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cartItems.length === 0 && !isSubmitting) return null;

  return (
    <div className="checkout-container">
      <div className="page-header" style={{ background: '#fef08a', padding: '2rem', borderRadius: '1rem', marginBottom: '2rem' }}>
        <h1 className="page-title">Checkout</h1>
        <p className="page-subtitle">Complete your order details below.</p>
      </div>

      <div className="checkout-content">
        <form className="checkout-form" onSubmit={handleSubmit}>
          {submitError && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.9rem 1rem',
                borderRadius: '0.85rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '0.92rem',
                lineHeight: 1.5,
                fontWeight: 600,
              }}
            >
              {submitError}
            </div>
          )}

          {!isPaymentStatusLoading && formData.deliveryMethod === 'delivery' && !paymentStatus.configured && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.95rem 1rem',
                borderRadius: '0.85rem',
                background: '#fff7ed',
                border: '1px solid #fdba74',
                color: '#9a3412',
                fontSize: '0.92rem',
                lineHeight: 1.6,
              }}
            >
              Online payment is currently unavailable. Cash checkout still works, or you can add PayMongo to the backend and restart the server.
            </div>
          )}

          <div className="form-section">
            <h2 className="section-title">1. Contact Information</h2>
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                name="fullName"
                className="text-input"
                value={formData.fullName}
                onChange={handleChange}
                required
                placeholder="Juan Dela Cruz"
              />
            </div>
            <div className="form-group">
              <label>Contact Number</label>
              <input
                type="text"
                name="phone"
                className="text-input"
                value={formData.phone}
                onChange={handleChange}
                required
                placeholder="09123456789"
              />
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title">2. Delivery Method</h2>
            <div className="method-options">
              <label className={`method-card ${formData.deliveryMethod === 'delivery' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="delivery"
                  checked={formData.deliveryMethod === 'delivery'}
                  onChange={handleChange}
                  style={{ display: 'none' }}
                />
                <Truck size={24} className="method-icon" />
                <div className="method-details">
                  <span className="method-name">Delivery</span>
                  <span className="method-desc">We deliver to your door (+PHP 50.00)</span>
                </div>
              </label>

              <label className={`method-card ${formData.deliveryMethod === 'pickup' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="pickup"
                  checked={formData.deliveryMethod === 'pickup'}
                  onChange={handleChange}
                  style={{ display: 'none' }}
                />
                <Store size={24} className="method-icon" />
                <div className="method-details">
                  <span className="method-name">Pick-up</span>
                  <span className="method-desc">Pick up at our store (Free)</span>
                </div>
              </label>
            </div>
          </div>

          {formData.deliveryMethod === 'delivery' && (
            <div className="form-section">
              <h2 className="section-title">Delivery Address</h2>
              <div className="form-group">
                <label>Complete Address</label>
                <div className="input-with-icon">
                  <MapPin size={20} className="input-icon" style={{ top: '1rem', transform: 'none' }} />
                  <textarea
                    name="address"
                    className="text-input"
                    value={formData.address}
                    onChange={handleChange}
                    required
                    placeholder="House/Unit No., Street, Barangay, City"
                    style={{ paddingLeft: '3rem', minHeight: '80px', paddingTop: '1rem' }}
                  ></textarea>
                </div>
              </div>

              <div className="form-group">
                <label>Delivery Distance (km)</label>
                <input
                  type="number"
                  name="deliveryDistanceKm"
                  className="text-input"
                  value={formData.deliveryDistanceKm}
                  onChange={handleChange}
                  min="0"
                  step="0.1"
                  required={containsLecheFlan}
                  placeholder="e.g. 2.5"
                />
                <p className="checkout-helper-copy">
                  Enter the estimated distance from the store to your delivery address. Leche flan delivery is limited to 3 km only.
                </p>
              </div>

              {containsLecheFlan && (
                <div className={`checkout-warning ${isLecheFlanRestricted ? 'is-blocked' : ''}`}>
                  {isLecheFlanRestricted
                    ? 'Leche flan delivery is limited to 3 km only.'
                    : 'Your cart contains leche flan. Delivery distance must be 3 km or less.'}
                </div>
              )}
            </div>
          )}

          <div className="form-section">
            <h2 className="section-title">3. Payment Method</h2>
            <div className="method-options">
              <label className={`method-card ${formData.paymentMethod === 'online' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="online"
                  checked={formData.paymentMethod === 'online'}
                  onChange={handleChange}
                  style={{ display: 'none' }}
                  disabled={!paymentStatus.configured}
                />
                <CreditCard size={24} className="method-icon" style={{ color: '#3b82f6' }} />
                <div className="method-details">
                  <span className="method-name">Pay Online</span>
                  <span className="method-desc">
                    {paymentStatus.configured
                      ? 'Generate your order reference instantly, then continue through PayMongo.'
                      : 'Online payment is not configured yet on the backend.'}
                  </span>
                </div>
              </label>

              <label className={`method-card ${formData.paymentMethod === 'cash' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cash"
                  checked={formData.paymentMethod === 'cash'}
                  onChange={handleChange}
                  style={{ display: 'none' }}
                />
                <Banknote size={24} className="method-icon" style={{ color: '#10b981' }} />
                <div className="method-details">
                  <span className="method-name">{formData.deliveryMethod === 'delivery' ? 'Cash on Delivery (COD)' : 'Pay at Store'}</span>
                  <span className="method-desc">
                    {formData.deliveryMethod === 'delivery'
                      ? 'Pay when you receive your order.'
                      : 'Generate your Order ID right away and pay during pickup.'}
                  </span>
                </div>
              </label>
            </div>

            {formData.deliveryMethod === 'pickup' && formData.paymentMethod === 'online' && paymentStatus.configured && (
              <div
                style={{
                  marginTop: '0.9rem',
                  padding: '0.9rem 1rem',
                  borderRadius: '0.85rem',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  color: '#1d4ed8',
                  fontSize: '0.92rem',
                  lineHeight: 1.6,
                }}
              >
                Your Order ID and QR will appear right after you continue, before you leave for PayMongo payment.
              </div>
            )}

            {formData.deliveryMethod === 'pickup' && formData.paymentMethod === 'cash' && (
              <div
                style={{
                  marginTop: '0.9rem',
                  padding: '0.9rem 1rem',
                  borderRadius: '0.85rem',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontSize: '0.92rem',
                  lineHeight: 1.6,
                }}
              >
                Your Order ID and QR will be generated as soon as you place this pickup order. No staff confirmation is needed before your reference appears.
              </div>
            )}
          </div>

          <button type="submit" className="btn-primary place-order-btn" disabled={isSubmitting}>
            {isSubmitting
              ? 'Processing...'
              : formData.paymentMethod === 'online'
                ? 'Review QR and Continue'
                : 'Place Order'}
          </button>
        </form>

        <div className="checkout-summary">
          <div className="summary-card">
            <h2 className="summary-title">Order Summary</h2>

            <div className="summary-items">
              {cartItems.map((item) => (
                <div key={item.id} className="summary-item">
                  <div className="summary-item-info">
                    <span className="summary-item-qty">{item.quantity}x</span>
                    <span className="summary-item-name">{item.name}</span>
                  </div>
                  <span className="summary-item-price">PHP {(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="summary-divider"></div>

            <div className="summary-row">
              <span>Subtotal</span>
              <span>PHP {subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Delivery Fee</span>
              <span>PHP {deliveryFee.toFixed(2)}</span>
            </div>
            {formData.deliveryMethod === 'delivery' && containsLecheFlan && (
              <div className="summary-row">
                <span>Leche Flan Check</span>
                <span className={isLecheFlanRestricted ? 'summary-flag-danger' : 'summary-flag-ok'}>
                  {isLecheFlanRestricted ? 'Blocked over 3 km' : 'Within limit'}
                </span>
              </div>
            )}

            <div className="summary-divider"></div>

            <div className="summary-total">
              <span>Total</span>
              <span className="amount">PHP {total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;

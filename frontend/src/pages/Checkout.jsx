import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { useProducts } from '../context/ProductContext';
import { MapPin, CreditCard, Banknote, Truck, Store } from 'lucide-react';
import './Checkout.css';

const Checkout = () => {
  const { cartItems, clearCart } = useCart();
  const { loggedInCustomer, updateLoggedInCustomer } = useAuth();
  const { addOrder } = useOrders();
  const { validateStockAvailability, refreshProducts } = useProducts();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullName: loggedInCustomer?.fullName || loggedInCustomer?.username || '',
    phone: '',
    address: '',
    deliveryMethod: 'delivery',
    paymentMethod: 'gcash'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (cartItems.length === 0 && !isSubmitting) {
      navigate('/cart');
    }
  }, [cartItems, navigate, isSubmitting]);

  const subtotal = cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  const deliveryFee = formData.deliveryMethod === 'delivery' ? 50.00 : 0;
  const total = subtotal + deliveryFee;

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const submittedFullName = formData.fullName.trim();

      if (loggedInCustomer && submittedFullName) {
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

      await addOrder({
        customer: submittedFullName || (loggedInCustomer ? loggedInCustomer.username : 'Guest'),
        customerUsername: loggedInCustomer?.username || '',
        phoneNumber: formData.phone,
        address: formData.address,
        subtext: formData.deliveryMethod === 'delivery'
          ? formData.address
          : `Walk-in / ${formData.paymentMethod === 'gcash' ? 'GCash' : 'Cash'}`,
        lineItems,
        totalAmount: total,
        total: `PHP ${total.toFixed(2)}`,
        paymentMethod: formData.paymentMethod,
        deliveryMethod: formData.deliveryMethod,
      });

      await refreshProducts();
      clearCart();
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
                  <span className="method-name">Walk-in / Pick-up</span>
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
            </div>
          )}

          <div className="form-section">
            <h2 className="section-title">3. Payment Method</h2>
            <div className="method-options">
              <label className={`method-card ${formData.paymentMethod === 'gcash' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="gcash"
                  checked={formData.paymentMethod === 'gcash'}
                  onChange={handleChange}
                  style={{ display: 'none' }}
                />
                <CreditCard size={24} className="method-icon" style={{ color: '#3b82f6' }} />
                <div className="method-details">
                  <span className="method-name">GCash (Online)</span>
                  <span className="method-desc">Pay securely via GCash.</span>
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
                  <span className="method-name">{formData.deliveryMethod === 'delivery' ? 'Cash on Delivery (COD)' : 'Cash on Pick-up'}</span>
                  <span className="method-desc">Pay when you receive your order.</span>
                </div>
              </label>
            </div>
          </div>

          <button type="submit" className="btn-primary place-order-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Processing...' : 'Place Order'}
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

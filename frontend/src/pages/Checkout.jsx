import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { MapPin, CreditCard, Banknote, Truck, Store } from 'lucide-react';
import './Checkout.css';

const Checkout = () => {
  const { cartItems, clearCart } = useCart();
  const { loggedInCustomer } = useAuth();
  const { addOrder } = useOrders();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullName: loggedInCustomer?.username || '',
    phone: '',
    address: '',
    deliveryMethod: 'delivery', // 'delivery' or 'pickup'
    paymentMethod: 'gcash' // 'gcash' or 'cash'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect to cart if empty
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

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Construct items string
    const itemsStr = cartItems.map(item => `${item.quantity}× ${item.name}`).join(', ');
    
    // Add to orders
    addOrder({
      customer: formData.fullName || (loggedInCustomer ? loggedInCustomer.username : 'Guest'),
      subtext: formData.deliveryMethod === 'delivery' 
        ? formData.address 
        : `Walk-in / ${formData.paymentMethod === 'gcash' ? 'GCash' : 'Cash'}`,
      items: itemsStr,
      total: `₱${total.toFixed(2)}`
    });
    
    // Simulate API call delay
    setTimeout(() => {
      clearCart();
      navigate('/orders');
    }, 1500);
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
                  <span className="method-desc">We deliver to your door (+₱50.00)</span>
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
              {cartItems.map(item => (
                <div key={item.id} className="summary-item">
                  <div className="summary-item-info">
                    <span className="summary-item-qty">{item.quantity}x</span>
                    <span className="summary-item-name">{item.name}</span>
                  </div>
                  <span className="summary-item-price">₱{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            
            <div className="summary-divider"></div>
            
            <div className="summary-row">
              <span>Subtotal</span>
              <span>₱{subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Delivery Fee</span>
              <span>₱{deliveryFee.toFixed(2)}</span>
            </div>
            
            <div className="summary-divider"></div>
            
            <div className="summary-total">
              <span>Total</span>
              <span className="amount">₱{total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;

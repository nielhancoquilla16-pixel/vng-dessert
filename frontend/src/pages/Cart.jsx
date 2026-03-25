import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { Trash2, CheckSquare, Square } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import './Cart.css';

const Cart = () => {
  const { cartItems, updateQuantity, removeFromCart, clearCart } = useCart();
  const { loggedInCustomer, isAdmin } = useAuth();
  const [selectedIds, setSelectedIds] = useState(null);
  const navigate = useNavigate();

  const isAuthenticated = loggedInCustomer || isAdmin;
  const activeSelectedIds = selectedIds === null
    ? cartItems.map((item) => item.id)
    : selectedIds.filter((id) => cartItems.some((item) => item.id === id));
  const selectedCount = activeSelectedIds.length;

  const toggleItem = (id) => {
    setSelectedIds((prev) => {
      const baseSelection = prev === null
        ? cartItems.map((item) => item.id)
        : prev.filter((selectedId) => cartItems.some((item) => item.id === selectedId));

      return baseSelection.includes(id)
        ? baseSelection.filter((itemId) => itemId !== id)
        : [...baseSelection, id];
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const baseSelection = prev === null
        ? cartItems.map((item) => item.id)
        : prev.filter((selectedId) => cartItems.some((item) => item.id === selectedId));

      return baseSelection.length === cartItems.length ? [] : cartItems.map((item) => item.id);
    });
  };

  const selectedTotal = cartItems
    .filter((item) => activeSelectedIds.includes(item.id))
    .reduce((total, item) => total + (item.price * item.quantity), 0);

  const deliveryFee = selectedTotal > 0 ? 50 : 0;
  const finalTotal = selectedTotal + deliveryFee;

  const handleCheckout = () => {
    if (selectedCount > 0) {
      navigate('/checkout');
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="cart-container" style={{ display: 'block', textAlign: 'center', padding: '4rem 0' }}>
        <h2>Your Cart is Empty</h2>
        <p className="page-subtitle" style={{ margin: '1rem 0 2rem' }}>Looks like you haven't added any desserts yet.</p>
        <Link to="/products" className="btn-primary">Browse Products</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ background: '#fef08a', padding: '2rem', borderRadius: '1rem', marginBottom: '2rem' }}>
        <h1 className="page-title">Shopping Cart</h1>
        <p className="page-subtitle">Review your items and proceed to checkout.</p>
      </div>

      <div className="cart-container">
        <div className="cart-items-section">
          <div className="cart-header-bar">
            <button
              onClick={toggleAll}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {selectedCount === cartItems.length ? (
                <CheckSquare color="#0ea5e9" size={24} />
              ) : (
                <Square color="#cbd5e1" size={24} />
              )}
              <span style={{ fontWeight: 600, color: 'var(--text-dark)' }}>Select all</span>
            </button>
            <span style={{ color: 'var(--text-muted)' }}>{selectedCount} of {cartItems.length} selected</span>
          </div>

          <div className="cart-list">
            {cartItems.map((item) => (
              <div key={item.id} className="cart-item">
                <button
                  onClick={() => toggleItem(item.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {activeSelectedIds.includes(item.id) ? (
                    <CheckSquare color="#0ea5e9" size={24} />
                  ) : (
                    <Square color="#cbd5e1" size={24} />
                  )}
                </button>
                <img src={item.image} alt={item.name} className="cart-item-image" />

                <div className="cart-item-details">
                  <h3 className="cart-item-title">{item.name}</h3>
                  <div className="cart-item-price">PHP {item.price.toFixed(2)} each</div>
                  <div className="cart-item-stock">Stock: {item.stock}</div>

                  <div className="quantity-controls" style={{ width: 'fit-content', marginTop: '0.5rem' }}>
                    <button className="qty-btn" onClick={() => updateQuantity(item.id, item.quantity - 1)}>-</button>
                    <span className="qty-value">{item.quantity}</span>
                    <button
                      className="qty-btn"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      disabled={item.quantity >= (Number(item.stock) || item.quantity)}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1rem' }}>
                  <div className="cart-item-total">PHP {(item.price * item.quantity).toFixed(2)}</div>
                  <button className="btn-remove" onClick={() => removeFromCart(item.id)}>
                    <Trash2 size={16} /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="order-summary">
          <h2 className="summary-title">Order Summary</h2>

          <div className="summary-row">
            <span>Subtotal</span>
            <span>PHP {selectedTotal.toFixed(2)}</span>
          </div>

          <div className="summary-row">
            <span>Delivery Fee</span>
            <span>PHP {deliveryFee.toFixed(2)}</span>
          </div>

          <div className="summary-total">
            <span>Total</span>
            <span className="amount">PHP {finalTotal.toFixed(2)}</span>
          </div>

          <div className="summary-actions">
            {isAuthenticated ? (
              <button
                onClick={handleCheckout}
                className={`btn-primary btn-block ${selectedCount === 0 ? 'disabled' : ''}`}
                style={{ textAlign: 'center', opacity: selectedCount === 0 ? 0.5 : 1, pointerEvents: selectedCount === 0 ? 'none' : 'auto' }}
              >
                Proceed to Checkout
              </button>
            ) : (
              <Link
                to={selectedCount > 0 ? '/login' : '#'}
                className={`btn-primary btn-block ${selectedCount === 0 ? 'disabled' : ''}`}
                style={{ textAlign: 'center', opacity: selectedCount === 0 ? 0.5 : 1, pointerEvents: selectedCount === 0 ? 'none' : 'auto' }}
              >
                Login to Checkout
              </Link>
            )}

            <Link to="/products" className="btn-tertiary btn-block" style={{ textAlign: 'center' }}>
              Continue Shopping
            </Link>

            <button className="btn-remove btn-block" style={{ justifyContent: 'center' }} onClick={clearCart}>
              Clear Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;

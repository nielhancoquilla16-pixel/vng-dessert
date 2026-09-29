import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useShopSettings } from '../context/ShopSettingsContext';
import { formatCurrency } from '../utils/currency';
import { Trash2, CheckSquare, Square, ShoppingBag } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import './Cart.css';

const Cart = () => {
  const { cartItems, updateQuantity, removeFromCart, clearCart } = useCart();
  const { loggedInCustomer, isAdmin } = useAuth();
  const { isShopOpen, isShopSettingsLoading, shopSettingsError, operatingHoursLabel } = useShopSettings();
  const [cartError, setCartError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const canOrder = isShopOpen && !isShopSettingsLoading && !shopSettingsError;
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
    if (selectedCount > 0 && canOrder && !isUpdating) {
      navigate('/checkout', { state: { selectedCartIds: activeSelectedIds } });
    }
  };

  const changeCart = async (action) => {
    if (isUpdating) return;
    setCartError('');
    setIsUpdating(true);
    try { await action(); }
    catch (error) { setCartError(error.message || 'Unable to update your cart. Please try again.'); }
    finally { setIsUpdating(false); }
  };

  if (cartItems.length === 0) {
    return (
      <div className="cart-page cart-empty-state">
        <ShoppingBag size={40} aria-hidden="true" />
        <h1>Your cart is empty</h1>
        <p>Find something sweet to add to your day.</p>
        <Link to="/products" className="btn-primary">Browse Products</Link>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <div className="cart-page-heading">
        <h1>Shopping cart</h1>
        <p>Choose your treats and review your order.</p>
        <p>Ordering hours: {operatingHoursLabel}</p>
        {!canOrder && <p role="status">{isShopSettingsLoading ? 'Checking shop hours…' : shopSettingsError || 'The shop is closed for orders. Your cart is saved for later.'}</p>}
        {cartError && <p role="alert">{cartError}</p>}
      </div>

      <div className="cart-container">
        <div className="cart-items-section">
          <div className="cart-header-bar">
            <button
              onClick={toggleAll}
              className="cart-select-all"
              aria-pressed={selectedCount === cartItems.length}
            >
              {selectedCount === cartItems.length ? (
                <CheckSquare color="#c2410c" size={22} />
              ) : (
                <Square color="#64748b" size={22} />
              )}
              <span>Select all</span>
            </button>
            <span className="cart-selection-count" aria-live="polite">{selectedCount} of {cartItems.length} selected</span>
          </div>

          <div className="cart-list">
            {cartItems.map((item) => (
              <div key={item.id} className="cart-item">
                <button
                  onClick={() => toggleItem(item.id)}
                  className="cart-item-select"
                  aria-label={`Select ${item.name}`}
                  aria-pressed={activeSelectedIds.includes(item.id)}
                >
                  {activeSelectedIds.includes(item.id) ? (
                    <CheckSquare color="#c2410c" size={22} />
                  ) : (
                    <Square color="#64748b" size={22} />
                  )}
                </button>
                <img src={item.image} alt={item.name} className="cart-item-image" />

                <div className="cart-item-details">
                  <h3 className="cart-item-title">{item.name}</h3>
                  <div className="cart-item-price">{formatCurrency(item.price)} each</div>
                  <div className="cart-item-stock">{Number(item.stock) > 0 ? `${item.stock} available` : 'Out of stock'}</div>

                  <div className="quantity-controls" role="group" aria-label={`Quantity for ${item.name}`}>
                    <button className="qty-btn" aria-label={`Decrease quantity of ${item.name}`} disabled={item.quantity <= 1 || isUpdating} onClick={() => changeCart(() => updateQuantity(item.id, item.quantity - 1))}>−</button>
                    <span className="qty-value" aria-live="polite">{item.quantity}</span>
                    <button
                      className="qty-btn"
                      aria-label={`Increase quantity of ${item.name}`}
                      onClick={() => changeCart(() => updateQuantity(item.id, item.quantity + 1))}
                      disabled={!canOrder || isUpdating || item.quantity >= (Number(item.stock) || item.quantity)}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="cart-item-actions">
                  <div className="cart-item-total">{formatCurrency(item.price * item.quantity)}</div>
                  <button className="btn-remove" aria-label={`Remove ${item.name} from cart`} disabled={isUpdating} onClick={() => changeCart(() => removeFromCart(item.id))}>
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
            <span>{formatCurrency(selectedTotal)}</span>
          </div>

          <div className="summary-row">
            <span>Estimated delivery</span>
            <span>{formatCurrency(deliveryFee)}</span>
          </div>

          <div className="summary-total">
            <span>Total</span>
            <span className="amount">{formatCurrency(finalTotal)}</span>
          </div>

          <p className="cart-delivery-note">Pick-up is free. Delivery is confirmed at checkout.</p>

          <div className="summary-actions">
            {isAuthenticated ? (
              <button
                onClick={handleCheckout}
                className={`btn-primary btn-block ${selectedCount === 0 ? 'disabled' : ''}`}
                disabled={selectedCount === 0 || !canOrder || isUpdating}
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

            <button className="btn-remove btn-block" style={{ justifyContent: 'center' }} disabled={isUpdating} onClick={() => changeCart(clearCart)}>
              Clear Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;

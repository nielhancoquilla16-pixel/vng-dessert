import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, ShoppingCart, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { resolveAssetUrl } from '../lib/publicUrl';
import './Header.css';

const getInitials = (value = '') => (
  String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CU'
);

const Header = () => {
  const { cartCount } = useCart();
  const { isAdmin, userRole, loggedInCustomer, logout } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const panelLabel = userRole === 'staff' ? 'Staff' : 'Admin';
  const customerAvatarLabel = loggedInCustomer?.fullName || loggedInCustomer?.username || 'Customer';

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Products', path: '/products' },
    { name: 'Orders', path: '/orders' },
    { name: 'Contact', path: '/contact' },
    { name: 'About', path: '/about' },
  ];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsMobileMenuOpen(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  const handleLogout = () => {
    setIsMobileMenuOpen(false);
    logout();
  };

  return (
    <header className={`header ${isMobileMenuOpen ? 'menu-open' : ''}`}>
      <div className="header-shell">
        <div className="header-brand">
          <Link to="/" className="brand-link" aria-label="Go to homepage">
            <img
              src={resolveAssetUrl('logo.png')}
              alt="V&G Leche Flan logo"
              className="brand-logo"
            />
          </Link>
        </div>

        <nav className="nav-links desktop-nav" aria-label="Primary navigation">
          {navLinks.slice(0, 2).map((link) => (
            <Link
              key={link.name}
              to={link.path}
              className={`nav-item ${location.pathname === link.path ? 'active' : ''}`}
            >
              {link.name}
            </Link>
          ))}

          <Link to="/cart" className="cart-icon-center" aria-label="View cart">
            <ShoppingCart size={24} />
            {cartCount > 0 ? <span className="cart-badge">{cartCount}</span> : null}
          </Link>

          {navLinks.slice(2).map((link) => (
            <Link
              key={link.name}
              to={link.path}
              className={`nav-item ${location.pathname === link.path ? 'active' : ''}`}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        <div className="header-actions desktop-actions">
          {isAdmin ? (
            <div className="desktop-auth-row">
              <Link to="/admin/dashboard" className="btn-login btn-panel">{panelLabel}</Link>
              <button onClick={handleLogout} className="btn-login btn-logout" type="button">Logout</button>
            </div>
          ) : loggedInCustomer ? (
            <div className="desktop-auth-row">
              <Link to="/profile" className="customer-profile-link customer-profile-button" aria-label="Open profile">
                <span className="customer-avatar-badge">
                  {loggedInCustomer.avatarUrl ? (
                    <img src={loggedInCustomer.avatarUrl} alt={customerAvatarLabel} className="customer-avatar-image" />
                  ) : (
                    getInitials(customerAvatarLabel)
                  )}
                </span>
              </Link>
              <button onClick={handleLogout} className="btn-login btn-logout compact" type="button">Logout</button>
            </div>
          ) : (
            <Link to="/login" className="btn-login">Login</Link>
          )}
        </div>

        <div className="mobile-utility">
          <Link to="/cart" className="cart-icon-center mobile-cart-icon" aria-label="View cart">
            <ShoppingCart size={22} />
            {cartCount > 0 ? <span className="cart-badge">{cartCount}</span> : null}
          </Link>

          <button
            type="button"
            className="header-menu-toggle"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <div className={`mobile-menu ${isMobileMenuOpen ? 'open' : ''}`}>
        {(isAdmin || loggedInCustomer) && (
          <div className="mobile-user-card">
            {loggedInCustomer && (
              <span className="customer-avatar-badge mobile">
                {loggedInCustomer.avatarUrl ? (
                  <img src={loggedInCustomer.avatarUrl} alt={customerAvatarLabel} className="customer-avatar-image" />
                ) : (
                  getInitials(customerAvatarLabel)
                )}
              </span>
            )}
            <div className="mobile-user-copy">
              <span className="mobile-user-label">{isAdmin ? `${panelLabel} session` : 'Signed in as'}</span>
              <strong>{isAdmin ? panelLabel : customerAvatarLabel}</strong>
            </div>
          </div>
        )}

        <nav className="mobile-nav-links" aria-label="Mobile navigation">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              className={`mobile-nav-item ${location.pathname === link.path ? 'active' : ''}`}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        <div className="mobile-auth-actions">
          {isAdmin ? (
            <>
            <Link to="/admin/dashboard" className="mobile-action-button panel">Go to {panelLabel} Panel</Link>
              <button onClick={handleLogout} className="mobile-action-button logout" type="button">Logout</button>
            </>
          ) : loggedInCustomer ? (
            <>
              <Link to="/profile" className="mobile-action-button panel">My Profile</Link>
              <button onClick={handleLogout} className="mobile-action-button logout" type="button">Logout</button>
            </>
          ) : (
            <Link to="/login" className="mobile-action-button login">Login / Register</Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;

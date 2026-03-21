import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import './Header.css';

const Header = () => {
  const { cartCount } = useCart();
  const { isAdmin, userRole, loggedInCustomer, logout } = useAuth();
  const location = useLocation();
  const panelLabel = userRole === 'staff' ? 'Staff' : 'Admin';

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Products', path: '/products' },
    { name: 'Orders', path: '/orders' },
    { name: 'Contact', path: '/contact' },
    { name: 'About', path: '/about' },
  ];

  return (
    <header className="header">
      <div className="header-brand">
        <img 
          src="/logo.png" 
          alt="V & G Leche Flan" 
          className="brand-logo" 
        />
      </div>
      
      <nav className="nav-links">
        {navLinks.slice(0, 2).map((link) => (
          <Link 
            key={link.name} 
            to={link.path} 
            className={`nav-item ${location.pathname === link.path ? 'active' : ''}`}
          >
            {link.name}
          </Link>
        ))}

        <Link to="/cart" className="cart-icon-center">
          <ShoppingCart size={24} />
          {cartCount > 0 && (
            <span className="cart-badge">{cartCount}</span>
          )}
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

      <div className="header-actions">
        {isAdmin ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link to="/admin/dashboard" className="btn-login" style={{ background: '#f97316' }}>{panelLabel}</Link>
            <button onClick={logout} className="btn-login" style={{ background: '#ef4444', border: 'none', cursor: 'pointer' }}>Logout</button>
          </div>
        ) : loggedInCustomer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontWeight: 600, color: '#334155' }}>Hi, {loggedInCustomer.username || loggedInCustomer.fullName || 'Customer'}</span>
            <button onClick={logout} className="btn-login" style={{ background: '#ef4444', border: 'none', cursor: 'pointer', padding: '0.5rem 1rem' }}>Logout</button>
          </div>
        ) : (
          <Link to="/login" className="btn-login">Login</Link>
        )}
      </div>
    </header>
  );
};

export default Header;

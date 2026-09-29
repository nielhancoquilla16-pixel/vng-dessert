import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ShoppingCart, UserRound } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { resolveAssetUrl } from '../lib/publicUrl';
import FloatingAI from './FloatingAI';
import './Header.css';

const Header = () => {
  const { cartCount } = useCart();
  const { profile } = useAuth();
  return (
    <header className="header">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="header-shell">
        <Link to="/" className="brand-link" aria-label="V & G LecheFlan home">
          <img src={resolveAssetUrl('logo.png')} alt="" className="brand-logo" />
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/products">Products</NavLink>
          <NavLink to="/orders">Orders</NavLink>
          <NavLink to="/cart" className="header-cart" aria-label={`Cart, ${cartCount} items`}>
            <ShoppingCart size={20} /><span>Cart</span>
            {cartCount > 0 && <span className="header-cart-count">{cartCount > 99 ? '99+' : cartCount}</span>}
          </NavLink>
        </nav>
        <div className="header-utilities">
          <NavLink to="/account" className="header-account desktop-account"><UserRound size={19} />{profile ? 'Account' : 'Sign in'}</NavLink>
          <FloatingAI inline />
        </div>
      </div>
    </header>
  );
};
export default Header;

import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { House, LayoutGrid, ShoppingCart, ClipboardList, UserRound } from 'lucide-react';
import { useCart } from '../context/CartContext';
import './MobileNavigation.css';

const tabs = [
  { label: 'Home', path: '/', icon: House, matches: (path) => path === '/' },
  { label: 'Products', path: '/products', icon: LayoutGrid, matches: (path) => path.startsWith('/products') },
  { label: 'Cart', path: '/cart', icon: ShoppingCart, matches: (path) => path === '/cart' || path.startsWith('/checkout') },
  { label: 'Orders', path: '/orders', icon: ClipboardList, matches: (path) => path.startsWith('/orders') },
  { label: 'Account', path: '/account', icon: UserRound, matches: (path) => ['/account', '/profile', '/login', '/customer/dashboard', '/contact', '/about'].includes(path) },
];

export default function MobileNavigation() {
  const { pathname } = useLocation();
  const { cartCount } = useCart();
  const navRef = useRef(null);
  useEffect(() => {
    const updateHeight = () => document.documentElement.style.setProperty('--mobile-nav-height', `${navRef.current?.getBoundingClientRect().height || 0}px`);
    updateHeight();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateHeight) : null;
    if (navRef.current) observer?.observe(navRef.current);
    window.addEventListener('resize', updateHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateHeight);
      document.documentElement.style.removeProperty('--mobile-nav-height');
    };
  }, []);
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation" ref={navRef}>
      {tabs.map(({ label, path, icon, matches }) => {
        const active = matches(pathname);
        return (
          <Link key={path} to={path} className={`mobile-tab${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} aria-label={label === 'Cart' ? `Cart, ${cartCount} items` : label}>
            <span className="mobile-tab-icon">{React.createElement(icon, { size: 21, strokeWidth: active ? 2.4 : 1.8, 'aria-hidden': true })}
              {label === 'Cart' && cartCount > 0 && <span className="mobile-tab-badge" aria-hidden="true">{cartCount > 99 ? '99+' : cartCount}</span>}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

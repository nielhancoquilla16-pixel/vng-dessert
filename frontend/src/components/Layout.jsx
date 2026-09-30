import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import CustomerOrderReminderBanner from './CustomerOrderReminderBanner';
import MobileNavigation from './MobileNavigation';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

const Layout = () => {
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();
  const isDeniedAdminCart = isAdmin && /\/cart\/?$/.test(pathname);
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [pathname]);

  return (
    <div className={`app-container${isDeniedAdminCart ? ' app-container--cart-denied' : ''}`}>
      <Header />
      {!isDeniedAdminCart && <CustomerOrderReminderBanner />}
      <main className="main-content" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      {!isDeniedAdminCart && <Footer />}
      {!isDeniedAdminCart && <MobileNavigation />}
    </div>
  );
};

export default Layout;

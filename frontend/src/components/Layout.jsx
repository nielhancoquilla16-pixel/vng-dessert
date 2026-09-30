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
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [pathname]);

  if (isAdmin && /\/cart\/?$/.test(pathname)) {
    return <Outlet />;
  }

  return (
    <div className="app-container">
      <Header />
      <CustomerOrderReminderBanner />
      <main className="main-content" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <MobileNavigation />
    </div>
  );
};

export default Layout;

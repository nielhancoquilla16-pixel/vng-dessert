import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import CustomerOrderReminderBanner from './CustomerOrderReminderBanner';
import MobileNavigation from './MobileNavigation';
import './Layout.css';

const Layout = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [pathname]);
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

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import Layout from './components/Layout';
import ApiStatusBanner from './components/ApiStatusBanner';
import AppErrorBoundary from './components/AppErrorBoundary';
import Home from './pages/Home';
import Products from './pages/Products';
import Cart from './pages/Cart';
import Contact from './pages/Contact';
import About from './pages/About';
import Login from './pages/Login';
import Orders from './pages/Orders';
import Checkout from './pages/Checkout';
import CheckoutPayMongoReturn from './pages/CheckoutPayMongoReturn';
import CustomerProfile from './pages/CustomerProfile';

import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminOrders from './pages/AdminOrders';
import AdminPOS from './pages/AdminPOS';
import AdminInventory from './pages/AdminInventory';
import AdminReports from './pages/AdminReports';
import AdminQR from './pages/AdminQR';
import AdminStaff from './pages/AdminStaff';
import AdminContent from './pages/AdminContent';

import { AuthProvider } from './context/AuthContext';
import { ProductProvider } from './context/ProductContext';
import { OrderProvider } from './context/OrderContext';
import { AIProvider } from './context/AIContext';
import { ContentProvider } from './context/ContentContext';
import FloatingAI from './components/FloatingAI';
import { normalizeBasePath } from './lib/publicUrl';

const routerBasename = normalizeBasePath(import.meta.env.BASE_URL).replace(/\/$/, '') || '/';

function App() {
  return (
  <AuthProvider>
    <ProductProvider>
      <OrderProvider>
        <AIProvider>
          <ContentProvider>
            <CartProvider>
              <AppErrorBoundary>
                <>
                  <FloatingAI />
                  <ApiStatusBanner />
                  <BrowserRouter basename={routerBasename}>
                    <Routes>
                      {/* Visitor Routes */}
                      <Route path="/" element={<Layout />}>
                        <Route index element={<Home />} />
                        <Route path="products" element={<Products />} />
                        <Route path="cart" element={<Cart />} />
                        <Route path="contact" element={<Contact />} />
                        <Route path="about" element={<About />} />
                        <Route path="login" element={<Login />} />
                        <Route path="profile" element={<CustomerProfile />} />
                        <Route path="orders" element={<Orders />} />
                        <Route path="checkout" element={<Checkout />} />
                        <Route path="checkout/paymongo/success" element={<CheckoutPayMongoReturn mode="success" />} />
                        <Route path="checkout/paymongo/cancel" element={<CheckoutPayMongoReturn mode="cancel" />} />
                      </Route>

                      {/* Admin Routes */}
                      <Route path="/admin" element={<AdminLayout />}>
                        <Route path="dashboard" element={<AdminDashboard />} />
                        <Route path="products" element={<AdminProducts />} />
                        <Route path="orders" element={<AdminOrders />} />
                        <Route path="pos" element={<AdminPOS />} />
                        <Route path="inventory" element={<AdminInventory />} />
                        <Route path="reports" element={<AdminReports />} />
                        <Route path="qr" element={<AdminQR />} />
                        <Route path="staff" element={<AdminStaff />} />
                        <Route path="content" element={<AdminContent />} />
                      </Route>
                    </Routes>
                  </BrowserRouter>
                </>
              </AppErrorBoundary>
            </CartProvider>
          </ContentProvider>
        </AIProvider>
      </OrderProvider>
    </ProductProvider>
  </AuthProvider>
  );
}

export default App;

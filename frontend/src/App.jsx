import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import Layout from './components/Layout';
import ApiStatusBanner from './components/ApiStatusBanner';
import AppErrorBoundary from './components/AppErrorBoundary';
import RequireRole from './components/RequireRole';
import Home from './pages/Home';
import Products from './pages/Products';
import Cart from './pages/Cart';
import Contact from './pages/Contact';
import About from './pages/About';
import Login from './pages/Login';
import Orders from './pages/Orders';
import Checkout from './pages/Checkout';
import CheckoutPayMongoReturn from './pages/CheckoutPayMongoReturn';
import CustomerDashboard from './pages/CustomerDashboard';
import CustomerProfile from './pages/CustomerProfile';
import Account from './pages/Account';
import Feedback from './pages/Feedback';
import AccessDenied from './pages/AccessDenied';

import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminOrders from './pages/AdminOrders';
import AdminPreOrders from './pages/AdminPreOrders';
import AdminPOS from './pages/AdminPOS';
import AdminInventory from './pages/AdminInventory';
import AdminReports from './pages/AdminReports';
import AdminQR from './pages/AdminQR';
import AdminFeedback from './pages/AdminFeedback';
import AdminStaff from './pages/AdminStaff';
import AdminContent from './pages/AdminContent';
import StaffDashboard from './pages/StaffDashboard';

import { AuthProvider } from './context/AuthContext';
import { ProductProvider } from './context/ProductContext';
import { InventoryAlertProvider } from './context/InventoryAlertContext';
import { OrderProvider } from './context/OrderContext';
import { PreOrderProvider } from './context/PreOrderContext';
import { AIProvider } from './context/AIContext';
import { ContentProvider } from './context/ContentContext';
import { SalesReportProvider } from './context/SalesReportContext';
import { ShopSettingsProvider } from './context/ShopSettingsContext';
import { CustomerAddressesProvider } from './context/CustomerAddressesContext';
import { normalizeBasePath } from './lib/publicUrl';

const routerBasename = normalizeBasePath(import.meta.env.BASE_URL).replace(/\/$/, '') || '/';

function App() {
  return (
  <AuthProvider>
    <ShopSettingsProvider>
      <CustomerAddressesProvider>
      <ProductProvider>
        <InventoryAlertProvider>
          <OrderProvider>
            <SalesReportProvider>
              <PreOrderProvider>
                <AIProvider>
                  <ContentProvider>
                    <CartProvider>
                    <AppErrorBoundary>
                      <>
                        <BrowserRouter basename={routerBasename}>
                          <ApiStatusBanner />
                          <Routes>
                            {/* Visitor Routes */}
                            <Route path="/" element={<Layout />}>
                              <Route index element={<Home />} />
                              <Route path="products" element={<Products />} />
                              <Route path="cart" element={<RequireRole allowedRoles={['customer']}><Cart /></RequireRole>} />
                              <Route path="contact" element={<Contact />} />
                              <Route path="about" element={<About />} />
                              <Route path="login" element={<Login />} />
                              <Route path="account" element={<Account />} />
                              <Route path="403" element={<AccessDenied />} />
                              <Route path="customer/dashboard" element={<RequireRole allowedRoles={['customer']}><CustomerDashboard /></RequireRole>} />
                              <Route path="profile" element={<RequireRole allowedRoles={['customer']}><CustomerProfile /></RequireRole>} />
                              <Route path="orders" element={<RequireRole allowedRoles={['customer']}><Orders /></RequireRole>} />
                              <Route path="checkout" element={<RequireRole allowedRoles={['customer']}><Checkout /></RequireRole>} />
                              <Route path="checkout/paymongo/success" element={<RequireRole allowedRoles={['customer']}><CheckoutPayMongoReturn mode="success" /></RequireRole>} />
                              <Route path="checkout/paymongo/cancel" element={<RequireRole allowedRoles={['customer']}><CheckoutPayMongoReturn mode="cancel" /></RequireRole>} />
                              <Route path="feedback/:token" element={<Feedback />} />
                            </Route>

                            {/* Admin Routes */}
                            <Route path="/admin" element={<RequireRole allowedRoles={['admin', 'staff']}><AdminLayout /></RequireRole>}>
                              <Route path="dashboard" element={<RequireRole allowedRoles={['admin']}><AdminDashboard /></RequireRole>} />
                              <Route path="products" element={<AdminProducts />} />
                              <Route path="orders" element={<AdminOrders />} />
                              <Route path="pre-orders" element={<AdminPreOrders />} />
                              <Route path="pos" element={<AdminPOS />} />
                              <Route path="inventory" element={<AdminInventory />} />
                              <Route path="reports" element={<AdminReports />} />
                              <Route path="feedback" element={<AdminFeedback />} />
                              <Route path="qr" element={<AdminQR />} />
                              <Route path="staff" element={<RequireRole allowedRoles={['admin']}><AdminStaff /></RequireRole>} />
                              <Route path="content" element={<RequireRole allowedRoles={['admin']}><AdminContent /></RequireRole>} />
                            </Route>

                            {/* Staff Routes */}
                            <Route path="/staff" element={<RequireRole allowedRoles={['staff']}><AdminLayout /></RequireRole>}>
                              <Route path="dashboard" element={<StaffDashboard />} />
                            </Route>
                          </Routes>
                        </BrowserRouter>
                      </>
                    </AppErrorBoundary>
                    </CartProvider>
                  </ContentProvider>
                </AIProvider>
              </PreOrderProvider>
            </SalesReportProvider>
          </OrderProvider>
        </InventoryAlertProvider>
      </ProductProvider>
      </CustomerAddressesProvider>
    </ShopSettingsProvider>
  </AuthProvider>
  );
}

export default App;

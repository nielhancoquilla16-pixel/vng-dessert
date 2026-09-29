import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ExternalLink, Mail, PackageCheck, ShoppingBag, Truck, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import './CustomerDashboard.css';

const formatDateTime = (value) => {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getLalamoveTracking = (order) => order?.lalamoveTracking || order?.lalamove || {};

const CustomerDashboard = () => {
  const location = useLocation();
  const { loggedInCustomer, profile } = useAuth();
  const { orders } = useOrders();
  const displayName = loggedInCustomer?.fullName || loggedInCustomer?.username || 'Customer';
  const activeDelivery = [...orders]
    .filter((order) => (
      String(order.deliveryMethod || '').toLowerCase() === 'delivery'
      && getLalamoveTracking(order).booked
      && !['completed', 'cancelled', 'refunded'].includes(String(order.status || '').toLowerCase())
    ))
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime()
      - new Date(left.updatedAt || left.createdAt || 0).getTime())[0] || null;
  const activeTracking = activeDelivery ? getLalamoveTracking(activeDelivery) : null;

  return (
    <div className="customer-dashboard-page">
      {location.state?.welcomeMessage && (
        <div className="customer-dashboard-alert" role="status">{location.state.welcomeMessage}</div>
      )}

      <section className="customer-dashboard-hero">
        <div>
          <p className="customer-dashboard-eyebrow">Customer Dashboard</p>
          <h1>{displayName}</h1>
        </div>
        <div className={profile?.emailVerified ? 'customer-status verified' : 'customer-status'}>
          <Mail size={16} />
          <span>{profile?.emailVerified ? 'Verified' : 'Not Verified'}</span>
        </div>
      </section>

      <div className="customer-dashboard-grid">
        <Link to="/orders" className="customer-dashboard-tile">
          <PackageCheck size={22} />
          <div>
            <h2>Orders</h2>
            <p>View current and past orders.</p>
          </div>
        </Link>
        <Link to="/profile" className="customer-dashboard-tile">
          <UserRound size={22} />
          <div>
            <h2>Profile</h2>
            <p>Update your customer details.</p>
          </div>
        </Link>
        <Link to="/products" className="customer-dashboard-tile">
          <ShoppingBag size={22} />
          <div>
            <h2>Shop</h2>
            <p>Browse available desserts.</p>
          </div>
        </Link>
      </div>

      {activeDelivery && activeTracking && (
        <section className="customer-dashboard-delivery">
          <div className="customer-dashboard-delivery-header">
            <div>
              <p>Active Delivery</p>
              <h2>{activeDelivery.displayId || activeDelivery.orderCode || activeDelivery.id}</h2>
            </div>
            <Truck size={22} />
          </div>

          <div className="customer-dashboard-delivery-grid">
            <div>
              <span>Status</span>
              <strong>{activeTracking.statusLabel || 'Booked'}</strong>
            </div>
            <div>
              <span>Driver</span>
              <strong>{activeTracking.driver?.name || 'Waiting'}</strong>
            </div>
            <div>
              <span>ETA</span>
              <strong>{formatDateTime(activeTracking.estimatedDeliveryAt)}</strong>
            </div>
          </div>

          {activeTracking.shareLink && (
            <a
              className="customer-dashboard-delivery-link"
              href={activeTracking.shareLink}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} />
              Track with Lalamove
            </a>
          )}
        </section>
      )}
    </div>
  );
};

export default CustomerDashboard;

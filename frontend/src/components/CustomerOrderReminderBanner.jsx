import React, { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Clock3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { hasCustomerConfirmationPending } from '../utils/orderWorkflow';
import './CustomerOrderReminderBanner.css';

const CustomerOrderReminderBanner = () => {
  const location = useLocation();
  const { loggedInCustomer, isAuthLoading, userRole } = useAuth();
  const { orders, refreshOrders, isOrdersLoading } = useOrders();

  useEffect(() => {
    if (isAuthLoading || !loggedInCustomer || userRole !== 'customer') {
      return;
    }

    void refreshOrders().catch(() => {});
  }, [isAuthLoading, location.pathname, location.search, loggedInCustomer, refreshOrders, userRole]);

  const pendingConfirmations = useMemo(() => (
    orders
      .filter((order) => hasCustomerConfirmationPending(order))
      .sort((left, right) => (
        new Date(right.deliveredAt || right.updatedAt || right.createdAt || 0).getTime()
        - new Date(left.deliveredAt || left.updatedAt || left.createdAt || 0).getTime()
      ))
  ), [orders]);

  if (
    isAuthLoading
    || isOrdersLoading
    || !loggedInCustomer
    || userRole !== 'customer'
    || pendingConfirmations.length === 0
  ) {
    return null;
  }

  return (
    <section className="customer-reminder-stack" aria-label="Order confirmation reminders">
      {pendingConfirmations.map((order) => (
        <article key={order.id} className="customer-reminder-banner" role="status" aria-live="polite">
          <div className="customer-reminder-icon">
            <Clock3 size={18} />
          </div>

          <div className="customer-reminder-copy">
            <p className="customer-reminder-kicker">Order Confirmation Needed</p>
            <h2>{order.displayId || order.orderCode || order.id}</h2>
            <p>
              Your order is waiting for your confirmation. Confirm it now to update the status and clear this reminder.
            </p>
          </div>

          <div className="customer-reminder-actions">
            <Link
              to={`/orders?confirm=${encodeURIComponent(order.id)}`}
              className="customer-reminder-button"
            >
              <CheckCircle2 size={16} />
              Confirm Now
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
};

export default CustomerOrderReminderBanner;

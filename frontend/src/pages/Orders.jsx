import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { Package } from 'lucide-react';
import './Orders.css';

const Orders = () => {
  const { loggedInCustomer } = useAuth();
  const { orders } = useOrders();

  if (!loggedInCustomer) {
    return (
      <div style={{ maxWidth: '1280px', margin: '2rem auto', padding: '0 2rem' }}>
        <div style={{ background: 'white', padding: '3rem', borderRadius: '1rem', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#0f172a' }}>My Orders</h2>
          <p style={{ color: '#64748b', fontSize: '1rem' }}>Please log in to view your orders and track their status.</p>
        </div>
      </div>
    );
  }

  const myOrders = orders.filter(
    order => order.customer.toLowerCase() === loggedInCustomer.username.toLowerCase()
  );

  return (
    <div style={{ maxWidth: '1280px', margin: '2rem auto', padding: '0 2rem' }}>
      <div style={{ background: 'white', padding: '3rem', borderRadius: '1rem', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '2rem', color: '#0f172a' }}>My Orders</h2>
        
        {myOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            <Package size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p style={{ fontSize: '1.1rem' }}>You haven't placed any orders yet.</p>
          </div>
        ) : (
          <div className="orders-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {myOrders.map(order => (
              <div key={order.id} style={{ border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
                
                <div>
                  <div style={{ fontWeight: 700, color: '#f97316', marginBottom: '0.25rem' }}>{order.id}</div>
                  <div style={{ color: '#64748b', fontSize: '0.9rem' }}>{order.date}</div>
                </div>

                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>Items</div>
                  <div style={{ color: '#475569', fontSize: '0.9rem' }}>{order.items}</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0f172a', marginBottom: '0.25rem' }}>{order.total}</div>
                  <div style={{ color: '#64748b', fontSize: '0.9rem' }}>{order.subtext.split(' / ')[0]}</div>
                </div>

                <div style={{ minWidth: '100px', textAlign: 'right' }}>
                  <span style={{ 
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '1rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    background: order.status === 'delivered' ? '#dcfce7' : order.status === 'cancelled' ? '#fee2e2' : '#fef3c7',
                    color: order.status === 'delivered' ? '#166534' : order.status === 'cancelled' ? '#991b1b' : '#92400e'
                  }}>
                    {order.status}
                  </span>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Orders;

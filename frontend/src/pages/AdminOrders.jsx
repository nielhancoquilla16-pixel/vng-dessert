import React, { useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { useOrders } from '../context/OrderContext';
import './AdminOrders.css';

const AdminOrders = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const { orders, updateOrderStatus } = useOrders();

  const statuses = ['All', 'Pending', 'Confirmed', 'Preparing', 'Processing', 'Ready', 'Completed', 'Received', 'Delivered', 'Cancelled'];

  const handleStatusUpdate = async (orderId, newStatus) => {
    await updateOrderStatus(orderId, newStatus);
  };

  const filteredOrders = orders.filter(o => {
      const matchesSearch = (o.displayId || o.id).toLowerCase().includes(searchTerm.toLowerCase()) || 
                          o.customer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'All' || o.status === selectedStatus.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <div className="admin-products-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Orders</h1>
          <p style={{ color: '#64748b' }}>{orders.length} total orders</p>
        </div>
        
        <div className="search-and-add">
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input 
              type="text" 
              placeholder="Search orders..." 
              className="admin-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="admin-filters">
        {statuses.map(status => (
          <button 
            key={status} 
            className={`filter-pill ${selectedStatus === status ? 'active' : ''}`}
            onClick={() => setSelectedStatus(status)}
          >
            {status} ({status === 'All' ? orders.length : orders.filter(o => o.status === status.toLowerCase()).length})
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div className="recent-orders-card" style={{ padding: '0' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '2rem' }}>Order ID</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Date</th>
              <th>Status</th>
              <th style={{ paddingRight: '2rem' }}>Update</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr key={order.id}>
                <td style={{ paddingLeft: '2rem', fontWeight: 800, color: '#f97316' }}>{order.displayId || order.orderCode || order.id}</td>
                <td>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{order.customer}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{order.subtext}</div>
                </td>
                <td style={{ fontSize: '0.8rem', color: '#475569', maxWidth: '200px' }}>
                  {order.items.split(', ').map((item, i) => (
                    <div key={i}>{item}</div>
                  ))}
                </td>
                <td style={{ fontWeight: 800 }}>{order.total}</td>
                <td style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{order.date}</td>
                <td>
                  <span className={`status-badge status-${order.status}`}>
                    {order.status}
                  </span>
                </td>
                <td style={{ paddingRight: '2rem' }}>
                  <div style={{ position: 'relative' }}>
                    <select 
                      className="select-input" 
                      style={{ 
                        padding: '0.4rem 2rem 0.4rem 1rem', 
                        fontSize: '0.8rem', 
                        borderRadius: '0.75rem', 
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        cursor: 'pointer',
                        appearance: 'none'
                      }}
                      value={order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
                    >
                      {statuses.filter(s => s !== 'All').map(s => (
                        <option key={s} value={s}>{s.toLowerCase()}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminOrders;

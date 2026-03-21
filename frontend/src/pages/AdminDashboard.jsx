import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  ShoppingBag, 
  Package, 
  Users,
  ArrowUpRight,
  TrendingDown
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { useCart } from '../context/CartContext';
import { useProducts } from '../context/ProductContext';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const { orders } = useCart();
  const { products } = useProducts();
  const [chartsLoading, setChartsLoading] = useState(true);
  const [hoveredBar, setHoveredBar] = useState(null);

  // Simulate chart loading
  useEffect(() => {
    const timer = setTimeout(() => setChartsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const totalOrders = orders.length;
  const productCount = products.filter(p => !p.type || p.type === 'product').length;
  const uniqueCustomers = new Set(orders.map(o => o.customer)).size;

  const stats = [
    { title: 'Total Revenue', value: `₱${totalRevenue.toLocaleString()}.00`, trend: 'Live', up: true, icon: TrendingUp },
    { title: 'Total Orders', value: totalOrders.toString(), trend: 'Live', up: true, icon: ShoppingBag },
    { title: 'Products', value: productCount.toString(), trend: 'Active', up: true, icon: Package },
    { title: 'Customers', value: uniqueCustomers.toString(), trend: 'Active', up: true, icon: Users },
  ];

  // Default Data
  const defaultWeeklySales = [
    { day: 'Mon', sales: 4000, orders: 24 },
    { day: 'Tue', sales: 3000, orders: 13 },
    { day: 'Wed', sales: 2000, orders: 9 },
    { day: 'Thu', sales: 2780, orders: 39 },
    { day: 'Fri', sales: 1890, orders: 23 },
    { day: 'Sat', sales: 2390, orders: 36 },
    { day: 'Sun', sales: 3490, orders: 27 },
  ];

  const defaultCategorySales = [
    { name: 'Leche Flan', value: 530, color: '#f97316' },
    { name: 'Puddings', value: 326, color: '#fbbf24' },
    { name: 'Pastries', value: 550, color: '#fb923c' },
    { name: 'Drinks', value: 402, color: '#fed7aa' },
  ];

  // Dynamic State
  const [weeklySalesData, setWeeklySalesData] = useState(() => {
    const saved = localStorage.getItem('vng_dashboard_weekly');
    return saved ? JSON.parse(saved) : defaultWeeklySales;
  });

  const [categorySalesData, setCategorySalesData] = useState(() => {
    const saved = localStorage.getItem('vng_dashboard_categories');
    return saved ? JSON.parse(saved) : defaultCategorySales;
  });

  // Save to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem('vng_dashboard_weekly', JSON.stringify(weeklySalesData));
  }, [weeklySalesData]);

  useEffect(() => {
    localStorage.setItem('vng_dashboard_categories', JSON.stringify(categorySalesData));
  }, [categorySalesData]);

  const handleResetCharts = () => {
    if (window.confirm("Are you sure you want to completely clear your historical chart data?")) {
      const resetWeekly = weeklySalesData.map(d => ({ ...d, sales: 0, orders: 0 }));
      const resetCategory = categorySalesData.map(c => ({ ...c, value: 0 }));
      
      setWeeklySalesData(resetWeekly);
      setCategorySalesData(resetCategory);
    }
  };

  const recentOrders = orders.slice(0, 5).map(o => ({
    id: `ORD-${o.id.toString().slice(-4)}`,
    customer: o.customer,
    items: `${o.items.length} items`,
    total: `₱${o.total.toLocaleString()}.00`,
    status: 'delivered',
    date: new Date(o.date).toLocaleDateString()
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: 'white',
          padding: '10px 15px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          border: '1px solid #e2e8f0'
        }}>
          <p style={{ margin: 0, color: '#1e293b', fontWeight: 600 }}>
            {payload[0].payload.day || payload[0].payload.name}
          </p>
          <p style={{ margin: '4px 0 0 0', color: '#f97316', fontWeight: 600 }}>
            ₱{(payload[0].value || 0).toLocaleString()}
          </p>
          {payload[0].payload.orders && (
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
              Orders: {payload[0].payload.orders}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      <div className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back! Here's what's happening today.</p>
        </div>
        <button 
          onClick={handleResetCharts}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'white', border: '1px solid #ef4444', color: '#ef4444',
            padding: '0.6rem 1rem', borderRadius: '0.5rem', fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.2s', marginTop: '0.5rem'
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#fef2f2'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'white'; }}
        >
          <TrendingDown size={16} /> Reset Chart Data
        </button>
      </div>

      {/* Stats Grid */}
      <div className="dashboard-stats">
        {stats.map((stat, i) => (
          <div key={i} className="stat-card">
            <div className="stat-info">
              <h3>{stat.title}</h3>
              <div className="value">{stat.value}</div>
              <div className={`trend ${stat.up ? 'trend-up' : 'trend-down'}`}>
                {stat.up ? <ArrowUpRight size={14} /> : <TrendingDown size={14} />}
                {stat.trend}
              </div>
            </div>
            <div className="stat-icon">
              <stat.icon size={24} />
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="dashboard-charts">
        {/* Weekly Sales Chart */}
        <div className="chart-card">
          <h3>Weekly Sales</h3>
          {chartsLoading ? (
            <div className="chart-loading">
              <div className="loading-skeleton-bars">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="skeleton-bar"></div>
                ))}
              </div>
            </div>
          ) : (
            <div className="recharts-container">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklySalesData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="sales" 
                    fill="#f97316" 
                    radius={[8, 8, 0, 0]}
                    onMouseEnter={() => setHoveredBar(true)}
                    onMouseLeave={() => setHoveredBar(false)}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Category Sales Chart */}
        <div className="chart-card">
          <h3>Sales by Category</h3>
          {chartsLoading ? (
            <div className="chart-loading">
              <div className="loading-skeleton-pie">
                <div></div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
              <div className="pie-chart-container">
                <ResponsiveContainer width={150} height={150}>
                  <PieChart>
                    <Pie
                      data={categorySalesData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                      animationDuration={800}
                    >
                      {categorySalesData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => `₱${value}`}
                      contentStyle={{
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="category-legend">
                {categorySalesData.map((cat, i) => (
                  <div key={i} className="legend-item">
                    <div 
                      className="legend-color" 
                      style={{ background: cat.color }}
                    ></div>
                    <div className="legend-text">
                      <div className="legend-name">{cat.name}</div>
                      <div className="legend-value">₱{cat.value.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="recent-orders-card">
        <h3>Recent Orders</h3>
        {totalOrders === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
            No recent orders. Sales from the POS will appear here!
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id}>
                  <td style={{ fontWeight: 700, color: '#f97316' }}>{order.id}</td>
                  <td>{order.customer}</td>
                  <td>{order.items}</td>
                  <td>{order.total}</td>
                  <td>
                    <span className={`status-badge status-${order.status}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>{order.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;

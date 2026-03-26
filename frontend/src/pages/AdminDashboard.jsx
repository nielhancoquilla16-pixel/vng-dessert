import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
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
import { useOrders } from '../context/OrderContext';
import { useProducts } from '../context/ProductContext';
import { buildWeeklySalesData, getOrderRevenueEvents } from '../utils/orderAnalytics';
import './AdminDashboard.css';

const CATEGORY_RESET_STORAGE_KEY = 'vng_dashboard_category_reset_at';
const WEEKLY_RESET_STORAGE_KEY = 'vng_dashboard_weekly_reset_at';
const CATEGORY_COLORS = ['#f97316', '#fbbf24', '#fb923c', '#fed7aa', '#fdba74', '#fb7185', '#38bdf8'];
const DEFAULT_CATEGORY_SALES = [
  { name: 'Leche Flan', color: '#f97316' },
  { name: 'Choco', color: '#514016' },
  { name: 'Float', color: '#f4f82e' },
  { name: 'Ube', color: '#feaaf3' },
];

const safeStorage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore storage errors
    }
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  },
};

const parseCurrencyAmount = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;

  const parsed = parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (amount) => `PHP ${amount.toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const getOrderTimestamp = (order) => {
  const status = String(order?.status || order?.orderStatus || '').toLowerCase();
  const timestamps = order?.statusTimestamps || order?.status_timestamps || {};
  const source = (
    status === 'completed'
      ? timestamps.completed || order?.completedAt || order?.completed_at || order?.createdAt || order?.date
      : status === 'refunded'
        ? timestamps.refunded || order?.refundedAt || order?.refunded_at || order?.updatedAt || order?.updated_at || order?.createdAt || order?.date
        : order?.createdAt || order?.date
  );
  const parsed = source ? new Date(source).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const getStartOfSundayWeek = (value = new Date()) => {
  const date = new Date(value);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const getOrderLineItems = (order, productsByName) => {
  if (Array.isArray(order.lineItems) && order.lineItems.length > 0) {
    return order.lineItems.map((item) => {
      const product = productsByName.get((item.name || '').toLowerCase());
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || Number(product?.price) || 0;
      const rawCategory = (item.category || '').trim();
      const resolvedCategory = rawCategory && rawCategory.toLowerCase() !== 'uncategorized'
        ? rawCategory
        : (product?.category || item.name || 'Uncategorized');

      return {
        ...item,
        quantity,
        price,
        lineTotal: Number(item.lineTotal) || price * quantity,
        category: resolvedCategory,
      };
    });
  }

  if (typeof order.items !== 'string' || !order.items.trim()) {
    return [];
  }

  return order.items.split(', ').map((entry) => {
    const match = entry.match(/^(\d+)\s*(?:x|×|Ã—)\s+(.+)$/i);
    const quantity = Number(match?.[1]) || 0;
    const name = match?.[2] || entry;
    const product = productsByName.get(name.toLowerCase());
    const price = Number(product?.price) || 0;

    return {
      name,
      quantity,
      category: product?.category || name || 'Uncategorized',
      price,
      lineTotal: price * quantity,
    };
  });
};

const getOrderItemCount = (order, productsByName) => (
  getOrderLineItems(order, productsByName).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
);

const DashboardTooltip = ({ active, payload }) => {
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
          {formatCurrency(payload[0].value || 0)}
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

const AdminDashboard = () => {
  const { orders } = useOrders();
  const { products } = useProducts();
  const [chartsLoading, setChartsLoading] = useState(true);
  const [currentDateMarker, setCurrentDateMarker] = useState(() => Date.now());
  const [pendingResetAction, setPendingResetAction] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setChartsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(() => setCurrentDateMarker(Date.now()), Math.max(1000, nextMidnight.getTime() - now.getTime()));

    return () => clearTimeout(timer);
  }, [currentDateMarker]);

  const [weeklyResetAt, setWeeklyResetAt] = useState(() => {
    return safeStorage.getItem(WEEKLY_RESET_STORAGE_KEY) || '';
  });

  const [categoryResetAt, setCategoryResetAt] = useState(() => {
    return safeStorage.getItem(CATEGORY_RESET_STORAGE_KEY) || '';
  });

  useEffect(() => {
    if (weeklyResetAt) {
      safeStorage.setItem(WEEKLY_RESET_STORAGE_KEY, weeklyResetAt);
      return;
    }

    safeStorage.removeItem(WEEKLY_RESET_STORAGE_KEY);
  }, [weeklyResetAt]);

  useEffect(() => {
    if (categoryResetAt) {
      safeStorage.setItem(CATEGORY_RESET_STORAGE_KEY, categoryResetAt);
      return;
    }

    safeStorage.removeItem(CATEGORY_RESET_STORAGE_KEY);
  }, [categoryResetAt]);

  const storeProducts = products.filter((product) => !product.type || product.type === 'product');
  const productsByName = new Map(
    storeProducts.map((product) => [product.name.toLowerCase(), product])
  );

  const currentWeekStart = getStartOfSundayWeek(currentDateMarker);

  const currentWeekStartTimestamp = currentWeekStart.getTime();
  const parsedStoredWeeklyResetTimestamp = weeklyResetAt ? new Date(weeklyResetAt).getTime() : NaN;
  const effectiveWeeklyResetAt = Number.isFinite(parsedStoredWeeklyResetTimestamp)
    && parsedStoredWeeklyResetTimestamp >= currentWeekStartTimestamp
    ? weeklyResetAt
    : '';

  const weeklySalesData = buildWeeklySalesData(orders, {
    referenceDate: new Date(currentDateMarker),
    weekStart: currentWeekStart,
    resetAt: effectiveWeeklyResetAt || currentWeekStart.toISOString(),
  });

  const resetTimestamp = categoryResetAt ? new Date(categoryResetAt).getTime() : 0;
  const trackedCategoryOrders = orders.filter((order) => getOrderTimestamp(order) >= resetTimestamp);

  const totalRevenue = orders.reduce((sum, order) => (
    sum + getOrderRevenueEvents(order).reduce((eventTotal, event) => eventTotal + event.amount, 0)
  ), 0);
  const totalOrders = orders.length;
  const productCount = storeProducts.length;
  const uniqueCustomers = new Set(orders.map((order) => order.customer)).size;

  const stats = [
    { title: 'Total Revenue', value: formatCurrency(totalRevenue), trend: 'Live', up: true, icon: TrendingUp },
    { title: 'Total Orders', value: totalOrders.toString(), trend: 'Live', up: true, icon: ShoppingBag },
    { title: 'Products', value: productCount.toString(), trend: 'Active', up: true, icon: Package },
    { title: 'Customers', value: uniqueCustomers.toString(), trend: 'Active', up: true, icon: Users },
  ];

  const colorByCategory = new Map(
    DEFAULT_CATEGORY_SALES.map((category) => [category.name, category.color])
  );
  const categoryTotals = new Map();

  trackedCategoryOrders.forEach((order) => {
    const orderStatus = String(order.status || '').toLowerCase();
    const orderMultiplier = orderStatus === 'refunded' ? -1 : (orderStatus === 'completed' ? 1 : 0);

    if (orderMultiplier === 0) {
      return;
    }

    getOrderLineItems(order, productsByName).forEach((item) => {
      const categoryName = item.category || item.name || 'Uncategorized';
      const lineTotal = Number(item.lineTotal) || ((Number(item.price) || 0) * (Number(item.quantity) || 0));
      categoryTotals.set(categoryName, (categoryTotals.get(categoryName) || 0) + (lineTotal * orderMultiplier));
    });
  });

  const categorySalesData = (
    Array.from(categoryTotals.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
  ).map((entry, index) => ({
    ...entry,
    color: colorByCategory.get(entry.name) || CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }));

  const handleCategoryReset = () => {
    setCategoryResetAt(new Date().toISOString());
  };

  const handleWeeklyReset = () => {
    setWeeklyResetAt(new Date().toISOString());
  };

  const requestResetCharts = () => {
    setPendingResetAction('all');
  };

  const requestResetCategorySales = () => {
    setPendingResetAction('category');
  };

  const closeResetDialog = () => {
    setPendingResetAction(null);
  };

  const confirmResetAction = () => {
    if (pendingResetAction === 'all') {
      handleWeeklyReset();
      handleCategoryReset();
    } else if (pendingResetAction === 'category') {
      handleCategoryReset();
    }

    closeResetDialog();
  };

  const recentOrders = orders.slice(0, 5).map((order) => ({
    id: order.id,
    displayId: order.displayId || order.id,
    customer: order.customer,
    items: `${getOrderItemCount(order, productsByName)} items`,
    total: formatCurrency(Number(order.totalAmount) || parseCurrencyAmount(order.total)),
    status: order.status,
    date: new Date(order.createdAt || order.date).toLocaleDateString()
  }));

  return (
    <div>
      <div className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back! Here's what's happening today.</p>
        </div>
        <button
          onClick={requestResetCharts}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'white', border: '1px solid #ef4444', color: '#ef4444',
            padding: '0.6rem 1rem', borderRadius: '0.5rem', fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.2s', marginTop: '0.5rem'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'white'; }}
        >
          <TrendingDown size={16} /> Reset Chart Data
        </button>
      </div>

      <div className="dashboard-stats">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card">
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

      <div className="dashboard-charts">
        <div className="chart-card">
          <h3>Weekly Sales</h3>
          {chartsLoading ? (
            <div className="chart-loading">
              <div className="loading-skeleton-bars">
                {[...Array(7)].map((_, index) => (
                  <div key={index} className="skeleton-bar"></div>
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
                  <Tooltip content={<DashboardTooltip />} />
                  <Bar
                    dataKey="sales"
                    fill="#f97316"
                    radius={[8, 8, 0, 0]}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <h3>Sales by Category</h3>
            <button
              type="button"
              className="chart-reset-button"
              onClick={requestResetCategorySales}
            >
              Reset
            </button>
          </div>
          {chartsLoading ? (
            <div className="chart-loading">
              <div className="loading-skeleton-pie">
                <div></div>
              </div>
            </div>
          ) : categorySalesData.length === 0 ? (
            <div className="chart-empty-state">
              No category sales yet. New customer orders will appear here.
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
                      formatter={(value) => formatCurrency(value)}
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
                {categorySalesData.map((category, index) => (
                  <div key={index} className="legend-item">
                    <div
                      className="legend-color"
                      style={{ background: category.color }}
                    ></div>
                    <div className="legend-text">
                      <div className="legend-name">{category.name}</div>
                      <div className="legend-value">{formatCurrency(category.value)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

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
                  <td style={{ fontWeight: 700, color: '#f97316' }}>{order.displayId}</td>
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

      {pendingResetAction && (
        <div className="modal-overlay" onClick={closeResetDialog}>
          <div
            className="modal-content dashboard-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dashboard-confirm-icon">
              <AlertTriangle size={28} />
            </div>
            <h2 className="dashboard-confirm-title">
              {pendingResetAction === 'all' ? 'Reset All Chart Data?' : 'Reset Sales by Category?'}
            </h2>
            <p className="dashboard-confirm-message">
              {pendingResetAction === 'all'
                ? 'This will clear this week\'s sales chart and restart category tracking from this moment. The weekly sales chart also resets automatically every Sunday.'
                : 'This will clear the current category totals. New customer orders will start counting after the reset.'}
            </p>
            <div className="dashboard-confirm-actions">
              <button
                type="button"
                className="dashboard-confirm-cancel"
                onClick={closeResetDialog}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-confirm-submit"
                onClick={confirmResetAction}
              >
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

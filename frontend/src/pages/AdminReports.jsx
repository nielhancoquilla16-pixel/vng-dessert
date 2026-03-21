import { DollarSign, ShoppingBag, TrendingUp, Trophy, Sparkles, Brain, Zap } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useOrders } from '../context/OrderContext';
import { useProducts } from '../context/ProductContext';
import { useAI } from '../context/AIContext';
import {
  buildTopProducts,
  buildWeeklyHistory,
  buildWeeklySalesData,
  formatCurrency,
  getOrderTotalAmount,
  getStartOfSundayWeek,
} from '../utils/orderAnalytics';
import './AdminReports.css';

const AdminReports = () => {
  const { orders } = useOrders();
  const { products } = useProducts();
  const { salesInsights, isAnalyzing } = useAI();

  const storeProducts = products.filter((product) => !product.type || product.type === 'product');
  const productsByName = new Map(
    storeProducts.map((product) => [product.name.toLowerCase(), product])
  );

  const activeOrders = orders.filter((order) => order.status !== 'cancelled');
  const totalRevenue = activeOrders.reduce((sum, order) => sum + getOrderTotalAmount(order), 0);
  const deliveredCount = orders.filter((order) => order.status === 'delivered').length;
  const activeCount = activeOrders.length;
  const avgOrderValue = activeCount > 0 ? totalRevenue / activeCount : 0;

  const weeklySalesData = buildWeeklySalesData(orders);
  const currentWeekRevenue = weeklySalesData.reduce((sum, day) => sum + day.sales, 0);
  const currentWeekOrders = weeklySalesData.reduce((sum, day) => sum + day.orders, 0);
  const weeklyHistory = buildWeeklyHistory(orders);
  const weeklyHistoryRows = [...weeklyHistory].reverse();
  const currentWeekKey = getStartOfSundayWeek().toISOString();
  const historyChartData = weeklyHistory.slice(-8).map((entry) => ({
    ...entry,
    shortLabel: entry.weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));

  const bestWeek = weeklyHistory.reduce((best, week) => {
    if (!best || week.revenue > best.revenue) {
      return week;
    }

    return best;
  }, null);

  const topProducts = buildTopProducts(orders, productsByName);
  const topSalesCount = topProducts.length > 0 ? topProducts[0].sales : 1;
  const topProductsList = topProducts.slice(0, 5).map((product) => ({
    ...product,
    percent: Math.round((product.sales / topSalesCount) * 100),
  }));
  const topSeller = topProductsList.length > 0 ? topProductsList[0].name : (activeCount > 0 ? 'No item data' : 'None');

  const salesTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    const point = payload[0].payload;

    return (
      <div className="report-tooltip">
        <div className="report-tooltip-title">{point.label || label}</div>
        <div className="report-tooltip-value">{formatCurrency(point.revenue ?? point.sales ?? 0)}</div>
        {'orders' in point && (
          <div className="report-tooltip-meta">{point.orders} orders</div>
        )}
        {typeof point.averageOrderValue === 'number' && (
          <div className="report-tooltip-meta">
            Avg Order: {formatCurrency(point.averageOrderValue)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="admin-reports">
      <div className="admin-products-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Reports & Analytics</h1>
          <p style={{ color: '#64748b' }}>Sales overview and performance metrics</p>
        </div>
      </div>

      <div className="ai-insights-container">
        <div className="ai-header">
          <div className="ai-title">
            <Sparkles className="ai-icon" size={24} />
            Llama AI Business Insights
          </div>
          {isAnalyzing && <div className="ai-analyzing-badge"><Zap size={14} className="spin" /> Analyzing Trends...</div>}
        </div>

        <div className="ai-content-grid">
          <div className="ai-main-card">
            <div className="ai-summary-label"><Brain size={18} /> Sales Summary</div>
            <p className="ai-summary-text">
              {salesInsights?.summary || 'Analyzing recent order history to generate your business summary...'}
            </p>
            <div className="ai-action-list">
              {salesInsights?.details?.map((detail, index) => (
                <div key={index} className="ai-action-item">
                  <div className="ai-bullet"></div>
                  {detail}
                </div>
              ))}
            </div>
          </div>

          <div className="ai-stat-card">
            <div className="ai-stat-label">AI Confidence</div>
            <div className="ai-stat-value">{salesInsights?.confidence || '--'}%</div>
            <div className="ai-stat-meter">
              <div className="ai-stat-fill" style={{ width: `${salesInsights?.confidence || 0}%` }}></div>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '1rem' }}>
              Statistically calculated based on {orders?.length || 0} historical data points.
            </p>
          </div>
        </div>
      </div>

      <div className="reports-grid">
        <div className="report-card">
          <div className="report-label"><DollarSign size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Total Revenue</div>
          <div className="report-value">{formatCurrency(totalRevenue)}</div>
        </div>
        <div className="report-card">
          <div className="report-label"><ShoppingBag size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Delivered</div>
          <div className="report-value">{deliveredCount}</div>
        </div>
        <div className="report-card">
          <div className="report-label"><TrendingUp size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Avg Order</div>
          <div className="report-value">{formatCurrency(avgOrderValue)}</div>
        </div>
        <div className="report-card">
          <div className="report-label"><Trophy size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Top Seller</div>
          <div className="report-value" style={{ fontSize: activeCount > 0 ? '1.1rem' : '1.25rem' }}>{topSeller}</div>
        </div>
      </div>

      <div className="charts-row">
        <div className="chart-container">
          <div className="report-section-header">
            <div>
              <h3 className="chart-title">Weekly Sales History</h3>
              <p className="chart-subtitle">Automatically recorded from real orders every Sunday-to-Saturday week.</p>
            </div>
            {bestWeek && (
              <div className="report-highlight-chip">
                Best Week: {formatCurrency(bestWeek.revenue)}
              </div>
            )}
          </div>

          {historyChartData.length === 0 ? (
            <div className="chart-empty-state">
              No weekly sales history yet. New non-cancelled orders will be recorded here automatically.
            </div>
          ) : (
            <div className="reports-chart-shell">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={historyChartData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="shortLabel" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip content={salesTooltip} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#f97316"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#f97316' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="chart-container">
          <div className="report-section-header">
            <div>
              <h3 className="chart-title">Current Week Sales</h3>
              <p className="chart-subtitle">This week refreshes automatically every Sunday.</p>
            </div>
            <div className="report-highlight-chip">
              {formatCurrency(currentWeekRevenue)} | {currentWeekOrders} orders
            </div>
          </div>

          {currentWeekOrders === 0 ? (
            <div className="chart-empty-state">
              No sales yet for this week. Once customers order, the daily chart will update automatically.
            </div>
          ) : (
            <div className="reports-chart-shell">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklySalesData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip content={salesTooltip} />
                  <Bar dataKey="sales" fill="#fb923c" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="chart-container">
        <div className="report-section-header">
          <div>
            <h3 className="chart-title">Weekly Sales Report History</h3>
            <p className="chart-subtitle">Review each completed sales week with total revenue, orders, and average order value.</p>
          </div>
        </div>

        {weeklyHistoryRows.length === 0 ? (
          <div className="chart-empty-state">
            Weekly report history will appear here after the first customer or POS sale is recorded.
          </div>
        ) : (
          <div className="weekly-history-list">
            {weeklyHistoryRows.map((week) => (
              <div key={week.key} className="weekly-history-row">
                <div className="weekly-history-main">
                  <div className="weekly-history-week">
                    {week.key === currentWeekKey ? 'Current Week' : 'Weekly Report'}
                  </div>
                  <div className="weekly-history-range">{week.label}</div>
                  <div className="weekly-history-meta">
                    {week.orders} orders | Avg {formatCurrency(week.averageOrderValue)}
                  </div>
                </div>
                <div className="weekly-history-value">{formatCurrency(week.revenue)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chart-container">
        <h3 className="chart-title">Top Selling Products</h3>
        <div className="top-selling-list">
          {topProductsList.length === 0 ? (
            <div className="chart-empty-state">
              No sales data yet. Complete orders in the POS or customer checkout to see top products.
            </div>
          ) : (
            topProductsList.map((product, index) => (
              <div key={product.name} className="top-selling-item">
                <div className="rank-text">#{index + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 700 }}>{product.name}</span>
                    <span style={{ fontWeight: 800 }}>{product.sales} Sold</span>
                  </div>
                  <div className="selling-bar-bg">
                    <div className="selling-bar-fill" style={{ width: `${product.percent}%`, background: '#f97316', height: '100%', borderRadius: '999px' }}></div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminReports;

import { DollarSign, ShoppingBag, TrendingUp, Trophy, Sparkles, Brain, Zap } from 'lucide-react';
import { useOrders } from '../context/OrderContext';
import { useAI } from '../context/AIContext';
import './AdminReports.css';

const AdminReports = () => {
  const { orders } = useOrders();
  const { salesInsights, isAnalyzing } = useAI();

  // Filter out cancelled orders
  const activeOrders = orders.filter(o => o.status !== 'cancelled');

  // Calculate dynamic metrics
  const totalRevenue = activeOrders.reduce((sum, o) => {
    const val = parseFloat(o.total.replace(/[^0-9.]/g, ''));
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  
  const deliveredCount = orders.filter(o => o.status === 'delivered').length; 
  const activeCount = activeOrders.length;
  const avgOrderValue = activeCount > 0 ? (totalRevenue / activeCount).toFixed(2) : '0.00';

  // Calculate top products
  const productSalesMap = {};
  activeOrders.forEach(order => {
    if (order.items) {
      const itemsList = order.items.split(', ');
      itemsList.forEach(itemStr => {
        const match = itemStr.match(/^(\d+)×\s+(.+)$/);
        if (match) {
          const qty = parseInt(match[1]);
          const name = match[2];
          productSalesMap[name] = (productSalesMap[name] || 0) + qty;
        }
      });
    }
  });

  const sortedProducts = Object.entries(productSalesMap)
    .map(([name, sales]) => ({ name, sales }))
    .sort((a, b) => b.sales - a.sales);

  const topSalesCount = sortedProducts.length > 0 ? sortedProducts[0].sales : 1;
  const topProducts = sortedProducts.slice(0, 5).map(p => ({
    ...p,
    percent: Math.round((p.sales / topSalesCount) * 100)
  }));

  const topSeller = topProducts.length > 0 ? topProducts[0].name : "None";

  return (
    <div>
      <div className="admin-products-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Reports & Analytics</h1>
          <p style={{ color: '#64748b' }}>Sales overview and performance metrics</p>
        </div>
      </div>

      {/* Llama AI Insights Section */}
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
              {salesInsights?.summary || "Analyzing recent order history to generate your business summary..."}
            </p>
            <div className="ai-action-list">
              {salesInsights?.details.map((detail, i) => (
                <div key={i} className="ai-action-item">
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
          <div className="report-value">₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="report-card">
          <div className="report-label"><ShoppingBag size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Delivered</div>
          <div className="report-value">{deliveredCount}</div>
        </div>
        <div className="report-card">
          <div className="report-label"><TrendingUp size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Avg Order</div>
          <div className="report-value">₱{avgOrderValue}</div>
        </div>
        <div className="report-card">
          <div className="report-label"><Trophy size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Top Seller</div>
          <div className="report-value" style={{ fontSize: activeCount > 0 ? '1.1rem' : '1.25rem' }}>{topSeller}</div>
        </div>
      </div>

      <div className="charts-row">
        <div className="chart-container">
          <h3 className="chart-title">Monthly Revenue</h3>
          <div className="line-chart-mock">
             <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                <path d="M 50 150 Q 150 130 250 80 T 450 140 T 650 120 T 850 60" fill="none" stroke="#f97316" strokeWidth="3" />
             </svg>
             {['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((m, i) => (
                <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                   <div className="line-point"></div>
                   <div className="bar-label">{m}</div>
                </div>
             ))}
          </div>
        </div>

        <div className="chart-container">
          <h3 className="chart-title">Daily Orders</h3>
          <div className="bar-chart-mock">
            {[
              { day: 'Mon', val: 50 },
              { day: 'Tue', val: 70 },
              { day: 'Wed', val: 40 },
              { day: 'Thu', val: 90 },
              { day: 'Fri', val: 130 },
              { day: 'Sat', val: 180 },
              { day: 'Sun', val: 120 },
            ].map(d => (
              <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className="bar-item" style={{ height: `${d.val}px` }}></div>
                <div className="bar-label">{d.day}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-container">
        <h3 className="chart-title">Top Selling Products</h3>
        <div className="top-selling-list">
          {activeCount === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              No sales data yet. Complete orders in the POS to see top products!
            </div>
          ) : (
            topProducts.map((p, i) => (
              <div key={p.name} className="top-selling-item">
                <div className="rank-text">#{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 700 }}>{p.name}</span>
                    <span style={{ fontWeight: 800 }}>{p.sales} Sold</span>
                  </div>
                  <div className="selling-bar-bg">
                    <div className="selling-bar-fill" style={{ width: `${p.percent}%`, background: '#f97316', height: '100%', borderRadius: '999px' }}></div>
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

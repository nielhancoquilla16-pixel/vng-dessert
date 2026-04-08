import React, { useState } from 'react';
import {
  BadgeCheck,
  DollarSign,
  ShieldAlert,
  RotateCcw,
  ShoppingBag,
  Zap,
  XCircle,
} from 'lucide-react';
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
import {
  buildTopProducts,
  buildWeeklyHistory,
  buildWeeklySalesData,
  formatCurrency,
  getOrderTotalAmount,
  getStartOfSundayWeek,
  getOrderRevenueEvents,
} from '../utils/orderAnalytics';
import { normalizeReviewStatus } from '../utils/orderWorkflow';
import './AdminReports.css';

const AdminReports = () => {
  const { orders, reviewOrderIssue } = useOrders();
  const { products } = useProducts();
  const [pageNotice, setPageNotice] = useState('');
  const [pageError, setPageError] = useState('');
  const [loadingReportId, setLoadingReportId] = useState('');
  const [reviewDrafts, setReviewDrafts] = useState({});

  const storeProducts = products.filter((product) => !product.type || product.type === 'product');
  const productsByName = new Map(
    storeProducts.map((product) => [product.name.toLowerCase(), product])
  );

  const totalRevenue = orders.reduce((sum, order) => (
    sum + getOrderRevenueEvents(order).reduce((eventTotal, event) => eventTotal + event.amount, 0)
  ), 0);
  const recordedSalesCount = orders.filter((order) => (
    getOrderRevenueEvents(order).reduce((eventTotal, event) => eventTotal + event.amount, 0) > 0
  )).length;
  const returnedCount = orders.filter((order) => order.status === 'refunded').length;
  const underReviewCount = orders.filter((order) => normalizeReviewStatus(order.reviewStatus) === 'under_review').length;
  const activeCount = orders.filter((order) => !['completed', 'cancelled', 'refunded'].includes(order.status)).length;

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

  const issueReports = orders
    .flatMap((order) => (order.issueReports || []).map((report) => ({
      ...report,
      orderId: order.displayId || order.orderCode || order.id,
      orderCustomer: order.customer || 'Customer',
      orderStatus: order.status,
      orderTotal: order.total,
    })))
    .sort((left, right) => new Date(right.detectionDate || right.createdAt || 0).getTime() - new Date(left.detectionDate || left.createdAt || 0).getTime());

  const pendingReports = issueReports.filter((report) => normalizeReviewStatus(report.reviewStatus) === 'under_review');
  const formatIssueType = (value) => String(value || 'damage').replace(/_/g, ' ');

  const setDraft = (reportId, patch) => {
    setReviewDrafts((current) => ({
      ...current,
      [reportId]: {
        ...(current[reportId] || { decision: 'approve', reason: '' }),
        ...patch,
      },
    }));
  };

  const handleReviewDecision = async (reportId, decision) => {
    const draft = reviewDrafts[reportId] || { decision: 'approve', reason: '' };
    const reason = String(draft.reason || '').trim();

    if (String(decision).toLowerCase().startsWith('reject') && !reason) {
      setReviewDrafts((current) => ({
        ...current,
        [reportId]: {
          ...(current[reportId] || { decision: 'reject', reason: '' }),
          error: 'A rejection reason is required.',
        },
      }));
      return;
    }

    setLoadingReportId(reportId);
    setPageError('');

    try {
      await reviewOrderIssue(reportId, decision, reason);
      setPageNotice(decision.toLowerCase().startsWith('approve')
        ? 'Return approved and any recorded sale has been adjusted.'
        : 'Return request rejected and the customer was notified.');
      setReviewDrafts((current) => ({ ...current, [reportId]: undefined }));
    } catch (error) {
      setPageError(error.message || 'Unable to process that report right now.');
    } finally {
      setLoadingReportId('');
    }
  };

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
        </div>
      </div>

      {(pageNotice || pageError) && (
        <div className="admin-report-alert-stack" aria-live="polite">
          {pageNotice && (
            <div className="admin-report-alert admin-report-alert--success">
              <BadgeCheck size={18} />
              <span>{pageNotice}</span>
            </div>
          )}
          {pageError && (
            <div className="admin-report-alert admin-report-alert--error">
              <XCircle size={18} />
              <span>{pageError}</span>
            </div>
          )}
        </div>
      )}

      <div className="reports-grid">
        <div className="report-card">
          <div className="report-label"><DollarSign size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Total Revenue</div>
          <div className="report-value">{formatCurrency(totalRevenue)}</div>
        </div>
        <div className="report-card">
          <div className="report-label"><ShoppingBag size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Recorded Sales</div>
          <div className="report-value">{recordedSalesCount}</div>
        </div>
        <div className="report-card">
          <div className="report-label"><ShieldAlert size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Under Review</div>
          <div className="report-value">{underReviewCount}</div>
        </div>
        <div className="report-card">
          <div className="report-label"><RotateCcw size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Returned</div>
          <div className="report-value">{returnedCount}</div>
        </div>
      </div>

      <div className="charts-row">
        <div className="chart-container">
          <div className="report-section-header">
            <div>
              <h3 className="chart-title">Weekly Sales History</h3>
              <p className="chart-subtitle">Recorded from walk-in checkout completion and customer-confirmed online orders every Sunday-to-Saturday week.</p>
            </div>
            {bestWeek && (
              <div className="report-highlight-chip">
                Best Week: {formatCurrency(bestWeek.revenue)}
              </div>
            )}
          </div>

          {historyChartData.length === 0 ? (
            <div className="chart-empty-state">
              No weekly sales history yet. Sales appear after walk-in checkout or customer confirmation for online orders.
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
              No sales yet for this week. Walk-ins count immediately, while online orders count after customer confirmation.
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
              No sales data yet. Complete walk-in checkout or customer-confirm an online order to see top products.
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

      <div className="chart-container">
        <div className="report-section-header">
          <div>
            <h3 className="chart-title">Return Requests Queue</h3>
            <p className="chart-subtitle">Approve or reject return requests after reviewing the image proof and order details.</p>
          </div>
          <div className="report-highlight-chip">
            {pendingReports.length} under review
          </div>
        </div>

        {pendingReports.length === 0 ? (
          <div className="chart-empty-state">
            No active issue reports right now. New customer reports will appear here with evidence and review controls.
          </div>
        ) : (
          <div className="issue-report-list">
            {pendingReports.map((report) => {
              const draft = reviewDrafts[report.id] || { decision: 'approve', reason: '' };
              const loading = loadingReportId === report.id;

              return (
                <article key={report.id} className="issue-report-card">
                  <div className="issue-report-header">
                    <div>
                      <p className="issue-report-kicker">Order {report.orderId}</p>
                      <h4>{report.customerName || report.orderCustomer || 'Customer'}</h4>
                    <p className="issue-report-meta">
                        {formatIssueType(report.issueType)} - {report.orderStatus} - {formatCurrency(getOrderTotalAmount({
                          total: report.orderTotal,
                        }))}
                    </p>
                    </div>
                    <span className="issue-report-badge">Under Review</span>
                  </div>

                  <div className="issue-report-grid">
                    <div className="issue-report-copy">
                      <span>Description</span>
                      <p>{report.description}</p>
                    </div>
                    <div className="issue-report-copy">
                      <span>Date of Detection</span>
                      <p>{new Date(report.detectionDate || report.createdAt || Date.now()).toLocaleString()}</p>
                    </div>
                  </div>

                  {report.evidenceImageUrl && (
                    <div className="issue-report-image-wrap">
                      <img src={report.evidenceImageUrl} alt="Customer issue proof" className="issue-report-image" />
                    </div>
                  )}

                  <div className="issue-report-form">
                    <label>
                      Review Reason
                      <textarea
                        className="issue-report-textarea"
                        value={draft.reason || ''}
                        onChange={(event) => setDraft(report.id, { reason: event.target.value, error: '' })}
                        placeholder="Add a return approval note or a rejection reason."
                      />
                    </label>
                    {draft.error && <div className="issue-report-error">{draft.error}</div>}
                    <div className="issue-report-actions">
                      <button
                        type="button"
                        className="issue-report-action issue-report-action--approve"
                        onClick={() => void handleReviewDecision(report.id, 'approve')}
                        disabled={loading}
                      >
                        {loading ? <Zap size={16} className="spin" /> : <BadgeCheck size={16} />}
                        Approve Return
                      </button>
                      <button
                        type="button"
                        className="issue-report-action issue-report-action--reject"
                        onClick={() => void handleReviewDecision(report.id, 'reject')}
                        disabled={loading}
                      >
                        {loading ? <Zap size={16} className="spin" /> : <XCircle size={16} />}
                        Reject Return
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminReports;

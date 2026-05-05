import React, { useMemo, useState } from 'react';
import {
  BadgeCheck,
  BarChart3,
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  Package,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Trophy,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { useSalesReports } from '../context/SalesReportContext';
import {
  aggregateSalesReportItems,
  downloadSalesReportCsv,
  filterSalesReports,
  formatDateTime,
  formatPeso,
  formatShortDate,
  getSummaryTotals,
  openSalesReportPrintView,
} from '../utils/salesReports';
import './AdminReports.css';

const toInputDate = (date) => {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
};

const parseInputDate = (value = '') => {
  const parsed = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addDays = (date, count) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + count);
  return copy;
};

const getWeekRange = (baseDate = new Date()) => {
  const date = new Date(baseDate);
  const day = date.getDay();
  const offset = day === 0 ? 6 : day - 1;
  const start = addDays(date, -offset);
  const end = addDays(start, 6);
  return {
    startDate: toInputDate(start),
    endDate: toInputDate(end),
  };
};

const getMonthRange = (baseDate = new Date()) => {
  const date = new Date(baseDate);
  return {
    startDate: toInputDate(new Date(date.getFullYear(), date.getMonth(), 1)),
    endDate: toInputDate(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
};

const getDefaultFilters = () => ({
  period: 'weekly',
  ...getWeekRange(),
  staffId: 'all',
});

const SALES_REPORT_BASELINE_KEY = 'vng-sales-report-baseline-at';

const getInitialReportBaseline = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const existingBaseline = window.localStorage.getItem(SALES_REPORT_BASELINE_KEY);
  if (existingBaseline) {
    return existingBaseline;
  }

  const baseline = new Date().toISOString();
  window.localStorage.setItem(SALES_REPORT_BASELINE_KEY, baseline);
  return baseline;
};

const getStaffDisplayName = (report = {}) => (
  report.staff?.fullName
  || report.staff?.username
  || 'Staff Member'
);

const getStaffOptions = (staffAccounts = [], reports = [], userRole = 'staff', profile = null) => {
  const options = new Map();

  options.set('all', {
    id: 'all',
    label: userRole === 'admin' ? 'All Staff' : (profile?.fullName || profile?.username || 'My Reports'),
  });

  if (userRole === 'admin') {
    staffAccounts.forEach((staff) => {
      options.set(staff.id, {
        id: staff.id,
        label: staff.fullName || staff.username || 'Staff Member',
      });
    });

    reports.forEach((report) => {
      if (!report.staffId) {
        return;
      }

      options.set(report.staffId, {
        id: report.staffId,
        label: getStaffDisplayName(report),
      });
    });
  }

  return Array.from(options.values());
};

const getDateRangeLabel = ({ startDate = '', endDate = '' }) => {
  if (startDate && endDate && startDate !== endDate) {
    return `${formatShortDate(startDate)} to ${formatShortDate(endDate)}`;
  }

  return formatShortDate(startDate || endDate);
};

const isDateInRange = (value = '', startDate = '', endDate = '') => {
  const dateKey = String(value || '').slice(0, 10);
  if (!dateKey) {
    return false;
  }

  if (startDate && dateKey < startDate) {
    return false;
  }

  if (endDate && dateKey > endDate) {
    return false;
  }

  return true;
};

const getIssueTypeLabel = (value = '') => (
  String(value || 'return').replace(/_/g, ' ')
);

const getReturnProductName = (report = {}) => (
  report.productName
  || report.product_name
  || report.itemName
  || report.item_name
  || report.orderItemsText
  || report.orderItems
  || 'Order item'
);

const getReturnQuantity = (report = {}) => (
  Number(report.quantityReturned ?? report.quantity_returned ?? report.quantity ?? 1) || 1
);

const buildReturnHistory = (orders = [], filters = {}) => (
  orders
    .flatMap((order) => (order.issueReports || [])
      .filter((report) => (
        String(report.reviewStatus || report.status || '').toLowerCase() === 'approved'
        || String(order.status || order.orderStatus || '').toLowerCase() === 'refunded'
      ))
      .map((report) => ({
        ...report,
        orderId: order.displayId || order.orderCode || order.id,
        orderItems: order.itemsText || order.items || '',
        orderItemsText: order.itemsText || order.items || '',
        orderCustomer: order.customer || report.customerName || 'Customer',
        date: String(report.reviewedAt || report.detectionDate || report.createdAt || '').slice(0, 10),
      })))
    .filter((report) => isDateInRange(report.date, filters.startDate, filters.endDate))
    .sort((left, right) => (
      new Date(right.detectionDate || right.createdAt || 0).getTime()
      - new Date(left.detectionDate || left.createdAt || 0).getTime()
    ))
);

const buildChartData = (reports = [], filters = {}) => {
  const start = parseInputDate(filters.startDate);
  const end = parseInputDate(filters.endDate);

  if (!start || !end || start > end) {
    return [];
  }

  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  const groupByWeek = filters.period === 'monthly' || dayCount > 14;
  const groups = new Map();

  if (groupByWeek) {
    const cursor = new Date(start);
    let index = 1;
    while (cursor <= end) {
      const bucketStart = new Date(cursor);
      const bucketEnd = addDays(bucketStart, 6);
      const cappedEnd = bucketEnd > end ? end : bucketEnd;
      groups.set(`week-${index}`, {
        key: `week-${index}`,
        label: `Week ${index}`,
        rangeLabel: `${formatShortDate(toInputDate(bucketStart))} - ${formatShortDate(toInputDate(cappedEnd))}`,
        sales: 0,
      });
      cursor.setDate(cursor.getDate() + 7);
      index += 1;
    }
  } else {
    Array.from({ length: dayCount }, (_, index) => addDays(start, index)).forEach((date) => {
      const dateKey = toInputDate(date);
      groups.set(dateKey, {
        key: dateKey,
        label: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        rangeLabel: formatShortDate(dateKey),
        sales: 0,
      });
    });
  }

  reports.forEach((report) => {
    const reportDate = String(report.reportDate || report.createdAt || '').slice(0, 10);
    const parsedDate = parseInputDate(reportDate);
    if (!parsedDate) {
      return;
    }

    let key = reportDate;
    if (groupByWeek) {
      const diff = Math.floor((parsedDate.getTime() - start.getTime()) / 86400000);
      key = `week-${Math.floor(diff / 7) + 1}`;
    }

    const group = groups.get(key);
    if (group) {
      group.sales += Number(report.totalSales) || 0;
    }
  });

  return Array.from(groups.values());
};

const AdminReports = () => {
  const { profile, staffAccounts, userRole } = useAuth();
  const { orders } = useOrders();
  const {
    salesReports,
    isSalesReportsLoading,
    refreshSalesReports,
  } = useSalesReports();
  const [pageNotice, setPageNotice] = useState('');
  const [pageError, setPageError] = useState('');
  const [draftFilters, setDraftFilters] = useState(() => getDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => getDefaultFilters());
  const [generatedAt, setGeneratedAt] = useState(() => new Date().toISOString());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [reportBaselineAt, setReportBaselineAt] = useState(() => getInitialReportBaseline());

  const staffOptions = useMemo(
    () => getStaffOptions(staffAccounts, salesReports, userRole, profile),
    [profile, salesReports, staffAccounts, userRole],
  );

  const filteredReports = useMemo(() => {
    const baselineTime = reportBaselineAt ? new Date(reportBaselineAt).getTime() : 0;
    return filterSalesReports(salesReports, {
      month: '',
      staffId: userRole === 'admin' ? appliedFilters.staffId : 'all',
      paymentType: 'all',
      dateFrom: appliedFilters.startDate,
      dateTo: appliedFilters.endDate,
    }).filter((report) => {
      if (!baselineTime) {
        return true;
      }

      const reportTime = new Date(report.submittedAt || report.updatedAt || report.createdAt || report.reportDate || '').getTime();
      return Number.isFinite(reportTime) && reportTime >= baselineTime;
    });
  }, [appliedFilters, reportBaselineAt, salesReports, userRole]);

  const summaryRows = useMemo(() => aggregateSalesReportItems(filteredReports), [filteredReports]);
  const normalizedSearch = itemSearch.trim().toLowerCase();
  const visibleSummaryRows = normalizedSearch
    ? summaryRows.filter((row) => row.itemName.toLowerCase().includes(normalizedSearch))
    : summaryRows;
  const totals = getSummaryTotals(summaryRows);
  const topProducts = [...summaryRows]
    .sort((left, right) => right.quantity - left.quantity || right.totalSales - left.totalSales)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  const returnHistory = useMemo(() => {
    const baselineTime = reportBaselineAt ? new Date(reportBaselineAt).getTime() : 0;
    return buildReturnHistory(orders, appliedFilters).filter((report) => {
      if (!baselineTime) {
        return true;
      }

      const reportTime = new Date(report.reviewedAt || report.detectionDate || report.createdAt || report.date || '').getTime();
      return Number.isFinite(reportTime) && reportTime >= baselineTime;
    });
  }, [appliedFilters, orders, reportBaselineAt]);
  const totalReturns = returnHistory.reduce((sum, report) => sum + getReturnQuantity(report), 0);
  const exportReturnRows = returnHistory.map((report) => ({
    date: formatShortDate(report.date),
    productName: getReturnProductName(report),
    quantityReturned: getReturnQuantity(report),
    reason: getIssueTypeLabel(report.issueType),
  }));
  const chartData = useMemo(
    () => buildChartData(filteredReports, appliedFilters),
    [appliedFilters, filteredReports],
  );
  const selectedStaff = staffOptions.find((option) => option.id === appliedFilters.staffId);
  const staffLabel = userRole === 'admin'
    ? (selectedStaff?.label || 'All Staff')
    : (profile?.fullName || profile?.username || 'My Reports');
  const rangeLabel = getDateRangeLabel(appliedFilters);
  const periodLabel = appliedFilters.period === 'monthly'
    ? 'Monthly'
    : appliedFilters.period === 'weekly'
      ? 'Weekly'
      : 'Custom Range';

  const handleRefresh = async () => {
    setPageError('');
    setIsRefreshing(true);

    try {
      await refreshSalesReports();
      setPageNotice('Sales report data refreshed.');
    } catch (error) {
      setPageError(error.message || 'Unable to refresh sales reports right now.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResetDisplayedTotals = () => {
    const baseline = new Date().toISOString();
    window.localStorage.setItem(SALES_REPORT_BASELINE_KEY, baseline);
    setReportBaselineAt(baseline);
    setGeneratedAt(baseline);
    setPageError('');
    setPageNotice('Sales report totals reset for testing. New completed orders will be counted from now.');
  };

  const handlePeriodChange = (period) => {
    const baseDate = parseInputDate(draftFilters.startDate) || new Date();
    const nextRange = period === 'monthly'
      ? getMonthRange(baseDate)
      : period === 'weekly'
        ? getWeekRange(baseDate)
        : {
            startDate: draftFilters.startDate,
            endDate: draftFilters.endDate,
          };

    setDraftFilters((currentFilters) => ({
      ...currentFilters,
      period,
      ...nextRange,
    }));
  };

  const handleDateChange = (field, value) => {
    setDraftFilters((currentFilters) => ({
      ...currentFilters,
      period: currentFilters.period === 'custom' ? 'custom' : currentFilters.period,
      [field]: value,
    }));
  };

  const handleGenerateReport = (event) => {
    event.preventDefault();
    setPageNotice('');
    setPageError('');

    if (!draftFilters.startDate || !draftFilters.endDate) {
      setPageError('Select a start and end date before generating the report.');
      return;
    }

    if (draftFilters.startDate > draftFilters.endDate) {
      setPageError('The start date must be before the end date.');
      return;
    }

    setAppliedFilters({
      ...draftFilters,
      staffId: userRole === 'admin' ? draftFilters.staffId : 'all',
    });
    setGeneratedAt(new Date().toISOString());
    setPageNotice('Sales report generated.');
  };

  const handleDownloadCsv = () => {
    if (summaryRows.length === 0) {
      setPageError('There is no generated sales data to export yet.');
      return;
    }

    downloadSalesReportCsv({
      summaryRows,
      totals,
      monthLabel: rangeLabel,
      staffLabel,
      paymentLabel: `${periodLabel} Report`,
      reportCount: filteredReports.length,
      returnRows: exportReturnRows,
      returnTotal: totalReturns,
    });
  };

  const handleOpenPrintView = (mode = 'print') => {
    if (summaryRows.length === 0) {
      setPageError('There is no generated sales data to export yet.');
      return;
    }

    const opened = openSalesReportPrintView({
      mode,
      heading: 'Sales Report',
      monthLabel: rangeLabel,
      staffLabel,
      paymentLabel: `${periodLabel} Report`,
      summaryRows,
      totals,
      reportCount: filteredReports.length,
      submittedReports: filteredReports,
      returnRows: exportReturnRows,
      returnTotal: totalReturns,
    });

    if (!opened) {
      setPageError('The print view was blocked by your browser. Please allow pop-ups and try again.');
    }
  };

  return (
    <div className="admin-sales-reports">
      <div className="admin-sales-reports__header">
        <div className="admin-sales-title">
          <span className="admin-sales-title__icon">
            <BarChart3 size={24} />
          </span>
          <div>
            <h1>Sales Report</h1>
            <p>View and analyze sales performance.</p>
          </div>
        </div>

        <div className="admin-sales-reports__actions">
          <button
            type="button"
            className="report-secondary-button"
            onClick={handleResetDisplayedTotals}
          >
            <RotateCcw size={16} />
            Reset Totals
          </button>
          <button
            type="button"
            className="report-secondary-button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
          >
            <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
            Refresh
          </button>
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

      <section className="sales-report-toolbar" aria-label="Sales report filters">
        <form className="sales-report-toolbar__form" onSubmit={handleGenerateReport}>
          <label className="field-group">
            <span>Report Period</span>
            <select
              value={draftFilters.period}
              onChange={(event) => handlePeriodChange(event.target.value)}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom Range</option>
            </select>
          </label>

          {userRole === 'admin' && (
            <label className="field-group">
              <span>Staff</span>
              <select
                value={draftFilters.staffId}
                onChange={(event) => setDraftFilters((current) => ({
                  ...current,
                  staffId: event.target.value,
                }))}
              >
                {staffOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          )}

          <label className="field-group">
            <span>Start Date</span>
            <input
              type="date"
              value={draftFilters.startDate}
              onChange={(event) => handleDateChange('startDate', event.target.value)}
            />
          </label>

          <label className="field-group">
            <span>End Date</span>
            <input
              type="date"
              value={draftFilters.endDate}
              onChange={(event) => handleDateChange('endDate', event.target.value)}
            />
          </label>

          <button type="submit" className="report-primary-button report-primary-button--compact">
            <Download size={16} />
            Generate Report
          </button>
        </form>
      </section>

      <section className="sales-report-kpi-grid" aria-label="Generated sales report totals">
        <article className="sales-report-kpi-card sales-report-kpi-card--revenue">
          <span className="sales-report-kpi-card__icon"><Wallet size={22} /></span>
          <div>
            <span>Total Revenue</span>
            <strong>{formatPeso(totals.sales)}</strong>
          </div>
        </article>

        <article className="sales-report-kpi-card sales-report-kpi-card--sold">
          <span className="sales-report-kpi-card__icon"><ShoppingBag size={22} /></span>
          <div>
            <span>Total Products Sold</span>
            <strong>{totals.quantity.toLocaleString()} <small>items</small></strong>
          </div>
        </article>

        <article className="sales-report-kpi-card sales-report-kpi-card--orders">
          <span className="sales-report-kpi-card__icon"><Package size={22} /></span>
          <div>
            <span>Completed Transactions</span>
            <strong>{filteredReports.length.toLocaleString()} <small>orders</small></strong>
          </div>
        </article>

        <article className="sales-report-kpi-card sales-report-kpi-card--returns">
          <span className="sales-report-kpi-card__icon"><RotateCcw size={22} /></span>
          <div>
            <span>Total Returns</span>
            <strong>{totalReturns.toLocaleString()} <small>items</small></strong>
          </div>
        </article>
      </section>

      <div className="generated-report-meta">
        <span><Calendar size={16} /> {periodLabel}: {rangeLabel}</span>
        <span>{staffLabel}</span>
        <span>Generated {formatDateTime(generatedAt)}</span>
      </div>

      <div className="sales-report-main-grid">
        <section className="report-shell report-shell--chart">
          <div className="report-shell__header">
            <div>
              <h2>Weekly Sales Overview</h2>
              <p>{rangeLabel}</p>
            </div>
            <div className="report-shell__chip">{periodLabel}</div>
          </div>

          <div className="sales-dashboard-chart" aria-label="Weekly sales performance chart">
            {isSalesReportsLoading ? (
              <div className="report-empty-state">
                <RefreshCw size={18} className="spin" />
                <span>Loading sales reports...</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 24, right: 24, left: 4, bottom: 8 }}>
                  <CartesianGrid stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tick={{ fill: '#111827', fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tick={{ fill: '#111827', fontSize: 12 }}
                    tickFormatter={(value) => `P${Number(value).toLocaleString()}`}
                  />
                  <Tooltip
                    formatter={(value) => [formatPeso(value), 'Sales']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.rangeLabel || ''}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 5, strokeWidth: 2, fill: '#2563eb' }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="report-shell report-shell--best-products">
          <div className="report-shell__header">
            <div>
              <h2>Top Selling Products</h2>
            </div>
            <Trophy size={22} className="report-section-icon report-section-icon--green" />
          </div>

          <div className="sales-report-table-wrap">
            <table className="sales-report-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product Name</th>
                  <th>Quantity Sold</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan="3">No sold products found for this report period.</td>
                  </tr>
                ) : (
                  topProducts.map((row) => (
                    <tr key={row.itemName}>
                      <td>{row.rank}</td>
                      <td>{row.itemName}</td>
                      <td>{row.quantity}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="sales-report-detail-grid">
        <section className="report-shell">
          <div className="report-shell__header">
            <div>
              <h2>Sales Data</h2>
              <p>{periodLabel} sales data filtered by selected dates.</p>
            </div>
          </div>

          <label className="sales-report-search">
            <Search size={16} />
            <input
              type="search"
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
              placeholder="Search product"
            />
          </label>

          <div className="sales-report-table-wrap">
            <table className="sales-report-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Quantity Sold</th>
                  <th>Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {visibleSummaryRows.length === 0 ? (
                  <tr>
                    <td colSpan="3">
                      {normalizedSearch ? 'No products matched your search.' : 'No sales data found for this report period.'}
                    </td>
                  </tr>
                ) : (
                  visibleSummaryRows.map((row) => (
                    <tr key={row.itemName}>
                      <td>{row.itemName}</td>
                      <td>{row.quantity}</td>
                      <td>{formatPeso(row.totalSales)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{totals.quantity}</td>
                  <td>{formatPeso(totals.sales)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="report-shell">
          <div className="report-shell__header">
            <div>
              <h2>Returns History</h2>
              <p>{totalReturns} returned item(s) in this report period.</p>
            </div>
            <RotateCcw size={22} className="report-section-icon report-section-icon--purple" />
          </div>

          <div className="sales-report-table-wrap">
            <table className="sales-report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product Name</th>
                  <th>Quantity Returned</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {returnHistory.length === 0 ? (
                  <tr>
                    <td colSpan="4">No returned items found for this report period.</td>
                  </tr>
                ) : (
                  returnHistory.slice(0, 8).map((report) => (
                    <tr key={report.id}>
                      <td>{formatShortDate(report.date)}</td>
                      <td>{getReturnProductName(report)}</td>
                      <td>{getReturnQuantity(report)}</td>
                      <td>{getIssueTypeLabel(report.issueType)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {userRole === 'admin' && (
        <section className="report-shell report-shell--actions">
          <div className="report-action-panel">
            <div>
              <h2>Report Actions</h2>
              <p>Download or print your generated report.</p>
            </div>
            <div className="sales-report-action-buttons">
              <button
                type="button"
                className="report-export-button report-export-button--green"
                onClick={handleDownloadCsv}
                disabled={summaryRows.length === 0}
              >
                <FileSpreadsheet size={16} />
                Download CSV
              </button>
              <button
                type="button"
                className="report-export-button report-export-button--red"
                onClick={() => handleOpenPrintView('pdf')}
                disabled={summaryRows.length === 0}
              >
                <FileText size={16} />
                Download PDF
              </button>
              <button
                type="button"
                className="report-export-button report-export-button--blue"
                onClick={() => handleOpenPrintView('print')}
                disabled={summaryRows.length === 0}
              >
                <Printer size={16} />
                Print Report
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default AdminReports;

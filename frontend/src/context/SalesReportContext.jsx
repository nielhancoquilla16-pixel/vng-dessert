/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, isBackendIssueError } from '../lib/api';
import { subscribeToDatabaseChanges } from '../lib/realtime';
import { useAuth } from './AuthContext';

const SalesReportContext = createContext();

const roundCurrencyAmount = (value) => (
  Math.round((Number(value) + Number.EPSILON) * 100) / 100
);

const getMonthKey = (value = '') => {
  const normalized = String(value || '').trim();

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized.slice(0, 7);
  }

  return '';
};

const normalizeSalesReportItem = (item = {}) => ({
  id: item.id,
  reportId: item.reportId || item.report_id || '',
  itemName: item.itemName || item.item_name || item.name || '',
  quantity: Number(item.quantity) || 0,
  totalSales: roundCurrencyAmount(item.totalSales ?? item.total_sales ?? 0),
  createdAt: item.createdAt || item.created_at || '',
  updatedAt: item.updatedAt || item.updated_at || '',
});

const normalizeSalesReport = (report = {}) => {
  const items = Array.isArray(report.items || report.sales_report_items)
    ? (report.items || report.sales_report_items)
        .map((item) => normalizeSalesReportItem(item))
        .sort((left, right) => left.itemName.localeCompare(right.itemName))
    : [];
  const reportDate = report.reportDate || report.report_date || '';
  const reportMonth = report.reportMonth || report.report_month || reportDate;
  const staff = report.staff || report.profile || null;

  return {
    id: report.id,
    staffId: report.staffId || report.staff_id || staff?.id || '',
    staff: staff
      ? {
          id: staff.id,
          username: staff.username || '',
          email: staff.email || '',
          fullName: staff.fullName || staff.full_name || '',
          role: staff.role || 'staff',
        }
      : null,
    reportDate,
    reportMonth,
    reportMonthKey: getMonthKey(reportMonth || reportDate),
    paymentType: String(report.paymentType || report.payment_type || 'cash').toLowerCase(),
    totalQuantity: Number(report.totalQuantity || report.total_quantity) || items.reduce((sum, item) => sum + item.quantity, 0),
    totalSales: roundCurrencyAmount(
      report.totalSales ?? report.total_sales ?? items.reduce((sum, item) => sum + item.totalSales, 0),
    ),
    submittedAt: report.submittedAt || report.submitted_at || report.createdAt || report.created_at || '',
    createdAt: report.createdAt || report.created_at || '',
    updatedAt: report.updatedAt || report.updated_at || '',
    items,
  };
};

const sortReports = (reports = []) => (
  [...reports].sort((left, right) => {
    const leftTime = new Date(left.submittedAt || left.reportDate || 0).getTime();
    const rightTime = new Date(right.submittedAt || right.reportDate || 0).getTime();
    return rightTime - leftTime;
  })
);

export const useSalesReports = () => {
  const context = useContext(SalesReportContext);
  if (!context) {
    throw new Error('useSalesReports must be used within a SalesReportProvider');
  }
  return context;
};

export const SalesReportProvider = ({ children }) => {
  const { session, userRole, isAuthLoading } = useAuth();
  const [salesReports, setSalesReports] = useState([]);
  const [isSalesReportsLoading, setIsSalesReportsLoading] = useState(true);

  const refreshSalesReports = useCallback(async () => {
    if (!session?.access_token || !['admin', 'staff'].includes(userRole)) {
      setSalesReports([]);
      return [];
    }

    const response = await apiRequest('/api/sales-reports', {}, {
      auth: true,
      accessToken: session.access_token,
    });

    const normalizedReports = sortReports((response || []).map((report) => normalizeSalesReport(report)));
    setSalesReports(normalizedReports);
    return normalizedReports;
  }, [session?.access_token, userRole]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    let isActive = true;

    const loadSalesReports = async () => {
      try {
        setIsSalesReportsLoading(true);
        const nextReports = await refreshSalesReports();
        if (isActive) {
          setSalesReports(nextReports);
        }
      } catch (error) {
        if (isBackendIssueError(error)) {
          console.warn('Sales reports are temporarily unavailable:', error.message);
        } else {
          console.error('Failed to load sales reports:', error);
        }

        if (isActive) {
          setSalesReports([]);
        }
      } finally {
        if (isActive) {
          setIsSalesReportsLoading(false);
        }
      }
    };

    loadSalesReports();

    return () => {
      isActive = false;
    };
  }, [isAuthLoading, refreshSalesReports]);

  useEffect(() => {
    if (
      isAuthLoading
      || !session?.access_token
      || !['admin', 'staff'].includes(userRole)
    ) {
      return undefined;
    }

    return subscribeToDatabaseChanges({
      channelName: `sales-reports-sync-${userRole}`,
      tables: ['orders', 'order_items', 'order_issue_reports', 'sales_reports', 'sales_report_items'],
      onChange: refreshSalesReports,
    });
  }, [isAuthLoading, refreshSalesReports, session?.access_token, userRole]);

  const createSalesReport = useCallback(async (reportData = {}) => {
    const createdReport = await apiRequest('/api/sales-reports', {
      method: 'POST',
      body: JSON.stringify({
        report_date: reportData.reportDate || reportData.report_date || '',
        report_month: reportData.reportMonth || reportData.report_month || '',
        payment_type: reportData.paymentType || reportData.payment_type || 'cash',
        items: (reportData.items || []).map((item) => ({
          item_name: item.itemName || item.item_name || item.name || '',
          quantity: Number(item.quantity) || 0,
          total_sales: roundCurrencyAmount(item.totalSales ?? item.total_sales ?? 0),
        })),
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedReport = normalizeSalesReport(createdReport);
    setSalesReports((currentReports) => sortReports([
      normalizedReport,
      ...currentReports.filter((report) => report.id !== normalizedReport.id),
    ]));
    return normalizedReport;
  }, [session?.access_token]);

  return (
    <SalesReportContext.Provider
      value={{
        salesReports,
        isSalesReportsLoading,
        refreshSalesReports,
        createSalesReport,
      }}
    >
      {children}
    </SalesReportContext.Provider>
  );
};

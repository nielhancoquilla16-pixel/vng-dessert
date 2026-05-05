import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import {
  hydrateOrdersWithProfiles,
  mapOrder,
  normalizeOrderStatus,
  normalizeStatusTimestamps,
  orderSelect,
} from '../lib/orderUtils.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

const SALES_REPORT_SELECT = `
  id,
  staff_id,
  report_date,
  report_month,
  payment_type,
  total_quantity,
  total_sales,
  submitted_at,
  created_at,
  updated_at,
  sales_report_items (
    id,
    report_id,
    item_name,
    quantity,
    total_sales,
    created_at,
    updated_at
  )
`;

const SALES_REPORT_PROFILE_SELECT = `
  id,
  username,
  email,
  full_name,
  role
`;

const VALID_PAYMENT_TYPES = ['cash', 'gcash', 'online', 'card', 'other'];
const REVERSAL_ORDER_STATUSES = new Set(['cancelled', 'refunded']);

const roundCurrencyAmount = (value) => (
  Math.round((Number(value) + Number.EPSILON) * 100) / 100
);

const normalizeWhitespace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeCurrencyAmount = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, roundCurrencyAmount(value)) : 0;
  }

  const normalized = String(value || '').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, roundCurrencyAmount(parsed)) : 0;
};

const normalizePositiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
};

const normalizeReportDate = (value = '') => {
  const normalized = String(value || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return '';
  }

  const [year, month, day] = normalized.split('-').map((part) => Number(part));
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year
    || parsedDate.getUTCMonth() !== month - 1
    || parsedDate.getUTCDate() !== day
  ) {
    return '';
  }

  return normalized;
};

const normalizeReportMonth = (value = '') => {
  const normalized = String(value || '').trim();

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return `${normalized}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const safeDate = normalizeReportDate(normalized);
    return safeDate ? `${safeDate.slice(0, 7)}-01` : '';
  }

  return '';
};

const normalizePaymentType = (value = 'cash') => {
  const normalized = String(value || 'cash').trim().toLowerCase();
  return VALID_PAYMENT_TYPES.includes(normalized) ? normalized : 'cash';
};

const getCompletedSaleTimestamp = (order = {}) => {
  const statusTimestamps = normalizeStatusTimestamps(order?.status_timestamps || order?.statusTimestamps || {});
  return statusTimestamps.completed
    || order?.completedAt
    || order?.completed_at
    || order?.receipt_received_at
    || order?.receiptReceivedAt
    || '';
};

const isCompletedTransaction = (order = {}) => {
  const normalizedStatus = normalizeOrderStatus(order?.order_status || order?.status || '');
  return normalizedStatus === 'completed'
    && !REVERSAL_ORDER_STATUSES.has(normalizedStatus)
    && Boolean(getCompletedSaleTimestamp(order));
};

const getOrderStaffId = (order = {}) => {
  const placedByRole = String(order?.profiles?.role || order?.placedByRole || '').toLowerCase();
  return ['admin', 'staff'].includes(placedByRole) ? (order.user_id || order.userId || '') : '';
};

const getReportDateFromOrder = (order = {}) => (
  String(getCompletedSaleTimestamp(order) || order.updated_at || order.updatedAt || order.created_at || order.createdAt || '')
    .slice(0, 10)
);

const mapOrderToSalesReport = (order = {}) => {
  const mappedOrder = order.lineItems ? order : mapOrder(order);
  const reportDate = getReportDateFromOrder(mappedOrder);
  const items = (mappedOrder.lineItems || [])
    .map((item) => {
      const quantity = normalizePositiveInteger(item.quantity);
      const price = normalizeCurrencyAmount(item.price);
      const itemName = normalizeWhitespace(
        item.product?.productName
        || item.product?.product_name
        || item.name
        || 'Unknown Product',
      );

      return {
        id: item.id || `${mappedOrder.id}-${item.productId || item.product_id || itemName}`,
        reportId: `order:${mappedOrder.id}`,
        itemName,
        quantity,
        totalSales: roundCurrencyAmount(quantity * price),
        createdAt: mappedOrder.createdAt || mappedOrder.created_at || '',
        updatedAt: mappedOrder.updatedAt || mappedOrder.updated_at || '',
      };
    })
    .filter((item) => item.itemName && item.quantity > 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalSales = roundCurrencyAmount(items.reduce((sum, item) => sum + item.totalSales, 0));
  const staffId = getOrderStaffId(mappedOrder);

  return {
    id: `order:${mappedOrder.id}`,
    orderId: mappedOrder.id,
    orderCode: mappedOrder.orderCode || mappedOrder.order_code || mappedOrder.displayId || '',
    staffId,
    staff: staffId
      ? {
          id: staffId,
          username: mappedOrder.customerUsername || mappedOrder.profiles?.username || '',
          email: mappedOrder.customerEmail || mappedOrder.profiles?.email || '',
          fullName: mappedOrder.customer || mappedOrder.profiles?.full_name || '',
          role: mappedOrder.placedByRole || mappedOrder.profiles?.role || 'staff',
        }
      : null,
    reportDate,
    reportMonth: reportDate ? `${reportDate.slice(0, 7)}-01` : '',
    paymentType: normalizePaymentType(mappedOrder.paymentMethod || mappedOrder.payment_method || 'cash'),
    totalQuantity,
    totalSales,
    submittedAt: getCompletedSaleTimestamp(mappedOrder),
    createdAt: mappedOrder.createdAt || mappedOrder.created_at || '',
    updatedAt: mappedOrder.updatedAt || mappedOrder.updated_at || '',
    source: 'orders',
    items,
  };
};

const buildOrderDerivedSalesReportQuery = (supabase, req) => {
  const currentRole = String(req.profile?.role || '').toLowerCase();
  const currentUserId = req.authUser?.id || '';

  let query = supabase
    .from('orders')
    .select(orderSelect)
    .eq('order_status', 'completed')
    .order('updated_at', { ascending: false });

  if (currentRole !== 'admin') {
    query = query.eq('user_id', currentUserId);
  }

  return query;
};

const filterOrderDerivedSalesReports = (reports = [], req) => {
  const currentRole = String(req.profile?.role || '').toLowerCase();
  const normalizedMonth = normalizeReportMonth(req.query?.month || req.query?.report_month || '');
  const normalizedStaffId = normalizeWhitespace(req.query?.staffId || req.query?.staff_id || '');
  const normalizedDateFrom = normalizeReportDate(req.query?.dateFrom || req.query?.date_from || '');
  const normalizedDateTo = normalizeReportDate(req.query?.dateTo || req.query?.date_to || '');
  const normalizedPaymentType = normalizeWhitespace(req.query?.paymentType || req.query?.payment_type || '').toLowerCase();

  return reports.filter((report) => {
    if (normalizedMonth && report.reportMonth !== normalizedMonth) {
      return false;
    }

    if (
      currentRole === 'admin'
      && normalizedStaffId
      && normalizedStaffId !== 'all'
      && String(report.staffId) !== normalizedStaffId
    ) {
      return false;
    }

    if (normalizedDateFrom && report.reportDate < normalizedDateFrom) {
      return false;
    }

    if (normalizedDateTo && report.reportDate > normalizedDateTo) {
      return false;
    }

    if (VALID_PAYMENT_TYPES.includes(normalizedPaymentType) && report.paymentType !== normalizedPaymentType) {
      return false;
    }

    return true;
  });
};

const normalizeSalesReportItems = (items = []) => {
  if (!Array.isArray(items)) {
    return [];
  }

  const itemsByName = new Map();

  items.forEach((item) => {
    const itemName = normalizeWhitespace(item?.item_name || item?.itemName || item?.name || '');
    const quantity = normalizePositiveInteger(item?.quantity);
    const totalSales = normalizeCurrencyAmount(item?.total_sales ?? item?.totalSales);

    if (!itemName || quantity <= 0) {
      return;
    }

    const normalizedKey = itemName.toLowerCase();
    const existingItem = itemsByName.get(normalizedKey);

    if (existingItem) {
      existingItem.quantity += quantity;
      existingItem.total_sales = roundCurrencyAmount(existingItem.total_sales + totalSales);
      return;
    }

    itemsByName.set(normalizedKey, {
      item_name: itemName,
      quantity,
      total_sales: totalSales,
    });
  });

  return Array.from(itemsByName.values());
};

const mapSalesReportItem = (item = {}) => ({
  id: item.id,
  reportId: item.report_id || item.reportId || '',
  itemName: item.item_name || item.itemName || '',
  quantity: Number(item.quantity) || 0,
  totalSales: Number(item.total_sales) || 0,
  createdAt: item.created_at || item.createdAt || '',
  updatedAt: item.updated_at || item.updatedAt || '',
});

const mapSalesReport = (row = {}, profileMap = new Map()) => {
  const staffProfile = profileMap.get(row.staff_id) || null;
  const items = Array.isArray(row.sales_report_items)
    ? row.sales_report_items
        .map((item) => mapSalesReportItem(item))
        .sort((left, right) => left.itemName.localeCompare(right.itemName))
    : [];

  return {
    id: row.id,
    staffId: row.staff_id || '',
    staff: staffProfile
      ? {
          id: staffProfile.id,
          username: staffProfile.username || '',
          email: staffProfile.email || '',
          fullName: staffProfile.full_name || '',
          role: staffProfile.role || 'staff',
        }
      : null,
    reportDate: row.report_date || '',
    reportMonth: row.report_month || '',
    paymentType: row.payment_type || 'cash',
    totalQuantity: Number(row.total_quantity) || 0,
    totalSales: Number(row.total_sales) || 0,
    submittedAt: row.submitted_at || row.created_at || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    items,
  };
};

const hydrateSalesReportsWithProfiles = async (supabase, rows = []) => {
  const validRows = Array.isArray(rows) ? rows.filter(Boolean) : [];

  if (validRows.length === 0) {
    return [];
  }

  const staffIds = [...new Set(validRows.map((row) => row.staff_id).filter(Boolean))];
  const profileMap = new Map();

  if (staffIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select(SALES_REPORT_PROFILE_SELECT)
      .in('id', staffIds);

    if (profilesError) {
      throw profilesError;
    }

    (profiles || []).forEach((profile) => {
      profileMap.set(profile.id, profile);
    });
  }

  return validRows.map((row) => mapSalesReport(row, profileMap));
};

const buildSalesReportQuery = (supabase, req) => {
  const currentRole = String(req.profile?.role || '').toLowerCase();
  const currentUserId = req.authUser?.id || '';
  const normalizedMonth = normalizeReportMonth(req.query?.month || req.query?.report_month || '');
  const normalizedStaffId = normalizeWhitespace(req.query?.staffId || req.query?.staff_id || '');
  const normalizedDateFrom = normalizeReportDate(req.query?.dateFrom || req.query?.date_from || '');
  const normalizedDateTo = normalizeReportDate(req.query?.dateTo || req.query?.date_to || '');
  const normalizedPaymentType = normalizeWhitespace(req.query?.paymentType || req.query?.payment_type || '').toLowerCase();

  let query = supabase
    .from('sales_reports')
    .select(SALES_REPORT_SELECT)
    .order('report_date', { ascending: false })
    .order('submitted_at', { ascending: false });

  if (currentRole === 'admin') {
    if (normalizedStaffId && normalizedStaffId !== 'all') {
      query = query.eq('staff_id', normalizedStaffId);
    }
  } else {
    query = query.eq('staff_id', currentUserId);
  }

  if (normalizedMonth) {
    query = query.eq('report_month', normalizedMonth);
  }

  if (normalizedDateFrom) {
    query = query.gte('report_date', normalizedDateFrom);
  }

  if (normalizedDateTo) {
    query = query.lte('report_date', normalizedDateTo);
  }

  if (VALID_PAYMENT_TYPES.includes(normalizedPaymentType)) {
    query = query.eq('payment_type', normalizedPaymentType);
  }

  return query;
};

const fetchSalesReportById = async (supabase, reportId) => {
  const { data, error } = await supabase
    .from('sales_reports')
    .select(SALES_REPORT_SELECT)
    .eq('id', reportId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const notFoundError = new Error('Sales report not found.');
    notFoundError.status = 404;
    throw notFoundError;
  }

  const [hydratedReport] = await hydrateSalesReportsWithProfiles(supabase, [data]);
  return hydratedReport || null;
};

router.get('/', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await buildOrderDerivedSalesReportQuery(supabase, req);

    if (error) {
      throw error;
    }

    const hydratedOrders = await hydrateOrdersWithProfiles(supabase, data || []);
    const reports = hydratedOrders
      .filter((order) => isCompletedTransaction(order))
      .map((order) => mapOrderToSalesReport(order));

    res.json(filterOrderDerivedSalesReports(reports, req));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const reportDate = normalizeReportDate(req.body?.report_date || req.body?.reportDate || '');
    const reportMonth = normalizeReportMonth(
      req.body?.report_month
      || req.body?.reportMonth
      || reportDate,
    );
    const paymentType = normalizePaymentType(req.body?.payment_type || req.body?.paymentType || 'cash');
    const normalizedItems = normalizeSalesReportItems(req.body?.items || []);

    if (!reportDate) {
      return res.status(400).json({ error: 'A valid report date is required.' });
    }

    if (!reportMonth) {
      return res.status(400).json({ error: 'A valid report month is required.' });
    }

    if (reportDate.slice(0, 7) !== reportMonth.slice(0, 7)) {
      return res.status(400).json({ error: 'The report date must match the selected report month.' });
    }

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: 'At least one sold item is required.' });
    }

    const totalQuantity = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalSales = roundCurrencyAmount(
      normalizedItems.reduce((sum, item) => sum + item.total_sales, 0),
    );
    const now = new Date().toISOString();

    const { data: createdReport, error: reportError } = await supabase
      .from('sales_reports')
      .insert({
        staff_id: req.authUser.id,
        report_date: reportDate,
        report_month: reportMonth,
        payment_type: paymentType,
        total_quantity: totalQuantity,
        total_sales: totalSales,
        submitted_at: now,
      })
      .select('id')
      .single();

    if (reportError) {
      throw reportError;
    }

    const reportItemsPayload = normalizedItems.map((item) => ({
      report_id: createdReport.id,
      item_name: item.item_name,
      quantity: item.quantity,
      total_sales: item.total_sales,
    }));

    const { error: itemsError } = await supabase
      .from('sales_report_items')
      .insert(reportItemsPayload);

    if (itemsError) {
      throw itemsError;
    }

    const hydratedReport = await fetchSalesReportById(supabase, createdReport.id);
    res.status(201).json(hydratedReport);
  } catch (error) {
    next(error);
  }
});

export default router;

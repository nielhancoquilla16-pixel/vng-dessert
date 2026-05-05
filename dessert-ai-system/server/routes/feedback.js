import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import {
  mapOrder,
  normalizeOrderStatus,
  orderSelect,
} from '../lib/orderUtils.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

const FINAL_INVALID_STATUSES = new Set(['cancelled', 'refunded']);
const FEEDBACK_OPEN_STATUSES = new Set(['confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed']);

const normalizeFeedbackToken = (value = '') => String(value || '').trim().toUpperCase();

const mapFeedback = (row = {}) => ({
  id: row.id,
  orderId: row.order_id || row.orderId || '',
  rating: Number(row.rating) || 0,
  comment: row.comment || '',
  customerName: row.customer_name || row.customerName || '',
  isAnonymous: Boolean(row.is_anonymous ?? row.isAnonymous ?? true),
  status: row.status || 'valid',
  invalidReason: row.invalid_reason || row.invalidReason || '',
  purchasedItems: Array.isArray(row.purchased_items) ? row.purchased_items : [],
  transactionAt: row.transaction_at || row.transactionAt || null,
  submittedAt: row.submitted_at || row.submittedAt || row.created_at || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || row.created_at || '',
  order: row.orders ? mapOrder(row.orders) : null,
});

const getTransactionTimestamp = (order = {}) => {
  const statusTimestamps = order.status_timestamps || {};
  return statusTimestamps.completed
    || statusTimestamps.delivered
    || statusTimestamps.confirmed
    || order.created_at
    || null;
};

const getPurchasedItems = (order = {}) => (
  (order.order_items || []).map((item) => ({
    productId: item.product_id,
    name: item.products?.product_name || 'Unknown Product',
    category: item.products?.category || 'Uncategorized',
    quantity: Number(item.quantity) || 0,
    price: Number(item.price) || 0,
  }))
);

const fetchOrderByFeedbackToken = async (supabase, token = '') => {
  const normalizedToken = normalizeFeedbackToken(token);

  if (!normalizedToken) {
    return null;
  }

  const { data, error } = await supabase
    .from('orders')
    .select(orderSelect)
    .eq('feedback_token', normalizedToken)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

const buildFeedbackOrderPayload = (order = {}) => {
  const mappedOrder = mapOrder(order);
  const status = normalizeOrderStatus(order.order_status || mappedOrder.status);
  const invalidReason = FINAL_INVALID_STATUSES.has(status)
    ? 'Feedback is disabled because this order was cancelled or refunded.'
    : (!FEEDBACK_OPEN_STATUSES.has(status) ? 'Feedback is available after the order is confirmed.' : '');

  return {
    order: {
      id: mappedOrder.id,
      displayId: mappedOrder.displayId,
      orderCode: mappedOrder.orderCode,
      customer: mappedOrder.customer,
      status: mappedOrder.status,
      totalAmount: mappedOrder.totalAmount,
      total: mappedOrder.total,
      items: mappedOrder.lineItems,
      transactionAt: getTransactionTimestamp(order),
      createdAt: mappedOrder.createdAt,
    },
    feedbackEnabled: !invalidReason,
    invalidReason,
  };
};

router.get('/:token', async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const order = await fetchOrderByFeedbackToken(supabase, req.params.token);

    if (!order) {
      return res.status(404).json({ error: 'Feedback link is invalid or has expired.' });
    }

    res.json(buildFeedbackOrderPayload(order));
  } catch (error) {
    next(error);
  }
});

router.post('/:token', async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const order = await fetchOrderByFeedbackToken(supabase, req.params.token);

    if (!order) {
      return res.status(404).json({ error: 'Feedback link is invalid or has expired.' });
    }

    const payload = buildFeedbackOrderPayload(order);
    if (!payload.feedbackEnabled) {
      return res.status(409).json({ error: payload.invalidReason });
    }

    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || '').trim();
    const customerName = String(req.body?.customer_name || req.body?.customerName || '').trim();
    const isAnonymous = Boolean(req.body?.is_anonymous ?? req.body?.isAnonymous ?? !customerName);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }

    if (comment.length > 2000) {
      return res.status(400).json({ error: 'Comment must be 2000 characters or fewer.' });
    }

    if (!isAnonymous && !customerName) {
      return res.status(400).json({ error: 'Name is required unless feedback is anonymous.' });
    }

    const { data, error } = await supabase
      .from('order_feedback')
      .insert({
        order_id: order.id,
        rating,
        comment: comment || null,
        customer_name: isAnonymous ? null : customerName,
        is_anonymous: isAnonymous,
        status: 'valid',
        invalid_reason: null,
        purchased_items: getPurchasedItems(order),
        transaction_at: getTransactionTimestamp(order),
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json({
      feedback: mapFeedback(data),
      order: payload.order,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const rating = Number(req.query.rating);
    const product = String(req.query.product || '').trim().toLowerCase();
    const dateFrom = String(req.query.date_from || req.query.dateFrom || '').trim();
    const dateTo = String(req.query.date_to || req.query.dateTo || '').trim();

    let query = supabase
      .from('order_feedback')
      .select(`*, orders (${orderSelect})`)
      .order('submitted_at', { ascending: false });

    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
      query = query.eq('rating', rating);
    }

    if (dateFrom) {
      query = query.gte('submitted_at', dateFrom);
    }

    if (dateTo) {
      query = query.lte('submitted_at', dateTo);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const feedback = (data || [])
      .map(mapFeedback)
      .filter((entry) => {
        if (!product) {
          return true;
        }

        return entry.purchasedItems.some((item) => (
          String(item.name || '').toLowerCase().includes(product)
          || String(item.category || '').toLowerCase().includes(product)
        ));
      });

    res.json(feedback);
  } catch (error) {
    next(error);
  }
});

export default router;

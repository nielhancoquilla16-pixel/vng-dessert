import { randomUUID } from 'node:crypto';
import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import {
  mapOrder,
  normalizeNotifications,
  normalizeOrderStatus,
  orderSelect,
} from '../lib/orderUtils.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

const FINAL_INVALID_STATUSES = new Set(['cancelled', 'refunded']);
const FEEDBACK_OPEN_STATUSES = new Set(['delivered', 'completed']);
const FEEDBACK_STATUSES = new Set(['new', 'viewed', 'acknowledged']);

const normalizeFeedbackToken = (value = '') => String(value || '').trim().toUpperCase();

const normalizeFeedbackStatus = (value = '') => {
  const status = String(value || '').trim().toLowerCase();

  if (status === 'valid') return 'new';
  if (status === 'invalid') return 'acknowledged';

  return FEEDBACK_STATUSES.has(status) ? status : 'new';
};

const hasLegacyFeedbackStatusConstraint = (error = {}) => (
  error?.code === '23514'
  && /order_feedback_status_check/i.test([
    error?.message,
    error?.details,
    error?.hint,
  ].filter(Boolean).join(' '))
);

const getRating = (value, label) => {
  const rating = Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    const error = new Error(`${label} must be between 1 and 5.`);
    error.status = 400;
    throw error;
  }

  return rating;
};

const mapFeedback = (row = {}) => ({
  id: row.id,
  orderId: row.order_id || row.orderId || '',
  rating: Number(row.rating) || 0,
  productRating: Number(row.product_rating ?? row.productRating ?? row.rating) || 0,
  serviceRating: Number(row.service_rating ?? row.serviceRating ?? row.rating) || 0,
  fulfillmentRating: Number(row.fulfillment_rating ?? row.fulfillmentRating ?? row.rating) || 0,
  comment: row.comment || '',
  customerName: row.customer_name || row.customerName || '',
  customerId: row.customer_id || row.customerId || '',
  isAnonymous: Boolean(row.is_anonymous ?? row.isAnonymous ?? true),
  status: normalizeFeedbackStatus(row.status),
  invalidReason: row.invalid_reason || row.invalidReason || '',
  purchasedItems: Array.isArray(row.purchased_items) ? row.purchased_items : [],
  transactionAt: row.transaction_at || row.transactionAt || null,
  submittedAt: row.submitted_at || row.submittedAt || row.created_at || '',
  viewedAt: row.viewed_at || row.viewedAt || null,
  viewedBy: row.viewed_by || row.viewedBy || '',
  acknowledgedAt: row.acknowledged_at || row.acknowledgedAt || null,
  acknowledgedBy: row.acknowledged_by || row.acknowledgedBy || '',
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

const fetchFeedbackByOrderId = async (supabase, orderId) => {
  const { data, error } = await supabase
    .from('order_feedback')
    .select('*')
    .eq('order_id', orderId)
    .order('submitted_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

const buildFeedbackOrderPayload = (order = {}, existingFeedback = null) => {
  const mappedOrder = mapOrder(order);
  const status = normalizeOrderStatus(order.order_status || mappedOrder.status);
  const statusReason = FINAL_INVALID_STATUSES.has(status)
    ? 'Feedback is disabled because this order was cancelled or refunded.'
    : (!FEEDBACK_OPEN_STATUSES.has(status) ? 'Feedback can be submitted after this order has been delivered or completed.' : '');
  const duplicateReason = existingFeedback
    ? 'Thank you. Feedback has already been submitted for this order.'
    : '';
  const invalidReason = statusReason || duplicateReason;

  return {
    order: {
      id: mappedOrder.id,
      displayId: mappedOrder.displayId,
      orderCode: mappedOrder.orderCode,
      customer: mappedOrder.customer,
      status: mappedOrder.status,
      deliveryMethod: mappedOrder.deliveryMethod,
      totalAmount: mappedOrder.totalAmount,
      total: mappedOrder.total,
      items: mappedOrder.lineItems,
      transactionAt: getTransactionTimestamp(order),
      createdAt: mappedOrder.createdAt,
    },
    feedbackEnabled: !invalidReason,
    feedbackSubmitted: Boolean(existingFeedback),
    existingFeedback: existingFeedback ? mapFeedback(existingFeedback) : null,
    invalidReason,
  };
};

const addFeedbackNotification = async (supabase, order, feedback) => {
  const mappedOrder = mapOrder(order);
  const notifications = normalizeNotifications(order.notifications || [])
    .filter((entry) => !(entry.type === 'feedback_received' && entry.id === feedback.id));

  notifications.push({
    id: feedback.id,
    audience: 'admin_staff',
    type: 'feedback_received',
    message: `New customer feedback received for order ${mappedOrder.displayId || mappedOrder.id}.`,
    createdAt: feedback.submitted_at || new Date().toISOString(),
  });

  const { error } = await supabase
    .from('orders')
    .update({ notifications })
    .eq('id', order.id);

  if (error) {
    throw error;
  }
};

const clearFeedbackNotification = async (supabase, orderId, feedbackId) => {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, notifications')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError || !order) {
    if (orderError) throw orderError;
    return;
  }

  const notifications = normalizeNotifications(order.notifications || [])
    .filter((entry) => !(entry.type === 'feedback_received' && entry.id === feedbackId));

  const { error } = await supabase
    .from('orders')
    .update({ notifications })
    .eq('id', orderId);

  if (error) {
    throw error;
  }
};

router.get('/:token', async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const order = await fetchOrderByFeedbackToken(supabase, req.params.token);

    if (!order) {
      return res.status(404).json({ error: 'Feedback link is invalid or has expired.' });
    }

    const existingFeedback = await fetchFeedbackByOrderId(supabase, order.id);
    res.json(buildFeedbackOrderPayload(order, existingFeedback));
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

    const existingFeedback = await fetchFeedbackByOrderId(supabase, order.id);
    const payload = buildFeedbackOrderPayload(order, existingFeedback);
    if (!payload.feedbackEnabled) {
      return res.status(409).json({ error: payload.invalidReason });
    }

    const rating = getRating(req.body?.rating, 'Overall rating');
    const productRating = getRating(req.body?.product_rating ?? req.body?.productRating, 'Product quality rating');
    const serviceRating = getRating(req.body?.service_rating ?? req.body?.serviceRating, 'Service rating');
    const fulfillmentRating = getRating(
      req.body?.fulfillment_rating ?? req.body?.fulfillmentRating ?? req.body?.deliveryRating,
      'Delivery or pickup rating',
    );
    const comment = String(req.body?.comment || '').trim();
    const customerName = String(req.body?.customer_name || req.body?.customerName || '').trim();
    const isAnonymous = Boolean(req.body?.is_anonymous ?? req.body?.isAnonymous ?? !customerName);

    if (comment.length > 2000) {
      return res.status(400).json({ error: 'Comment must be 2000 characters or fewer.' });
    }

    if (!isAnonymous && !customerName) {
      return res.status(400).json({ error: 'Name is required unless feedback is anonymous.' });
    }

    const feedbackId = randomUUID();
    const mappedOrder = mapOrder(order);

    const feedbackRecord = {
      id: feedbackId,
      order_id: order.id,
      rating,
      product_rating: productRating,
      service_rating: serviceRating,
      fulfillment_rating: fulfillmentRating,
      comment: comment || null,
      customer_id: order.user_id || null,
      customer_name: isAnonymous ? null : (customerName || mappedOrder.customer || null),
      is_anonymous: isAnonymous,
      status: 'new',
      invalid_reason: null,
      purchased_items: getPurchasedItems(order),
      transaction_at: getTransactionTimestamp(order),
    };

    let { data, error } = await supabase
      .from('order_feedback')
      .insert(feedbackRecord)
      .select('*')
      .single();

    // Older deployments used valid/invalid before the feedback-status upgrade.
    if (hasLegacyFeedbackStatusConstraint(error)) {
      ({ data, error } = await supabase
        .from('order_feedback')
        .insert({ ...feedbackRecord, status: 'valid' })
        .select('*')
        .single());
    }

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Thank you. Feedback has already been submitted for this order.' });
      }
      throw error;
    }

    await addFeedbackNotification(supabase, order, data);

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
    const status = String(req.query.status || '').trim().toLowerCase();

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
        if (status && entry.status !== normalizeFeedbackStatus(status)) {
          return false;
        }

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

router.patch('/:id/status', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const nextStatus = normalizeFeedbackStatus(req.body?.status);

    if (!['viewed', 'acknowledged'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Feedback can only be marked Viewed or Acknowledged.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: currentFeedback, error: currentError } = await supabase
      .from('order_feedback')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!currentFeedback) {
      return res.status(404).json({ error: 'Feedback was not found.' });
    }

    const now = new Date().toISOString();
    const update = { status: nextStatus };

    if (nextStatus === 'viewed') {
      update.viewed_at = currentFeedback.viewed_at || now;
      update.viewed_by = currentFeedback.viewed_by || req.authUser.id;
    }

    if (nextStatus === 'acknowledged') {
      update.viewed_at = currentFeedback.viewed_at || now;
      update.viewed_by = currentFeedback.viewed_by || req.authUser.id;
      update.acknowledged_at = now;
      update.acknowledged_by = req.authUser.id;
    }

    const { data, error } = await supabase
      .from('order_feedback')
      .update(update)
      .eq('id', currentFeedback.id)
      .select(`*, orders (${orderSelect})`)
      .single();

    if (error) throw error;

    await clearFeedbackNotification(supabase, currentFeedback.order_id, currentFeedback.id);
    res.json({ feedback: mapFeedback(data) });
  } catch (error) {
    next(error);
  }
});

export default router;

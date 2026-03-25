import express from 'express';
import { getSupabaseAdmin, hasSupabaseAdminConfig } from '../lib/supabaseAdmin.js';
import {
  DELIVERY_FEE,
  DEFAULT_READY_NOTIFICATION_MESSAGE,
  VALID_ORDER_STATUSES,
  createFulfilledOrder,
  enrichItemsFromProducts,
  fetchProductsByIds,
  getShortagesForItems,
  mapOrder,
  normalizeRequestedItems,
  orderSelect,
} from '../lib/orderUtils.js';
import { validateReceiptImageDataUrl } from '../lib/receiptImages.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();
const BEST_SELLER_LIMIT = 3;

const toTimestamp = (value) => {
  const parsed = new Date(value || '').getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const QR_CODE_ALREADY_USED_MESSAGE = 'QR Code already used or expired.';

const normalizeLookupValue = (value = '') => String(value || '').trim();
const normalizeLookupCode = (value = '') => normalizeLookupValue(value).toUpperCase();

const isPickupCashOrder = (order = {}) => (
  String(order.delivery_method || '').toLowerCase() === 'pickup'
  && String(order.payment_method || '').toLowerCase() === 'cash'
);

const isFinalizedPickupQr = (order = {}) => {
  const status = String(order.order_status || '').toLowerCase();
  return Boolean(order.qr_claimed_at) || ['completed', 'received', 'cancelled'].includes(status);
};

const fetchOrderByIdentifier = async (supabase, identifier = '') => {
  const normalized = normalizeLookupValue(identifier);
  const normalizedCode = normalizeLookupCode(identifier);

  if (!normalized) {
    return null;
  }

  const lookupQueries = [];

  if (normalizedCode) {
    lookupQueries.push(
      supabase
        .from('orders')
        .select(orderSelect)
        .eq('order_code', normalizedCode)
        .maybeSingle(),
    );
  }

  if (normalized) {
    lookupQueries.push(
      supabase
        .from('orders')
        .select(orderSelect)
        .eq('id', normalized)
        .maybeSingle(),
    );
  }

  for (const query of lookupQueries) {
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  return null;
};

const buildOrderStatusUpdate = (currentOrder, nextStatus) => {
  const normalizedNextStatus = String(nextStatus || '').toLowerCase();
  const currentStatus = String(currentOrder?.order_status || '').toLowerCase();
  const now = new Date().toISOString();
  const updates = {
    order_status: normalizedNextStatus,
  };

  if (normalizedNextStatus === 'ready' && !currentOrder?.ready_notified_at) {
    updates.ready_notified_at = now;
    updates.ready_notification_message = DEFAULT_READY_NOTIFICATION_MESSAGE;
  }

  if (normalizedNextStatus === 'completed' && isPickupCashOrder(currentOrder)) {
    if (isFinalizedPickupQr(currentOrder)) {
      const error = new Error(QR_CODE_ALREADY_USED_MESSAGE);
      error.status = 409;
      throw error;
    }

    if (currentStatus !== 'ready') {
      const error = new Error('The order must be ready before it can be confirmed.');
      error.status = 400;
      throw error;
    }

    updates.qr_claimed_at = now;
  }

  if (normalizedNextStatus === 'received') {
    if (currentStatus !== 'completed') {
      const error = new Error('The order must be completed before it can be marked as received.');
      error.status = 400;
      throw error;
    }

    if (currentOrder?.receipt_received_at) {
      const error = new Error('This order has already been marked as received.');
      error.status = 409;
      throw error;
    }
  }

  return updates;
};

const updateOrderWithStatus = async (supabase, orderId, nextStatus) => {
  const { data: currentOrder, error: currentError } = await supabase
    .from('orders')
    .select(orderSelect)
    .eq('id', orderId)
    .maybeSingle();

  if (currentError) {
    throw currentError;
  }

  if (!currentOrder) {
    const error = new Error('Order not found.');
    error.status = 404;
    throw error;
  }

  const updates = buildOrderStatusUpdate(currentOrder, nextStatus);

  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select(orderSelect)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const error = new Error('Order not found.');
    error.status = 404;
    throw error;
  }

  return data;
};

const createBestSellerEntry = (product) => ({
  id: product.id,
  name: product.product_name || 'Dessert Item',
  productName: product.product_name || 'Dessert Item',
  description: product.description || '',
  price: Number(product.price) || 0,
  category: product.category || 'Uncategorized',
  stockQuantity: Number(product.stock_quantity) || 0,
  availability: product.availability || 'available',
  imageUrl: product.image_url || '/logo.png',
  image: product.image_url || '/logo.png',
  soldCount: 0,
  orderCount: 0,
  lastOrderedAt: '',
  createdAt: product.created_at || '',
  updatedAt: product.updated_at || '',
});

router.get('/best-sellers', async (req, res, next) => {
  try {
    if (!hasSupabaseAdminConfig()) {
      return res.status(503).json({
        error: 'Best seller rankings are unavailable until SUPABASE_SERVICE_ROLE_KEY is configured on the server.',
      });
    }

    const limit = Math.min(12, Math.max(1, Number(req.query.limit) || BEST_SELLER_LIMIT));
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('orders')
      .select(`
        created_at,
        order_status,
        order_items (
          quantity,
          product_id,
          products (
            id,
            product_name,
            description,
            price,
            category,
            stock_quantity,
            availability,
            image_url,
            created_at,
            updated_at
          )
        )
      `)
      .neq('order_status', 'cancelled')
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    const productSales = new Map();

    (data || []).forEach((order) => {
      const countedInOrder = new Set();

      (order.order_items || []).forEach((item) => {
        const product = item.products;
        const quantity = Math.max(0, Number(item.quantity) || 0);

        if (!product?.id || quantity <= 0) {
          return;
        }

        const existing = productSales.get(product.id) || createBestSellerEntry(product);
        existing.soldCount += quantity;
        existing.lastOrderedAt = order.created_at || existing.lastOrderedAt;

        if (!countedInOrder.has(product.id)) {
          existing.orderCount += 1;
          countedInOrder.add(product.id);
        }

        productSales.set(product.id, existing);
      });
    });

    const items = Array.from(productSales.values())
      .sort((left, right) => {
        if (right.soldCount !== left.soldCount) {
          return right.soldCount - left.soldCount;
        }

        const leftLastOrderedAt = toTimestamp(left.lastOrderedAt);
        const rightLastOrderedAt = toTimestamp(right.lastOrderedAt);
        if (leftLastOrderedAt !== rightLastOrderedAt) {
          return leftLastOrderedAt - rightLastOrderedAt;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, limit)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
        averageUnitsPerOrder: item.orderCount > 0
          ? Number((item.soldCount / item.orderCount).toFixed(1))
          : 0,
      }));

    res.json({
      generatedAt: new Date().toISOString(),
      rankingMode: 'total-units-sold',
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('orders')
      .select(orderSelect)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json((data || []).map(mapOrder));
  } catch (error) {
    next(error);
  }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('orders')
      .select(orderSelect)
      .eq('user_id', req.authUser.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json((data || []).map(mapOrder));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      items = [],
      order_status = 'pending',
      customer_name = '',
      phone_number = '',
      address = '',
      delivery_method = 'pickup',
      payment_method = 'cash',
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one order item is required.' });
    }

    if (!VALID_ORDER_STATUSES.includes(String(order_status).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid order status.' });
    }

    const normalizedItems = normalizeRequestedItems(items);

    if (normalizedItems.some((item) => !item.product_id)) {
      return res.status(400).json({ error: 'Each order item must include a product_id.' });
    }

    const supabase = getSupabaseAdmin();
    const productsById = await fetchProductsByIds(
      supabase,
      [...new Set(normalizedItems.map((item) => item.product_id))],
    );
    const shortages = getShortagesForItems(normalizedItems, productsById);

    if (shortages.length > 0) {
      return res.status(409).json({
        error: 'Some products do not have enough stock.',
        shortages,
      });
    }

    const finalizedItems = enrichItemsFromProducts(normalizedItems, productsById).map((item) => ({
      ...item,
      available_stock_quantity: Number(productsById.get(item.product_id)?.stock_quantity) || 0,
    }));

    const subtotal = finalizedItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const finalTotal = subtotal + (delivery_method === 'delivery' ? DELIVERY_FEE : 0);

    const createdOrder = await createFulfilledOrder(supabase, {
      userId: req.authUser.id,
      profile: req.profile,
      customerName: customer_name,
      phoneNumber: phone_number,
      address,
      deliveryMethod: delivery_method,
      paymentMethod: payment_method,
      totalPrice: finalTotal,
      orderStatus: String(order_status).toLowerCase(),
      items: finalizedItems,
    });

    res.status(201).json(createdOrder);
  } catch (error) {
    next(error);
  }
});

router.post('/lookup', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const identifier = req.body?.identifier || req.body?.orderCode || req.body?.orderId || '';
    const supabase = getSupabaseAdmin();
    const order = await fetchOrderByIdentifier(supabase, identifier);

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (isFinalizedPickupQr(order)) {
      return res.status(409).json({ error: QR_CODE_ALREADY_USED_MESSAGE });
    }

    res.json(mapOrder(order));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/confirm-pickup', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const updatedOrder = await updateOrderWithStatus(supabase, req.params.id, 'completed');
    res.json(mapOrder(updatedOrder));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/receive', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: currentOrder, error: currentError } = await supabase
      .from('orders')
      .select(orderSelect)
      .eq('id', req.params.id)
      .eq('user_id', req.authUser.id)
      .maybeSingle();

    if (currentError) {
      throw currentError;
    }

    if (!currentOrder) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (String(currentOrder.order_status || '').toLowerCase() !== 'completed') {
      return res.status(400).json({ error: 'The order must be completed before it can be marked as received.' });
    }

    if (currentOrder.receipt_received_at) {
      return res.status(409).json({ error: 'This order has already been marked as received.' });
    }

    const receiptImageDataUrl = validateReceiptImageDataUrl(
      req.body?.receipt_image_data_url
      || req.body?.receiptImageDataUrl
      || '',
    );

    const { data, error } = await supabase
      .from('orders')
      .update({
        order_status: 'received',
        receipt_image_url: receiptImageDataUrl,
        receipt_received_at: new Date().toISOString(),
      })
      .eq('id', currentOrder.id)
      .select(orderSelect)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    res.json(mapOrder(data));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const nextStatus = String(req.body?.order_status || '').toLowerCase();

    if (!VALID_ORDER_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ error: 'order_status is required and must be valid.' });
    }

    const supabase = getSupabaseAdmin();
    const updatedOrder = await updateOrderWithStatus(supabase, req.params.id, nextStatus);
    res.json(mapOrder(updatedOrder));
  } catch (error) {
    next(error);
  }
});

router.post('/analyze', (req, res) => {
  const { orders } = req.body;

  if (!orders || orders.length === 0) {
    return res.json({
      totalRevenue: 0,
      orderCount: 0,
      analysis: 'No orders to analyze yet.',
      aiTip: 'Once you start receiving orders, the AI will provide detailed trend analysis here.',
    });
  }

  const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
  const avgOrder = totalRevenue / orders.length;

  res.json({
    totalRevenue,
    orderCount: orders.length,
    avgOrderValue: avgOrder.toFixed(2),
    analysis: `${orders.length} orders processed totaling PHP ${totalRevenue.toFixed(2)}.`,
    aiTip: 'Consider running weekend promotions to boost mid-week orders.',
  });
});

export default router;

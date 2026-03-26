import express from 'express';
import { getSupabaseAdmin, hasSupabaseAdminConfig } from '../lib/supabaseAdmin.js';
import {
  DELIVERY_FEE,
  VALID_ORDER_STATUSES,
  createFulfilledOrder,
  enrichItemsFromProducts,
  fetchProductsByIds,
  getShortagesForItems,
  mapOrder,
  normalizeNotifications,
  normalizeOrderStatus,
  normalizeReviewStatus,
  normalizeRequestedItems,
  normalizeStatusTimestamps,
  hasLecheFlanItems,
  getLecheFlanRestrictionMessage,
  orderSelect,
} from '../lib/orderUtils.js';
import { validateReceiptImageDataUrl } from '../lib/receiptImages.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();
const BEST_SELLER_LIMIT = 3;
const TERMINAL_ORDER_STATUSES = new Set(['completed', 'cancelled', 'refunded']);

const toTimestamp = (value) => {
  const parsed = new Date(value || '').getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLookupValue = (value = '') => String(value || '').trim();
const normalizeLookupCode = (value = '') => normalizeLookupValue(value).toUpperCase();

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

const buildNotificationEntry = (audience, type, message) => ({
  audience,
  type,
  message,
  createdAt: new Date().toISOString(),
});

const buildStatusTimestampPatch = (currentOrder, nextStatus, now = new Date().toISOString()) => ({
  ...normalizeStatusTimestamps(currentOrder?.status_timestamps || {}),
  [String(nextStatus || '').toLowerCase().replace(/-/g, '_')]: now,
});

const getOrderItemsForInventory = (order = {}) => (
  (order.order_items || []).map((item) => ({
    product_id: item.product_id,
    quantity: Number(item.quantity) || 0,
    price: Number(item.price) || 0,
    name: item.products?.product_name || 'Unknown Product',
    category: item.products?.category || 'Uncategorized',
    available_stock_quantity: Number(item.products?.stock_quantity) || 0,
  }))
);

const fetchOrderById = async (supabase, orderId) => {
  const { data, error } = await supabase
    .from('orders')
    .select(orderSelect)
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const notFoundError = new Error('Order not found.');
    notFoundError.status = 404;
    throw notFoundError;
  }

  return data;
};

const updateOrderRecord = async (supabase, orderId, patch) => {
  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', orderId)
    .select(orderSelect)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const notFoundError = new Error('Order not found.');
    notFoundError.status = 404;
    throw notFoundError;
  }

  return data;
};

const adjustInventoryForOrder = async (supabase, order, direction = 'deduct') => {
  const orderItems = getOrderItemsForInventory(order);

  if (orderItems.length === 0) {
    return;
  }

  const productIds = [...new Set(orderItems.map((item) => item.product_id).filter(Boolean))];
  const productsById = await fetchProductsByIds(supabase, productIds);
  const shortages = getShortagesForItems(orderItems, productsById);

  if (direction === 'deduct' && shortages.length > 0) {
    const shortageError = new Error('Some products do not have enough stock.');
    shortageError.status = 409;
    shortageError.details = { shortages };
    throw shortageError;
  }

  for (const item of orderItems) {
    const product = productsById.get(item.product_id);
    if (!product) {
      continue;
    }

    const currentStock = Number(product.stock_quantity) || 0;
    const nextStock = direction === 'deduct'
      ? Math.max(0, currentStock - item.quantity)
      : currentStock + item.quantity;

    const { error } = await supabase
      .from('products')
      .update({
        stock_quantity: nextStock,
        availability: nextStock <= 0 ? 'out of stock' : 'available',
      })
      .eq('id', item.product_id);

    if (error) {
      throw error;
    }
  }
};

const buildStatusMessages = (currentOrder, nextStatus, extra = {}) => {
  const orderCode = currentOrder?.order_code || currentOrder?.id || 'order';
  const reasonSuffix = extra.reason ? ` Reason: ${extra.reason}` : '';

  switch (nextStatus) {
    case 'confirmed':
      return {
        customer: `Your order ${orderCode} has been confirmed and is now being prepared.`,
        adminStaff: `Order ${orderCode} has been confirmed.`,
      };
    case 'preparing':
      return {
        customer: `Your order ${orderCode} is now being prepared.`,
        adminStaff: `Order ${orderCode} moved to Preparing.`,
      };
    case 'ready':
      return {
        customer: `Order ${orderCode} is ready. Inventory has been updated and the order is waiting for handoff.`,
        adminStaff: `Order ${orderCode} moved to Ready and inventory was deducted.`,
      };
    case 'out-for-delivery':
      return {
        customer: `Order ${orderCode} is now out for delivery.`,
        adminStaff: `Order ${orderCode} is out for delivery.`,
      };
    case 'delivered':
      return {
        customer: `Order ${orderCode} has been marked Delivered. Please confirm receipt with photo proof or report an issue if needed.`,
        adminStaff: `Order ${orderCode} is marked Delivered and is waiting for customer confirmation.`,
      };
    case 'completed':
      return {
        customer: `Thanks for confirming receipt for Order ${orderCode}. The order is now completed.`,
        adminStaff: `Customer confirmed receipt for Order ${orderCode}. Revenue has been recorded.`,
      };
    case 'cancelled':
      return {
        customer: `Order ${orderCode} was cancelled.${reasonSuffix}`,
        adminStaff: `Order ${orderCode} was cancelled.${reasonSuffix}`,
      };
    case 'refunded':
      return {
        customer: `Your refund for Order ${orderCode} was approved. The order is now refunded.${reasonSuffix}`,
        adminStaff: `Refund approved for Order ${orderCode}. Revenue has been reversed.${reasonSuffix}`,
      };
    default:
      return {
        customer: `Order ${orderCode} status changed to ${nextStatus}.`,
        adminStaff: `Order ${orderCode} status changed to ${nextStatus}.`,
      };
  }
};

const setOrderStatus = async (supabase, currentOrder, nextStatus, extra = {}) => {
  const normalizedNextStatus = normalizeOrderStatus(nextStatus);
  const currentStatus = normalizeOrderStatus(currentOrder.order_status);
  const now = new Date().toISOString();
  const deliveryMethod = String(currentOrder.delivery_method || 'pickup').toLowerCase();
  const statusPatch = {
    order_status: normalizedNextStatus,
    status_timestamps: buildStatusTimestampPatch(currentOrder, normalizedNextStatus, now),
  };
  const notifications = normalizeNotifications(currentOrder.notifications || []);
  const messageBundle = buildStatusMessages(currentOrder, normalizedNextStatus, extra);

  if (normalizedNextStatus === 'confirmed' && currentStatus !== 'pending') {
    const error = new Error('The order must be pending before it can be confirmed.');
    error.status = 400;
    throw error;
  }

  if (normalizedNextStatus === 'preparing' && currentStatus !== 'confirmed') {
    const error = new Error('The order must be confirmed before it can be set to Preparing.');
    error.status = 400;
    throw error;
  }

  if (normalizedNextStatus === 'ready' && currentStatus !== 'preparing') {
    const error = new Error('The order must be preparing before it can be marked Ready.');
    error.status = 400;
    throw error;
  }

  if (normalizedNextStatus === 'out-for-delivery') {
    if (deliveryMethod !== 'delivery') {
      const error = new Error('Only delivery orders can be marked Out for Delivery.');
      error.status = 400;
      throw error;
    }

    if (currentStatus !== 'ready') {
      const error = new Error('The order must be Ready before it can be marked Out for Delivery.');
      error.status = 400;
      throw error;
    }
  }

  if (normalizedNextStatus === 'delivered') {
    if (deliveryMethod === 'delivery' && currentStatus !== 'out-for-delivery') {
      const error = new Error('Delivery orders must be Out for Delivery before they can be marked Delivered.');
      error.status = 400;
      throw error;
    }

    if (deliveryMethod === 'pickup' && currentStatus !== 'ready') {
      const error = new Error('Pickup orders must be Ready before they can be marked Delivered.');
      error.status = 400;
      throw error;
    }
  }

  if (normalizedNextStatus === 'cancelled') {
    if (['delivered', 'completed', 'refunded', 'cancelled'].includes(currentStatus)) {
      const error = new Error('This order can no longer be cancelled.');
      error.status = 400;
      throw error;
    }
  }

  if (normalizedNextStatus === 'ready') {
    const restrictionMessage = deliveryMethod === 'delivery'
      ? getLecheFlanRestrictionMessage(currentOrder.delivery_distance_km)
      : '';

    if (restrictionMessage && hasLecheFlanItems(getOrderItemsForInventory(currentOrder))) {
      statusPatch.order_status = 'cancelled';
      statusPatch.status_timestamps = buildStatusTimestampPatch(currentOrder, 'cancelled', now);
      statusPatch.cancellation_reason = restrictionMessage;
      statusPatch.review_status = 'none';
      statusPatch.review_reason = null;
      statusPatch.review_status_updated_at = null;
      notifications.push(
        buildNotificationEntry('customer', 'order_cancelled', restrictionMessage),
        buildNotificationEntry('admin_staff', 'order_cancelled', `Order ${currentOrder.order_code || currentOrder.id} was automatically cancelled. ${restrictionMessage}`),
      );
      return { statusPatch, notifications, inventoryAction: null };
    }

    await adjustInventoryForOrder(supabase, currentOrder, 'deduct');
    statusPatch.inventory_deducted_at = currentOrder.inventory_deducted_at || now;
  }

  if (normalizedNextStatus === 'delivered') {
    statusPatch.ready_notified_at = currentOrder.ready_notified_at || now;
    if (deliveryMethod === 'pickup') {
      statusPatch.qr_claimed_at = currentOrder.qr_claimed_at || now;
    }
  }

  if (normalizedNextStatus === 'cancelled') {
    if (currentOrder.inventory_deducted_at) {
      await adjustInventoryForOrder(supabase, currentOrder, 'restock');
    }

    statusPatch.cancellation_reason = extra.reason || currentOrder.cancellation_reason || 'The order was cancelled before completion.';
    statusPatch.review_status = 'none';
    statusPatch.review_reason = null;
    statusPatch.review_status_updated_at = null;
  }

  if (normalizedNextStatus === 'completed') {
    if (currentStatus !== 'delivered') {
      const error = new Error('The order must be Delivered before it can be completed.');
      error.status = 400;
      throw error;
    }
  }

  notifications.push(
    buildNotificationEntry('customer', 'status_update', messageBundle.customer),
    buildNotificationEntry('admin_staff', 'status_update', messageBundle.adminStaff),
  );

  return {
    statusPatch,
    notifications,
  };
};

const applyOrderStatusChange = async (supabase, orderId, nextStatus, extra = {}) => {
  const currentOrder = await fetchOrderById(supabase, orderId);
  const { statusPatch, notifications } = await setOrderStatus(supabase, currentOrder, nextStatus, extra);
  const mergedNotifications = [
    ...normalizeNotifications(currentOrder.notifications || []),
    ...notifications,
  ];

  return updateOrderRecord(supabase, orderId, {
    ...statusPatch,
    notifications: mergedNotifications,
  });
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
      const normalizedStatus = normalizeOrderStatus(order.order_status);
      if (['cancelled', 'refunded'].includes(normalizedStatus)) {
        return;
      }

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
      delivery_distance_km,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one order item is required.' });
    }

    const requestedStatus = normalizeOrderStatus(order_status);
    if (requestedStatus !== 'pending') {
      return res.status(400).json({ error: 'New orders must start as pending.' });
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
    const normalizedDistance = Number(delivery_distance_km);
    const containsLecheFlan = hasLecheFlanItems(finalizedItems);
    const restrictionMessage = delivery_method === 'delivery'
      ? getLecheFlanRestrictionMessage(normalizedDistance)
      : '';

    const createdOrder = await createFulfilledOrder(supabase, {
      userId: req.authUser.id,
      profile: req.profile,
      customerName: customer_name,
      phoneNumber: phone_number,
      address,
      deliveryMethod: delivery_method,
      paymentMethod: payment_method,
      totalPrice: finalTotal,
      deliveryDistanceKm: Number.isFinite(normalizedDistance) ? normalizedDistance : null,
      orderStatus: containsLecheFlan && restrictionMessage ? 'cancelled' : 'pending',
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

    res.json(mapOrder(order));
  } catch (error) {
    next(error);
  }
});

const handleMarkDelivered = async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const updatedOrder = await applyOrderStatusChange(supabase, req.params.id, 'delivered');
    res.json(mapOrder(updatedOrder));
  } catch (error) {
    next(error);
  }
};

router.post('/:id/deliver', requireAuth, requireRole('admin', 'staff'), handleMarkDelivered);
router.post('/:id/confirm-pickup', requireAuth, requireRole('admin', 'staff'), handleMarkDelivered);

const handleCustomerReceiptConfirmation = async (req, res, next) => {
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

    const currentStatus = normalizeOrderStatus(currentOrder.order_status);
    const currentReviewStatus = normalizeReviewStatus(currentOrder.review_status);

    if (currentStatus !== 'delivered') {
      return res.status(400).json({ error: 'The order must be Delivered before it can be completed.' });
    }

    if (currentReviewStatus === 'under_review') {
      return res.status(409).json({ error: 'This order is under review. Please wait for the issue report to be resolved first.' });
    }

    const receiptImageDataUrl = validateReceiptImageDataUrl(
      req.body?.receipt_image_data_url
      || req.body?.receiptImageDataUrl
      || '',
    );

    if (!receiptImageDataUrl) {
      return res.status(400).json({ error: 'Receipt image proof is required.' });
    }

    if (currentOrder.receipt_received_at) {
      return res.status(409).json({ error: 'This order has already been completed.' });
    }

    const now = new Date().toISOString();
    const statusTimestamps = {
      ...normalizeStatusTimestamps(currentOrder.status_timestamps || {}),
      completed: now,
    };
    const notifications = [
      ...normalizeNotifications(currentOrder.notifications || []),
      buildNotificationEntry('customer', 'receipt_confirmed', `Thanks for confirming receipt for Order ${currentOrder.order_code || currentOrder.id}. The order is now completed.`),
      buildNotificationEntry('admin_staff', 'receipt_confirmed', `Customer confirmed receipt for Order ${currentOrder.order_code || currentOrder.id}. Revenue has been recorded.`),
    ];

    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
      order_status: 'completed',
      receipt_image_url: receiptImageDataUrl,
      receipt_received_at: now,
      status_timestamps: statusTimestamps,
      review_status: 'none',
      review_reason: null,
      review_status_updated_at: now,
      notifications,
    });

    res.json(mapOrder(updatedOrder));
  } catch (error) {
    next(error);
  }
};

router.post('/:id/confirm-receipt', requireAuth, handleCustomerReceiptConfirmation);
router.post('/:id/receive', requireAuth, handleCustomerReceiptConfirmation);

router.post('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const currentStatus = normalizeOrderStatus(currentOrder.order_status);
    const role = String(req.profile?.role || '').toLowerCase();
    const isPrivileged = ['admin', 'staff'].includes(role);
    const belongsToCustomer = currentOrder.user_id === req.authUser.id;
    const reason = String(req.body?.reason || req.body?.cancellationReason || '').trim();

    if (!isPrivileged && !belongsToCustomer) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (!isPrivileged && currentStatus !== 'pending') {
      return res.status(400).json({ error: 'Customers can only cancel orders while they are pending.' });
    }

    if (isPrivileged && ['delivered', 'completed', 'refunded', 'cancelled'].includes(currentStatus)) {
      return res.status(400).json({ error: 'This order can no longer be cancelled.' });
    }

    const { statusPatch, notifications } = await setOrderStatus(supabase, currentOrder, 'cancelled', { reason });
    const mergedNotifications = [
      ...normalizeNotifications(currentOrder.notifications || []),
      ...notifications,
    ];

    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
      ...statusPatch,
      notifications: mergedNotifications,
    });

    res.json(mapOrder(updatedOrder));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/report-issue', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentOrder = await fetchOrderById(supabase, req.params.id);
    const currentStatus = normalizeOrderStatus(currentOrder.order_status);
    const currentReviewStatus = normalizeReviewStatus(currentOrder.review_status);

    if (currentOrder.user_id !== req.authUser.id && !['admin', 'staff'].includes(String(req.profile?.role || '').toLowerCase())) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (currentStatus !== 'delivered') {
      return res.status(400).json({ error: 'You can only report an issue after the order is marked Delivered.' });
    }

    if (currentReviewStatus === 'under_review') {
      return res.status(409).json({ error: 'This order is already under review.' });
    }

    const customerName = String(
      req.body?.customer_name
      || req.body?.customerName
      || currentOrder.customer_name
      || req.profile?.full_name
      || req.profile?.username
      || 'Customer',
    ).trim();
    const description = String(req.body?.description || '').trim();
    const issueType = String(req.body?.issue_type || req.body?.issueType || 'damage').trim() || 'damage';
    const evidenceImageDataUrl = validateReceiptImageDataUrl(
      req.body?.evidence_image_data_url
      || req.body?.evidenceImageDataUrl
      || req.body?.image_data_url
      || '',
    );

    if (!customerName) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    if (!description) {
      return res.status(400).json({ error: 'Description of the issue is required.' });
    }

    if (!evidenceImageDataUrl) {
      return res.status(400).json({ error: 'Photographic evidence is required.' });
    }

    const now = new Date().toISOString();

    const { data: report, error: reportError } = await supabase
      .from('order_issue_reports')
      .insert({
        order_id: currentOrder.id,
        user_id: currentOrder.user_id,
        customer_name: customerName,
        issue_type: issueType,
        description,
        evidence_image_url: evidenceImageDataUrl,
        detection_date: now,
        review_status: 'under_review',
      })
      .select('*')
      .single();

    if (reportError) {
      throw reportError;
    }

    const statusTimestamps = {
      ...normalizeStatusTimestamps(currentOrder.status_timestamps || {}),
    };
    const notifications = [
      ...normalizeNotifications(currentOrder.notifications || []),
      buildNotificationEntry('customer', 'issue_report_submitted', `Your issue report for Order ${currentOrder.order_code || currentOrder.id} is under review.`),
      buildNotificationEntry('admin_staff', 'issue_report_submitted', `New issue report received for Order ${currentOrder.order_code || currentOrder.id}. Review the photo proof and details.`),
    ];

    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
      review_status: 'under_review',
      review_reason: null,
      review_status_updated_at: now,
      status_timestamps: statusTimestamps,
      notifications,
    });

    res.status(201).json({
      order: mapOrder(updatedOrder),
      report,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/reports/:reportId', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const decision = String(req.body?.decision || req.body?.review_status || '').trim().toLowerCase();
    const reason = String(req.body?.reason || req.body?.reviewReason || '').trim();

    if (!['approve', 'approved', 'reject', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approve or reject.' });
    }

    if (['reject', 'rejected'].includes(decision) && !reason) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: report, error: reportError } = await supabase
      .from('order_issue_reports')
      .select('*')
      .eq('id', req.params.reportId)
      .maybeSingle();

    if (reportError) {
      throw reportError;
    }

    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const currentOrder = await fetchOrderById(supabase, report.order_id);
    const currentReviewStatus = normalizeReviewStatus(currentOrder.review_status);

    if (currentReviewStatus !== 'under_review') {
      return res.status(409).json({ error: 'This report has already been resolved.' });
    }

    const now = new Date().toISOString();
    const reviewerId = req.authUser.id;
    const mergedNotifications = [...normalizeNotifications(currentOrder.notifications || [])];

    if (['approve', 'approved'].includes(decision)) {
      const updatedReport = await supabase
        .from('order_issue_reports')
        .update({
          review_status: 'approved',
          review_reason: reason || 'Refund approved.',
          reviewed_by: reviewerId,
          reviewed_at: now,
        })
        .eq('id', report.id)
        .select('*')
        .single();

      if (updatedReport.error) {
        throw updatedReport.error;
      }

      const statusTimestamps = {
        ...normalizeStatusTimestamps(currentOrder.status_timestamps || {}),
        refunded: now,
      };

      mergedNotifications.push(
        buildNotificationEntry('customer', 'refund_approved', `Your refund for Order ${currentOrder.order_code || currentOrder.id} was approved. The order is now refunded.`),
        buildNotificationEntry('admin_staff', 'refund_approved', `Refund approved for Order ${currentOrder.order_code || currentOrder.id}. Revenue has been reversed.`),
      );

      const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
        order_status: 'refunded',
        review_status: 'approved',
        review_reason: reason || 'Refund approved.',
        review_status_updated_at: now,
        status_timestamps: statusTimestamps,
        notifications: mergedNotifications,
      });

      return res.json({
        report: updatedReport.data,
        order: mapOrder(updatedOrder),
      });
    }

    const updatedReport = await supabase
      .from('order_issue_reports')
      .update({
        review_status: 'rejected',
        review_reason: reason,
        reviewed_by: reviewerId,
        reviewed_at: now,
      })
      .eq('id', report.id)
      .select('*')
      .single();

    if (updatedReport.error) {
      throw updatedReport.error;
    }

    mergedNotifications.push(
      buildNotificationEntry('customer', 'refund_rejected', `Your issue report for Order ${currentOrder.order_code || currentOrder.id} was rejected. Reason: ${reason}.`),
      buildNotificationEntry('admin_staff', 'refund_rejected', `Issue report rejected for Order ${currentOrder.order_code || currentOrder.id}.`),
    );

    const updatedOrder = await updateOrderRecord(supabase, currentOrder.id, {
      review_status: 'rejected',
      review_reason: reason,
      review_status_updated_at: now,
      notifications: mergedNotifications,
    });

    return res.json({
      report: updatedReport.data,
      order: mapOrder(updatedOrder),
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const nextStatus = normalizeOrderStatus(req.body?.order_status || '');
    const reason = String(req.body?.reason || req.body?.cancellationReason || '').trim();

    if (!VALID_ORDER_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ error: 'order_status is required and must be valid.' });
    }

    if (nextStatus === 'pending') {
      return res.status(400).json({ error: 'Pending is only allowed when a new order is created.' });
    }

    if (['completed', 'refunded'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Customer confirmation or refund review is required for that status.' });
    }

    const supabase = getSupabaseAdmin();
    const updatedOrder = await applyOrderStatusChange(supabase, req.params.id, nextStatus, { reason });
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

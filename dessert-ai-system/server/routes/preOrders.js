import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import {
  VALID_PRE_ORDER_METHODS,
  VALID_PRE_ORDER_STATUSES,
  buildPreOrderNotificationEntry,
  buildPreOrderStatusTimestamps,
  isAtLeastNextDay,
  isValidContactNumber,
  isValidDateInput,
  isValidTimeInput,
  mapPreOrder,
  normalizeContactNumber,
  normalizePreOrderMethod,
  normalizePreOrderNotifications,
  normalizePreOrderStatus,
  preOrderSelect,
} from '../lib/preOrderUtils.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

const fetchPreOrderById = async (supabase, preOrderId) => {
  const { data, error } = await supabase
    .from('pre_orders')
    .select(preOrderSelect)
    .eq('id', preOrderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const notFoundError = new Error('Pre-order not found.');
    notFoundError.status = 404;
    throw notFoundError;
  }

  return data;
};

const buildStatusMessages = (preOrder, nextStatus, reason = '') => {
  const productName = preOrder?.products?.product_name || preOrder?.product_name || 'your pre-order';
  const scheduleBits = [preOrder?.scheduled_date, preOrder?.scheduled_time].filter(Boolean).join(' at ');
  const scheduleText = scheduleBits ? ` for ${scheduleBits}` : '';
  const reasonText = reason ? ` Reason: ${reason}` : '';

  switch (nextStatus) {
    case 'confirmed':
      return {
        customer: `Your pre-order for ${productName}${scheduleText} has been confirmed.`,
        adminStaff: `Pre-order for ${productName}${scheduleText} was confirmed.`,
      };
    case 'completed':
      return {
        customer: `Your pre-order for ${productName}${scheduleText} has been completed.`,
        adminStaff: `Pre-order for ${productName}${scheduleText} was marked completed.`,
      };
    case 'rejected':
      return {
        customer: `Your pre-order for ${productName}${scheduleText} was rejected.${reasonText}`,
        adminStaff: `Pre-order for ${productName}${scheduleText} was rejected.${reasonText}`,
      };
    default:
      return {
        customer: `Your pre-order for ${productName}${scheduleText} is pending review.`,
        adminStaff: `Pre-order for ${productName}${scheduleText} is pending review.`,
      };
  }
};

router.get('/', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('pre_orders')
      .select(preOrderSelect)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json((data || []).map(mapPreOrder));
  } catch (error) {
    next(error);
  }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('pre_orders')
      .select(preOrderSelect)
      .eq('user_id', req.authUser.id)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json((data || []).map(mapPreOrder));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      product_id = '',
      customer_name = '',
      phone_number = '',
      address = '',
      quantity = 1,
      preferred_order_date = '',
      preferred_order_time = '',
      delivery_method = 'cod',
      pickup_date = '',
      pickup_time = '',
    } = req.body || {};

    const normalizedProductId = String(product_id || '').trim();
    const normalizedCustomerName = String(customer_name || '').trim();
    const normalizedPhoneNumber = normalizeContactNumber(phone_number);
    const normalizedAddress = String(address || '').trim();
    const normalizedQuantity = Number(quantity);
    const normalizedMethod = normalizePreOrderMethod(delivery_method);
    const normalizedPreferredDate = String(preferred_order_date || '').trim();
    const normalizedPreferredTime = String(preferred_order_time || '').trim();
    const normalizedPickupDate = String(pickup_date || '').trim();
    const normalizedPickupTime = String(pickup_time || '').trim();

    if (!normalizedProductId) {
      return res.status(400).json({ error: 'A product is required for the pre-order.' });
    }

    if (!normalizedCustomerName || !normalizedPhoneNumber || !normalizedAddress) {
      return res.status(400).json({ error: 'Full name, address, and contact number are required.' });
    }

    if (!isValidContactNumber(normalizedPhoneNumber)) {
      return res.status(400).json({ error: 'Contact number must be a valid Philippine mobile number.' });
    }

    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 1) {
      return res.status(400).json({ error: 'Quantity must be a whole number greater than zero.' });
    }

    if (!VALID_PRE_ORDER_METHODS.includes(normalizedMethod)) {
      return res.status(400).json({ error: 'Please choose a valid pre-order method.' });
    }

    if (!isValidDateInput(normalizedPreferredDate) || !isAtLeastNextDay(normalizedPreferredDate)) {
      return res.status(400).json({ error: 'Preferred order date must be at least one day in advance.' });
    }

    if (!isValidTimeInput(normalizedPreferredTime)) {
      return res.status(400).json({ error: 'Preferred time is required.' });
    }

    if (normalizedMethod === 'pickup') {
      if (!isValidDateInput(normalizedPickupDate) || !isAtLeastNextDay(normalizedPickupDate)) {
        return res.status(400).json({ error: 'Pickup date must be at least one day in advance.' });
      }

      if (!isValidTimeInput(normalizedPickupTime)) {
        return res.status(400).json({ error: 'Pickup time is required for pickup pre-orders.' });
      }
    }

    const scheduledDate = normalizedMethod === 'pickup' ? normalizedPickupDate : normalizedPreferredDate;
    const scheduledTime = normalizedMethod === 'pickup' ? normalizedPickupTime : normalizedPreferredTime;
    const supabase = getSupabaseAdmin();
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, product_name, category, image_url, price, availability')
      .eq('id', normalizedProductId)
      .maybeSingle();

    if (productError) {
      throw productError;
    }

    if (!product || product.availability === 'hidden') {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const notifications = [
      buildPreOrderNotificationEntry(
        'customer',
        'pre_order_pending',
        `Your pre-order for ${product.product_name} on ${scheduledDate} at ${scheduledTime} is pending review.`,
      ),
      buildPreOrderNotificationEntry(
        'admin_staff',
        'new_pre_order',
        `New pre-order received for ${product.product_name} on ${scheduledDate} at ${scheduledTime}.`,
      ),
    ];

    const { data: createdPreOrder, error: createError } = await supabase
      .from('pre_orders')
      .insert({
        user_id: req.authUser.id,
        product_id: product.id,
        customer_name: normalizedCustomerName,
        phone_number: normalizedPhoneNumber,
        address: normalizedAddress,
        quantity: normalizedQuantity,
        preferred_order_date: normalizedPreferredDate,
        preferred_order_time: normalizedPreferredTime,
        pickup_date: normalizedMethod === 'pickup' ? normalizedPickupDate : null,
        pickup_time: normalizedMethod === 'pickup' ? normalizedPickupTime : null,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        delivery_method: normalizedMethod,
        status: 'pending',
        rejection_reason: null,
        notifications,
        status_timestamps: buildPreOrderStatusTimestamps({}, 'pending'),
      })
      .select(preOrderSelect)
      .single();

    if (createError) {
      throw createError;
    }

    res.status(201).json(mapPreOrder(createdPreOrder));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const nextStatus = normalizePreOrderStatus(
      req.body?.status
      || req.body?.pre_order_status
      || req.body?.order_status
      || '',
    );
    const reason = String(req.body?.reason || req.body?.rejection_reason || '').trim();

    if (!VALID_PRE_ORDER_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ error: 'status must be pending, confirmed, completed, or rejected.' });
    }

    if (nextStatus === 'rejected' && !reason) {
      return res.status(400).json({ error: 'A rejection reason is required when rejecting a pre-order.' });
    }

    const supabase = getSupabaseAdmin();
    const currentPreOrder = await fetchPreOrderById(supabase, req.params.id);
    const messages = buildStatusMessages(currentPreOrder, nextStatus, reason);
    const mergedNotifications = [
      ...normalizePreOrderNotifications(currentPreOrder.notifications || []),
      buildPreOrderNotificationEntry('customer', `pre_order_${nextStatus}`, messages.customer),
      buildPreOrderNotificationEntry('admin_staff', `pre_order_${nextStatus}`, messages.adminStaff),
    ];

    const { data: updatedPreOrder, error: updateError } = await supabase
      .from('pre_orders')
      .update({
        status: nextStatus,
        rejection_reason: nextStatus === 'rejected' ? reason : null,
        notifications: mergedNotifications,
        status_timestamps: buildPreOrderStatusTimestamps(
          currentPreOrder.status_timestamps || {},
          nextStatus,
        ),
      })
      .eq('id', currentPreOrder.id)
      .select(preOrderSelect)
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (!updatedPreOrder) {
      return res.status(404).json({ error: 'Pre-order not found.' });
    }

    res.json(mapPreOrder(updatedPreOrder));
  } catch (error) {
    next(error);
  }
});

export default router;

import crypto from 'crypto';
import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  DELIVERY_FEE,
  createFulfilledOrder,
  enrichItemsFromProducts,
  fetchProductsByIds,
  getShortagesForItems,
  hydrateOrderById,
  mapOrder,
  normalizeRequestedItems,
} from '../lib/orderUtils.js';
import {
  createPayMongoCheckoutSession,
  expirePayMongoCheckoutSession,
  getPayMongoFrontendBaseUrl,
  getPayMongoStatusPayload,
  isPayMongoConfigured,
  retrievePayMongoCheckoutSession,
  verifyPayMongoWebhookSignature,
} from '../lib/paymongo.js';

const router = express.Router();

const TERMINAL_CHECKOUT_STATUSES = new Set(['failed', 'expired', 'cancelled', 'fulfilled']);

const normalizeCheckoutStatus = (value = '') => {
  const normalized = String(value || '').toLowerCase();

  if (/(paid|succeeded|successful)/.test(normalized)) {
    return 'paid';
  }

  if (/(fail|declin)/.test(normalized)) {
    return 'failed';
  }

  if (/(expire)/.test(normalized)) {
    return 'expired';
  }

  if (/(cancel|canceled)/.test(normalized)) {
    return 'cancelled';
  }

  if (normalized === 'fulfilled') {
    return 'fulfilled';
  }

  return 'created';
};

const generateReferenceNumber = () => (
  `PM-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
);

const createFailureSummary = (shortages = []) => (
  shortages
    .map((item) => `${item.productName} (${item.available} left, paid for ${item.requested})`)
    .join(', ')
);

const getCheckoutSessionAttributes = (payload) => (
  payload?.attributes
  || payload?.data?.attributes
  || {}
);

const extractCheckoutStateFromPayMongoSession = (session) => {
  const attributes = getCheckoutSessionAttributes(session);
  const payments = Array.isArray(attributes.payments) ? attributes.payments : [];
  const firstPayment = payments[0] || null;
  const paymentAttributes = firstPayment?.attributes || firstPayment || {};
  const paymentIntent = attributes.payment_intent || {};
  const paymentIntentAttributes = paymentIntent?.attributes || paymentIntent || {};

  const rawStatus = [
    paymentAttributes.status,
    paymentIntentAttributes.status,
    attributes.payment_status,
    attributes.status,
  ].find(Boolean) || (payments.length > 0 ? 'paid' : '');

  return {
    checkoutSessionId: session?.id || attributes.id || '',
    status: normalizeCheckoutStatus(rawStatus),
    paymentId: firstPayment?.id || paymentAttributes.id || '',
    paymentIntentId: paymentIntent?.id || paymentIntentAttributes.id || paymentAttributes.payment_intent_id || '',
    referenceNumber: attributes.reference_number || paymentAttributes.reference_number || '',
    paidAt: paymentAttributes.paid_at || paymentAttributes.created_at || null,
  };
};

const findCheckoutByIdentifiers = async (supabase, { referenceNumber = '', checkoutSessionId = '' }) => {
  if (referenceNumber) {
    const { data, error } = await supabase
      .from('payment_checkouts')
      .select('*')
      .eq('reference_number', referenceNumber)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  if (!checkoutSessionId) {
    return null;
  }

  const { data, error } = await supabase
    .from('payment_checkouts')
    .select('*')
    .eq('checkout_session_id', checkoutSessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const loadOrderForCheckout = async (supabase, checkout) => {
  if (!checkout?.order_id) {
    return null;
  }

  return mapOrder(await hydrateOrderById(supabase, checkout.order_id));
};

const mapCheckoutResponse = (checkout, order = null, extras = {}) => ({
  id: checkout.id,
  provider: checkout.provider,
  referenceNumber: checkout.reference_number,
  status: checkout.status,
  checkoutSessionId: checkout.checkout_session_id || '',
  checkoutUrl: checkout.checkout_url || '',
  amount: Number(checkout.amount) || 0,
  currency: checkout.currency || 'PHP',
  paymentMethod: checkout.payment_method || 'online',
  deliveryMethod: checkout.delivery_method || 'pickup',
  failureReason: checkout.failure_reason || '',
  paidAt: checkout.paid_at || null,
  orderId: checkout.order_id || '',
  order,
  fulfillmentStatus: order ? 'fulfilled' : (checkout.status === 'paid' ? 'needs-review' : 'pending'),
  ...extras,
});

const getOwnedCheckout = async (supabase, referenceNumber, user) => {
  let query = supabase
    .from('payment_checkouts')
    .select('*')
    .eq('reference_number', referenceNumber);

  if (!['admin', 'staff'].includes(user?.role)) {
    query = query.eq('user_id', user?.id || '');
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const updateCheckoutRecord = async (supabase, checkoutId, patch) => {
  const { data, error } = await supabase
    .from('payment_checkouts')
    .update(patch)
    .eq('id', checkoutId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const finalizePaidCheckout = async (supabase, checkout) => {
  if (checkout.order_id) {
    return {
      checkout,
      order: await loadOrderForCheckout(supabase, checkout),
    };
  }

  const normalizedItems = normalizeRequestedItems(checkout.line_items || []);
  const productIds = [...new Set(normalizedItems.map((item) => item.product_id).filter(Boolean))];
  const productsById = await fetchProductsByIds(supabase, productIds);
  const shortages = getShortagesForItems(normalizedItems, productsById);

  if (shortages.length > 0) {
    const failureReason = `Payment succeeded, but the following items are no longer available: ${createFailureSummary(shortages)}.`;
    const updatedCheckout = await updateCheckoutRecord(supabase, checkout.id, {
      status: 'paid',
      failure_reason: failureReason,
      paid_at: checkout.paid_at || new Date().toISOString(),
    });

    return {
      checkout: updatedCheckout,
      order: null,
      shortages,
    };
  }

  const finalizedItems = enrichItemsFromProducts(normalizedItems, productsById).map((item) => ({
    ...item,
    available_stock_quantity: Number(productsById.get(item.product_id)?.stock_quantity) || 0,
  }));

  const order = await createFulfilledOrder(supabase, {
    userId: checkout.user_id,
    customerName: checkout.customer_name,
    phoneNumber: checkout.phone_number,
    address: checkout.address,
    deliveryMethod: checkout.delivery_method,
    paymentMethod: checkout.payment_method,
    totalPrice: Number(checkout.amount) || 0,
    items: finalizedItems,
  });

  const updatedCheckout = await updateCheckoutRecord(supabase, checkout.id, {
    status: 'fulfilled',
    order_id: order.id,
    paid_at: checkout.paid_at || new Date().toISOString(),
    failure_reason: null,
  });

  return {
    checkout: updatedCheckout,
    order,
  };
};

const syncCheckoutFromPayMongo = async (supabase, checkout) => {
  if (!checkout?.checkout_session_id || !isPayMongoConfigured()) {
    return {
      checkout,
      order: await loadOrderForCheckout(supabase, checkout),
    };
  }

  const payMongoSession = await retrievePayMongoCheckoutSession(checkout.checkout_session_id);
  const sessionState = extractCheckoutStateFromPayMongoSession(payMongoSession);

  let syncedCheckout = checkout;
  const nextPatch = {};

  const nextPaymentId = sessionState.paymentId || null;
  const currentPaymentId = checkout.payment_id || null;
  if (nextPaymentId && nextPaymentId !== currentPaymentId) {
    nextPatch.payment_id = nextPaymentId;
  }

  const nextPaymentIntentId = sessionState.paymentIntentId || null;
  const currentPaymentIntentId = checkout.payment_intent_id || null;
  if (nextPaymentIntentId && nextPaymentIntentId !== currentPaymentIntentId) {
    nextPatch.payment_intent_id = nextPaymentIntentId;
  }

  if (sessionState.status && sessionState.status !== checkout.status) {
    nextPatch.status = sessionState.status;
  }

  if (sessionState.paidAt && sessionState.paidAt !== checkout.paid_at) {
    nextPatch.paid_at = sessionState.paidAt;
  }

  if (Object.keys(nextPatch).length > 0) {
    syncedCheckout = await updateCheckoutRecord(supabase, checkout.id, nextPatch);
  }

  if (sessionState.status === 'paid' || syncedCheckout.status === 'paid' || syncedCheckout.status === 'fulfilled') {
    return finalizePaidCheckout(supabase, syncedCheckout);
  }

  return {
    checkout: syncedCheckout,
    order: await loadOrderForCheckout(supabase, syncedCheckout),
  };
};

router.get('/status', (req, res) => {
  res.json(getPayMongoStatusPayload());
});

router.post('/checkout-sessions', requireAuth, async (req, res, next) => {
  try {
    if (!isPayMongoConfigured()) {
      return res.status(503).json({
        error: 'PayMongo is not configured yet. Add PAYMONGO_SECRET_KEY to dessert-ai-system/server/.env and restart the backend.',
      });
    }

    const {
      lineItems = [],
      customerName = '',
      phoneNumber = '',
      address = '',
      deliveryMethod = 'pickup',
      paymentMethod = 'online',
    } = req.body || {};

    const normalizedItems = normalizeRequestedItems(lineItems);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: 'At least one checkout item is required.' });
    }

    const productIds = [...new Set(normalizedItems.map((item) => item.product_id).filter(Boolean))];
    const supabase = getSupabaseAdmin();
    const productsById = await fetchProductsByIds(supabase, productIds);
    const shortages = getShortagesForItems(normalizedItems, productsById);

    if (shortages.length > 0) {
      return res.status(409).json({
        error: 'Some products do not have enough stock.',
        shortages,
      });
    }

    const finalizedItems = enrichItemsFromProducts(normalizedItems, productsById);
    const productSubtotal = finalizedItems.reduce((sum, item) => sum + ((Number(item.price) || 0) * item.quantity), 0);
    const deliveryCharge = deliveryMethod === 'delivery' ? DELIVERY_FEE : 0;
    const totalAmount = productSubtotal + deliveryCharge;
    const referenceNumber = generateReferenceNumber();
    const frontendBaseUrl = getPayMongoFrontendBaseUrl();
    const successUrl = `${frontendBaseUrl}/checkout/paymongo/success?reference=${encodeURIComponent(referenceNumber)}`;
    const cancelUrl = `${frontendBaseUrl}/checkout/paymongo/cancel?reference=${encodeURIComponent(referenceNumber)}`;

    const checkoutSession = await createPayMongoCheckoutSession({
      referenceNumber,
      customer: {
        name: customerName || req.profile?.full_name || req.profile?.username || 'Customer',
        email: req.profile?.email || req.authUser?.email || '',
        phone: phoneNumber || req.profile?.phone_number || '',
      },
      successUrl,
      cancelUrl,
      description: `V&G Dessert order ${referenceNumber}`,
      lineItems: [
        ...finalizedItems.map((item) => ({
          amount: item.price,
          name: item.name,
          quantity: item.quantity,
          description: item.category || item.description || item.name,
        })),
        ...(deliveryCharge > 0
          ? [{
              amount: deliveryCharge,
              name: 'Delivery Fee',
              quantity: 1,
              description: 'Standard delivery charge',
            }]
          : []),
      ],
    });

    const { data: createdCheckout, error: checkoutError } = await supabase
      .from('payment_checkouts')
      .insert({
        user_id: req.authUser.id,
        provider: 'paymongo',
        status: 'created',
        payment_method: String(paymentMethod || 'online').toLowerCase(),
        reference_number: referenceNumber,
        checkout_session_id: checkoutSession?.id || null,
        checkout_url: checkoutSession?.attributes?.checkout_url || '',
        amount: totalAmount,
        currency: 'PHP',
        customer_name: customerName || req.profile?.full_name || req.profile?.username || 'Customer',
        customer_email: req.profile?.email || req.authUser?.email || '',
        phone_number: phoneNumber || req.profile?.phone_number || '',
        address: address || req.profile?.address || '',
        delivery_method: deliveryMethod,
        line_items: finalizedItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
          name: item.name,
          category: item.category,
        })),
      })
      .select('*')
      .single();

    if (checkoutError) {
      throw checkoutError;
    }

    res.status(201).json(mapCheckoutResponse(createdCheckout, null, {
      checkoutSessionId: checkoutSession?.id || '',
      checkoutUrl: checkoutSession?.attributes?.checkout_url || '',
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/checkouts/:referenceNumber', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const checkout = await getOwnedCheckout(supabase, req.params.referenceNumber, req.authUser);

    if (!checkout) {
      return res.status(404).json({ error: 'Payment checkout not found.' });
    }

    const shouldSync = !TERMINAL_CHECKOUT_STATUSES.has(checkout.status);
    const { checkout: syncedCheckout, order, shortages } = shouldSync
      ? await syncCheckoutFromPayMongo(supabase, checkout)
      : {
          checkout,
          order: await loadOrderForCheckout(supabase, checkout),
        };

    res.json(mapCheckoutResponse(syncedCheckout, order, {
      shortages: shortages || [],
    }));
  } catch (error) {
    next(error);
  }
});

router.post('/checkouts/:referenceNumber/cancel', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const checkout = await getOwnedCheckout(supabase, req.params.referenceNumber, req.authUser);

    if (!checkout) {
      return res.status(404).json({ error: 'Payment checkout not found.' });
    }

    if (checkout.order_id) {
      return res.status(409).json({ error: 'This payment is already tied to a completed order.' });
    }

    if (checkout.checkout_session_id && isPayMongoConfigured()) {
      try {
        await expirePayMongoCheckoutSession(checkout.checkout_session_id);
      } catch (error) {
        console.warn('Unable to expire PayMongo checkout session:', error.message);
      }
    }

    const updatedCheckout = await updateCheckoutRecord(supabase, checkout.id, {
      status: 'cancelled',
      failure_reason: 'Checkout was cancelled before payment was completed.',
    });

    res.json(mapCheckoutResponse(updatedCheckout));
  } catch (error) {
    next(error);
  }
});

router.post('/webhooks/paymongo', async (req, res, next) => {
  try {
    const verification = verifyPayMongoWebhookSignature({
      payload: req.rawBody || JSON.stringify(req.body || {}),
      signatureHeader: req.headers['paymongo-signature'] || '',
    });

    if (!verification.ok) {
      return res.status(400).json({ error: verification.reason });
    }

    const eventType = String(req.body?.data?.attributes?.type || '').toLowerCase();
    const eventResource = req.body?.data?.attributes?.data || null;
    const eventResourceAttributes = eventResource?.attributes || {};
    const referenceNumber = eventResourceAttributes.reference_number || '';
    const checkoutSessionId = eventResource?.id || eventResourceAttributes.checkout_session_id || '';

    const supabase = getSupabaseAdmin();
    const checkout = await findCheckoutByIdentifiers(supabase, {
      referenceNumber,
      checkoutSessionId,
    });

    if (!checkout) {
      return res.status(202).json({ received: true, message: 'Webhook accepted, but no matching local checkout was found.' });
    }

    if (eventType === 'checkout_session.payment.paid' || eventType === 'payment.paid') {
      const updatedCheckout = await updateCheckoutRecord(supabase, checkout.id, {
        status: 'paid',
        paid_at: checkout.paid_at || new Date().toISOString(),
      });

      await syncCheckoutFromPayMongo(supabase, updatedCheckout);
    }

    if (eventType === 'payment.failed') {
      await updateCheckoutRecord(supabase, checkout.id, {
        status: 'failed',
        failure_reason: eventResourceAttributes?.status || 'PayMongo marked this payment as failed.',
      });
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

export default router;

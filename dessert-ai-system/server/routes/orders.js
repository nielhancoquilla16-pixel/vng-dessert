import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

const VALID_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'processing', 'completed', 'delivered', 'cancelled'];

const orderSelect = `
  id,
  user_id,
  customer_name,
  phone_number,
  address,
  delivery_method,
  payment_method,
  total_price,
  order_status,
  created_at,
  profiles (
    id,
    username,
    email,
    full_name,
    role
  ),
  order_items (
    id,
    product_id,
    quantity,
    price,
    products (
      id,
      product_name,
      category,
      image_url
    )
  )
`;

const toDisplayId = (id) => `ORD-${String(id).replace(/-/g, '').slice(0, 4).toUpperCase()}`;

const formatCurrency = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

const buildItemsText = (items = []) => (
  items
    .map((item) => `${item.quantity}x ${item.product?.productName || 'Unknown Product'}`)
    .join(', ')
);

const mapOrder = (row) => {
  const mappedItems = (row.order_items || []).map((item) => ({
    id: item.id,
    productId: item.product_id,
    quantity: Number(item.quantity) || 0,
    price: Number(item.price) || 0,
    name: item.products?.product_name || 'Unknown Product',
    category: item.products?.category || 'Uncategorized',
    lineTotal: (Number(item.price) || 0) * (Number(item.quantity) || 0),
    product: item.products
      ? {
          id: item.products.id,
          productName: item.products.product_name,
          category: item.products.category,
          imageUrl: item.products.image_url,
        }
      : null,
  }));

  const customerName = row.customer_name
    || row.profiles?.full_name
    || row.profiles?.username
    || 'Customer';

  const paymentLabel = row.payment_method === 'gcash' ? 'GCash' : 'Cash';
  const subtext = row.delivery_method === 'delivery'
    ? (row.address || 'Delivery')
    : `Walk-in / ${paymentLabel}`;
  const createdAt = row.created_at || new Date().toISOString();
  const totalPrice = Number(row.total_price) || 0;

  return {
    id: row.id,
    displayId: toDisplayId(row.id),
    userId: row.user_id,
    customer: customerName,
    customerUsername: row.profiles?.username || '',
    customerEmail: row.profiles?.email || '',
    phoneNumber: row.phone_number || '',
    address: row.address || '',
    deliveryMethod: row.delivery_method || 'pickup',
    paymentMethod: row.payment_method || 'cash',
    subtext,
    totalPrice,
    totalAmount: totalPrice,
    total: formatCurrency(totalPrice),
    orderStatus: row.order_status,
    status: (row.order_status || 'pending').toLowerCase(),
    createdAt,
    date: createdAt.split('T')[0],
    lineItems: mappedItems,
    items: buildItemsText(mappedItems),
    itemsText: buildItemsText(mappedItems),
  };
};

const getAvailabilityForStock = (stockQuantity) => (stockQuantity <= 0 ? 'out of stock' : 'available');

const hydrateOrderById = async (supabase, orderId) => {
  const { data, error } = await supabase
    .from('orders')
    .select(orderSelect)
    .eq('id', orderId)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

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
      total_price,
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

    const normalizedItems = items.map((item) => ({
      product_id: item.product_id || item.productId,
      quantity: Math.max(1, Number(item.quantity) || 1),
      price: Math.max(0, Number(item.price) || 0),
    }));

    if (normalizedItems.some((item) => !item.product_id)) {
      return res.status(400).json({ error: 'Each order item must include a product_id.' });
    }

    const requestedProductIds = [...new Set(normalizedItems.map((item) => item.product_id))];
    const supabase = getSupabaseAdmin();
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .in('id', requestedProductIds);

    if (productsError) {
      throw productsError;
    }

    const productsById = new Map((products || []).map((product) => [product.id, product]));
    const shortages = [];

    normalizedItems.forEach((item) => {
      const matchingProduct = productsById.get(item.product_id);
      const availableStock = Number(matchingProduct?.stock_quantity) || 0;
      if (!matchingProduct || availableStock < item.quantity) {
        shortages.push({
          productId: item.product_id,
          productName: matchingProduct?.product_name || 'Unknown Product',
          available: availableStock,
          requested: item.quantity,
        });
      }
    });

    if (shortages.length > 0) {
      return res.status(409).json({
        error: 'Some products do not have enough stock.',
        shortages,
      });
    }

    const calculatedTotal = normalizedItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const finalStatus = String(order_status).toLowerCase();

    const { data: createdOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: req.authUser.id,
        customer_name: customer_name || req.profile?.full_name || req.profile?.username || 'Customer',
        phone_number: phone_number || req.profile?.phone_number || null,
        address: address || req.profile?.address || null,
        delivery_method,
        payment_method,
        total_price: Number(total_price) || calculatedTotal,
        order_status: finalStatus,
      })
      .select('*')
      .single();

    if (orderError) {
      throw orderError;
    }

    const orderItemsPayload = normalizedItems.map((item) => ({
      order_id: createdOrder.id,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsPayload);

    if (itemsError) {
      throw itemsError;
    }

    for (const item of normalizedItems) {
      const matchingProduct = productsById.get(item.product_id);
      const nextStock = Math.max(0, (Number(matchingProduct?.stock_quantity) || 0) - item.quantity);

      const { error: updateProductError } = await supabase
        .from('products')
        .update({
          stock_quantity: nextStock,
          availability: getAvailabilityForStock(nextStock),
        })
        .eq('id', item.product_id);

      if (updateProductError) {
        throw updateProductError;
      }
    }

    const { data: cart, error: cartError } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', req.authUser.id)
      .maybeSingle();

    if (cartError) {
      throw cartError;
    }

    if (cart?.id) {
      const { error: clearCartError } = await supabase
        .from('cart_items')
        .delete()
        .eq('cart_id', cart.id);

      if (clearCartError) {
        throw clearCartError;
      }
    }

    const hydratedOrder = await hydrateOrderById(supabase, createdOrder.id);
    res.status(201).json(mapOrder(hydratedOrder));
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
    const { data, error } = await supabase
      .from('orders')
      .update({ order_status: nextStatus })
      .eq('id', req.params.id)
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

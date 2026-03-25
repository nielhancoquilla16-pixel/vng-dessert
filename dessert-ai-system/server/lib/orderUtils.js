import { randomUUID } from 'node:crypto';

export const VALID_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'processing', 'completed', 'received', 'delivered', 'cancelled'];
export const DELIVERY_FEE = 50;
export const DEFAULT_READY_NOTIFICATION_MESSAGE = 'Your order is ready for pickup. Please proceed to the cashier and present your QR code.';

export const generateOrderCode = () => `VNG-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

export const orderSelect = `
  id,
  order_code,
  user_id,
  customer_name,
  phone_number,
  address,
  delivery_method,
  payment_method,
  total_price,
  order_status,
  qr_claimed_at,
  ready_notified_at,
  ready_notification_message,
  receipt_image_url,
  receipt_received_at,
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

export const toDisplayId = (id) => `ORD-${String(id).replace(/-/g, '').slice(0, 4).toUpperCase()}`;

export const formatCurrency = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

export const getPaymentLabel = (value = 'cash') => {
  const normalized = String(value || 'cash').toLowerCase();

  if (normalized === 'gcash') {
    return 'GCash';
  }

  if (normalized === 'online') {
    return 'Online Payment';
  }

  return 'Cash';
};

export const buildItemsText = (items = []) => (
  items
    .map((item) => `${item.quantity}x ${item.product?.productName || item.name || 'Unknown Product'}`)
    .join(', ')
);

export const mapOrder = (row) => {
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

  const paymentLabel = getPaymentLabel(row.payment_method);
  const normalizedStatus = String(row.order_status || 'pending').toLowerCase();
  const orderCode = row.order_code || toDisplayId(row.id);
  const subtext = row.delivery_method === 'delivery'
    ? (row.address || 'Delivery')
    : `Walk-in / ${paymentLabel}${paymentLabel === 'Cash' ? ' on Pickup' : ''}`;
  const createdAt = row.created_at || new Date().toISOString();
  const totalPrice = Number(row.total_price) || 0;

  return {
    id: row.id,
    orderCode,
    displayId: orderCode,
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
    status: normalizedStatus,
    createdAt,
    date: createdAt.split('T')[0],
    lineItems: mappedItems,
    items: buildItemsText(mappedItems),
    itemsText: buildItemsText(mappedItems),
    qrClaimedAt: row.qr_claimed_at || null,
    readyNotifiedAt: row.ready_notified_at || null,
    readyNotificationMessage: row.ready_notification_message || '',
    receiptImageUrl: row.receipt_image_url || '',
    receiptReceivedAt: row.receipt_received_at || null,
    qrActive: row.delivery_method === 'pickup'
      && String(row.payment_method || 'cash').toLowerCase() === 'cash'
      && !row.qr_claimed_at
      && !['completed', 'received', 'cancelled'].includes(normalizedStatus),
  };
};

export const normalizeRequestedItems = (items = []) => (
  items.map((item) => ({
    product_id: item.product_id || item.productId || item.id,
    quantity: Math.max(1, Number(item.quantity) || 1),
    price: Math.max(0, Number(item.price) || 0),
    name: item.name || item.product_name || item.product?.productName || 'Dessert Item',
    category: item.category || item.product?.category || 'Uncategorized',
    description: item.description || '',
  }))
);

export const getAvailabilityForStock = (stockQuantity) => (stockQuantity <= 0 ? 'out of stock' : 'available');

export const hydrateOrderById = async (supabase, orderId) => {
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

export const fetchProductsByIds = async (supabase, productIds = []) => {
  if (!productIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .in('id', productIds);

  if (error) {
    throw error;
  }

  return new Map((data || []).map((product) => [product.id, product]));
};

export const getShortagesForItems = (normalizedItems = [], productsById = new Map()) => {
  const shortages = [];

  normalizedItems.forEach((item) => {
    const matchingProduct = productsById.get(item.product_id);
    const availableStock = Number(matchingProduct?.stock_quantity) || 0;
    if (!matchingProduct || availableStock < item.quantity) {
      shortages.push({
        productId: item.product_id,
        productName: matchingProduct?.product_name || item.name || 'Unknown Product',
        available: availableStock,
        requested: item.quantity,
      });
    }
  });

  return shortages;
};

export const enrichItemsFromProducts = (normalizedItems = [], productsById = new Map()) => (
  normalizedItems.map((item) => {
    const matchingProduct = productsById.get(item.product_id);
    const livePrice = Number(matchingProduct?.price);

    return {
      ...item,
      price: Number.isFinite(livePrice) ? livePrice : item.price,
      name: matchingProduct?.product_name || item.name,
      category: matchingProduct?.category || item.category,
      description: matchingProduct?.description || item.description || '',
    };
  })
);

export const clearUserCart = async (supabase, userId) => {
  if (!userId) {
    return;
  }

  const { data: cart, error: cartError } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (cartError) {
    throw cartError;
  }

  if (!cart?.id) {
    return;
  }

  const { error: clearCartError } = await supabase
    .from('cart_items')
    .delete()
    .eq('cart_id', cart.id);

  if (clearCartError) {
    throw clearCartError;
  }
};

export const createFulfilledOrder = async (
  supabase,
  {
    userId,
    profile,
    orderCode = generateOrderCode(),
    customerName = '',
    phoneNumber = '',
    address = '',
    deliveryMethod = 'pickup',
    paymentMethod = 'cash',
    totalPrice = 0,
    orderStatus = 'pending',
    items = [],
  },
) => {
  const { data: createdOrder, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      order_code: orderCode,
      customer_name: customerName || profile?.full_name || profile?.username || 'Customer',
      phone_number: phoneNumber || profile?.phone_number || null,
      address: address || profile?.address || null,
      delivery_method: deliveryMethod,
      payment_method: paymentMethod,
      total_price: Number(totalPrice) || 0,
      order_status: String(orderStatus).toLowerCase(),
    })
    .select('*')
    .single();

  if (orderError) {
    throw orderError;
  }

  const orderItemsPayload = items.map((item) => ({
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

  for (const item of items) {
    const availableStock = Number(item.available_stock_quantity);
    const nextStock = Math.max(
      0,
      (Number.isFinite(availableStock) ? availableStock : Number(item.stock_quantity) || 0) - item.quantity,
    );

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

  await clearUserCart(supabase, userId);
  return mapOrder(await hydrateOrderById(supabase, createdOrder.id));
};

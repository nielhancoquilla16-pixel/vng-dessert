const amount = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(typeof value === 'string' ? value.replace(/PHP|₱|,|\s/gi, '') : value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getItemSubtotal = (item) => amount(item?.lineTotal)
  ?? (Number(item?.price) || 0) * (Number(item?.quantity) || 0);

export const getOrderPaymentSummary = (order = {}) => {
  const items = Array.isArray(order.lineItems) ? order.lineItems : [];
  const discount = amount(order.discountAmount ?? order.discount_amount ?? order.discount) ?? 0;
  const tax = amount(order.taxAmount ?? order.tax_amount ?? order.tax) ?? 0;
  const savedTotal = amount(order.totalAmount ?? order.totalPrice ?? order.total);
  const savedDeliveryFee = amount(order.deliveryFee ?? order.delivery_fee);
  const subtotal = amount(order.subtotal ?? order.subTotal ?? order.subtotalAmount)
    ?? (items.length ? items.reduce((sum, item) => sum + getItemSubtotal(item), 0)
      : Math.max(0, (savedTotal ?? 0) + discount - tax - (savedDeliveryFee ?? 0)));
  // Older orders store only item prices and a total that includes delivery.
  const deliveryFee = savedDeliveryFee ?? (
    order.deliveryMethod === 'delivery' && savedTotal !== null && items.length
      ? Math.max(0, Math.round((savedTotal - subtotal + discount - tax) * 100) / 100)
      : 0
  );
  return { subtotal, discount, tax, deliveryFee, total: savedTotal ?? subtotal - discount + tax + deliveryFee };
};

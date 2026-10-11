// Reports need sale amounts and item names, without product/receipt/evidence
// images or delivery tracking. Legacy data URLs can make orderSelect megabytes.
export const salesReportOrderSelect = `
  id,
  user_id,
  order_code,
  customer_name,
  delivery_method,
  payment_method,
  total_price,
  order_status,
  receipt_received_at,
  status_timestamps,
  updated_at,
  created_at,
  order_items (
    id,
    product_id,
    quantity,
    price,
    products (id, product_name)
  )
`;

const WEEKLY_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const parseCurrencyAmount = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;

  const parsed = parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatCurrency = (amount) => `PHP ${Number(amount || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export const getOrderTimestamp = (order) => {
  const source = order?.createdAt || order?.date;
  const parsed = source ? new Date(source).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getOrderTotalAmount = (order) => (
  Number(order?.totalAmount) || parseCurrencyAmount(order?.total)
);

export const getStartOfSundayWeek = (value = new Date()) => {
  const date = new Date(value);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
};

export const getWeekRangeLabel = (weekStart) => {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return `${startLabel} - ${endLabel}`;
};

export const getOrderLineItems = (order, productsByName = new Map()) => {
  if (Array.isArray(order?.lineItems) && order.lineItems.length > 0) {
    return order.lineItems.map((item) => {
      const product = productsByName.get((item.name || '').toLowerCase());
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || Number(product?.price) || 0;
      const rawCategory = (item.category || '').trim();
      const resolvedCategory = rawCategory && rawCategory.toLowerCase() !== 'uncategorized'
        ? rawCategory
        : (product?.category || item.name || 'Uncategorized');

      return {
        ...item,
        quantity,
        price,
        lineTotal: Number(item.lineTotal) || price * quantity,
        category: resolvedCategory,
      };
    });
  }

  if (typeof order?.items !== 'string' || !order.items.trim()) {
    return [];
  }

  return order.items.split(', ').map((entry) => {
    const match = entry.match(/^(\d+)\s*(.+)$/);
    const quantity = Number(match?.[1]) || 0;
    const rawName = match?.[2] || entry;
    const cleanedName = rawName.replace(/^(?:x|X|[\W_])+\s*/, '').trim();
    const name = cleanedName || rawName.trim();
    const product = productsByName.get(name.toLowerCase());
    const price = Number(product?.price) || 0;

    return {
      name,
      quantity,
      category: product?.category || name || 'Uncategorized',
      price,
      lineTotal: price * quantity,
    };
  });
};

export const getOrderItemCount = (order, productsByName = new Map()) => (
  getOrderLineItems(order, productsByName).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
);

export const buildWeeklySalesData = (orders, options = {}) => {
  const referenceDate = options.referenceDate || new Date();
  const weekStart = options.weekStart || getStartOfSundayWeek(referenceDate);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  const weekStartTimestamp = weekStart.getTime();
  const nextWeekStartTimestamp = nextWeekStart.getTime();
  const parsedResetTimestamp = options.resetAt ? new Date(options.resetAt).getTime() : NaN;
  const resetTimestamp = Number.isFinite(parsedResetTimestamp)
    ? Math.max(parsedResetTimestamp, weekStartTimestamp)
    : weekStartTimestamp;

  const data = WEEKLY_DAY_LABELS.map((day) => ({
    day,
    sales: 0,
    orders: 0,
  }));

  (orders || [])
    .filter((order) => order.status !== 'cancelled')
    .forEach((order) => {
      const orderTimestamp = getOrderTimestamp(order);

      if (orderTimestamp < resetTimestamp || orderTimestamp >= nextWeekStartTimestamp) {
        return;
      }

      const dayIndex = new Date(orderTimestamp).getDay();
      data[dayIndex].sales += getOrderTotalAmount(order);
      data[dayIndex].orders += 1;
    });

  return data;
};

export const buildWeeklyHistory = (orders, options = {}) => {
  const groups = new Map();

  (orders || [])
    .filter((order) => order.status !== 'cancelled')
    .forEach((order) => {
      const orderTimestamp = getOrderTimestamp(order);
      if (!orderTimestamp) {
        return;
      }

      const weekStart = getStartOfSundayWeek(orderTimestamp);
      const key = weekStart.toISOString();
      const amount = getOrderTotalAmount(order);
      const existing = groups.get(key) || {
        key,
        weekStart,
        weekEnd: new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6),
        revenue: 0,
        orders: 0,
      };

      existing.revenue += amount;
      existing.orders += 1;
      groups.set(key, existing);
    });

  let history = Array.from(groups.values())
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
    .map((entry) => ({
      ...entry,
      label: getWeekRangeLabel(entry.weekStart),
      averageOrderValue: entry.orders > 0 ? entry.revenue / entry.orders : 0,
    }));

  if (options.limit && history.length > options.limit) {
    history = history.slice(-options.limit);
  }

  return history;
};

export const buildTopProducts = (orders, productsByName = new Map()) => {
  const productSalesMap = new Map();

  (orders || [])
    .filter((order) => order.status !== 'cancelled')
    .forEach((order) => {
      getOrderLineItems(order, productsByName).forEach((item) => {
        if (!item.name) {
          return;
        }

        productSalesMap.set(item.name, (productSalesMap.get(item.name) || 0) + (Number(item.quantity) || 0));
      });
    });

  return Array.from(productSalesMap.entries())
    .map(([name, sales]) => ({ name, sales }))
    .sort((a, b) => b.sales - a.sales);
};

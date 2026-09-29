// In-memory storage for the real auth/cart/order/settings route handlers.
// This adapter does not emulate PostgreSQL inventory triggers or external payments.
export const createPurchaseFixture = () => {
  const rows = {
    shop_settings: [{ id: 1, shop_name: 'V & G test shop', address: 'Test shop, Las Pinas', opening_time: '08:00', closing_time: '22:00', preorder_time_slots: ['10:00', '23:00'], updated_at: '2026-09-07T00:00:00.000Z' }],
    profiles: ['admin', 'customer'].map((role) => ({ id: `test-${role}`, role, username: role, full_name: `Test ${role}`, phone_number: '09123456789', email: `${role}@example.test`, email_verified: true })),
    products: [
      { id: 'available', product_name: 'Fresh Leche Flan', price: 100.5, stock_quantity: 8, category: 'Flan', availability: 'available', image_url: '/logo.png' },
      { id: 'sold-out', product_name: 'Sold Out Dessert', price: 120, stock_quantity: 0, category: 'Flan', availability: 'out of stock', image_url: '/logo.png' },
      { id: 'expired', product_name: 'Expired Dessert', price: 90, stock_quantity: 9, category: 'Flan', availability: 'expired', expiration_at: '2000-01-01T00:00:00Z', image_url: '/logo.png' },
      { id: 'hidden', product_name: 'Hidden Dessert', price: 80, stock_quantity: 9, availability: 'hidden' },
    ],
    carts: [{ id: 'customer-cart', user_id: 'test-customer' }], cart_items: [], orders: [], order_items: [],
  };
  let sequence = 0;
  let revision = 0;
  const copy = (value) => structuredClone(value);
  const join = (table, row) => {
    const result = copy(row);
    if (table === 'cart_items' || table === 'order_items') result.products = copy(rows.products.find((item) => item.id === row.product_id));
    if (table === 'cart_items') result.carts = copy(rows.carts.find((item) => item.id === row.cart_id));
    if (table === 'carts') result.cart_items = rows.cart_items.filter((item) => item.cart_id === row.id).map((item) => join('cart_items', item));
    if (table === 'orders') result.order_items = rows.order_items.filter((item) => item.order_id === row.id).map((item) => join('order_items', item));
    return result;
  };
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.action = 'select'; }
    select() { return this; }
    eq(key, value) { this.filters.push((row) => key.split('.').reduce((current, part) => current?.[part], row) === value); return this; }
    in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
    order() { return this; }
    limit(value) { this.maxRows = value; return this; }
    insert(value) { this.action = 'insert'; this.value = value; return this; }
    upsert(value) { this.action = 'upsert'; this.value = value; return this; }
    update(value) { this.action = 'update'; this.value = value; return this; }
    delete() { this.action = 'delete'; return this; }
    single() { this.one = true; return this; }
    maybeSingle() { this.one = true; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.execute()).then(resolve, reject); }
    execute() {
      if (!rows[this.table]) throw new Error(`Unsupported fixture table: ${this.table}`);
      let selected = rows[this.table].filter((row) => this.filters.every((match) => match(join(this.table, row))));
      if (this.action === 'upsert' || this.action === 'insert') {
        selected = (Array.isArray(this.value) ? this.value : [this.value]).map((value) => {
          const existing = this.action === 'upsert' && rows[this.table].find((row) => (
            this.table === 'cart_items' ? row.cart_id === value.cart_id && row.product_id === value.product_id : row.id === value.id
          ));
          const saved = { ...(existing || { id: `${this.table}-${++sequence}`, created_at: new Date().toISOString() }), ...copy(value) };
          if (this.table === 'shop_settings') {
            if (saved.opening_time === saved.closing_time) return { fixtureError: 'Operating times must differ' };
            saved.updated_at = new Date(Date.parse('2026-09-07T00:00:00Z') + ++revision * 1000).toISOString();
          }
          if (existing) Object.assign(existing, saved); else rows[this.table].push(saved);
          return saved;
        });
      } else if (this.action === 'update') {
        selected.forEach((row) => Object.assign(row, copy(this.value)));
      } else if (this.action === 'delete') {
        rows[this.table] = rows[this.table].filter((row) => !selected.includes(row));
      }
      if (selected.some((row) => row.fixtureError)) return { data: null, error: new Error('Operating times must differ') };
      const data = selected.slice(0, this.maxRows).map((row) => join(this.table, row));
      return { data: this.one ? data[0] || null : data, error: null };
    }
  }
  return {
    rows,
    database: {
      from: (table) => new Query(table),
      auth: { getUser: async (token) => ({ data: { user: rows.profiles.find((profile) => profile.id === token) || null }, error: null }) },
    },
  };
};

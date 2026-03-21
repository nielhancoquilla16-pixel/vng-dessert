import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

const getInventoryStatus = (stockQuantity) => {
  if (stockQuantity <= 0) return 'out of stock';
  if (stockQuantity <= 10) return 'low stock';
  return 'in stock';
};

const mapInventoryItem = (row) => ({
  id: row.id,
  ingredientName: row.ingredient_name,
  stockQuantity: row.stock_quantity,
  unit: row.unit,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

router.get('/', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json((data || []).map(mapInventoryItem));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const {
      ingredient_name,
      ingredientName,
      stock_quantity,
      stockQuantity,
      unit,
      status,
    } = req.body;

    const resolvedIngredientName = ingredient_name || ingredientName;
    const resolvedStockQuantity = Math.max(0, Number(stock_quantity ?? stockQuantity) || 0);

    if (!resolvedIngredientName || !unit) {
      return res.status(400).json({ error: 'ingredient_name and unit are required.' });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('inventory')
      .insert({
        ingredient_name: resolvedIngredientName,
        stock_quantity: resolvedStockQuantity,
        unit,
        status: status || getInventoryStatus(resolvedStockQuantity),
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(mapInventoryItem(data));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const updates = {};
    const fieldAliases = {
      ingredientName: 'ingredient_name',
      stockQuantity: 'stock_quantity',
    };
    const allowedFields = ['ingredient_name', 'stock_quantity', 'unit', 'status'];

    Object.entries(req.body || {}).forEach(([rawField, value]) => {
      const field = fieldAliases[rawField] || rawField;
      if (allowedFields.includes(field)) {
        updates[field] = field === 'stock_quantity' ? Math.max(0, Number(value) || 0) : value;
      }
    });

    if ('stock_quantity' in updates && !('status' in updates)) {
      updates.status = getInventoryStatus(updates.stock_quantity);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('inventory')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    res.json(mapInventoryItem(data));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      throw error;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/report', (req, res) => {
  const { products } = req.body;

  if (!products || products.length === 0) {
    return res.json({
      status: 'no_data',
      message: 'No products found. Add products through the Admin panel.',
      suggestions: [],
    });
  }

  const lowStock = products.filter((product) => product.stock < 10 && product.stock > 0);
  const outOfStock = products.filter((product) => product.stock === 0);
  const wellStocked = products.filter((product) => product.stock >= 10);

  const status = outOfStock.length > 0 ? 'warning' : lowStock.length > 0 ? 'caution' : 'good';

  const message =
    outOfStock.length > 0
      ? `${outOfStock.length} item(s) are sold out and losing potential revenue.`
      : lowStock.length > 0
        ? `${lowStock.length} item(s) are running low. Consider restocking soon.`
        : 'All stock levels are healthy and optimized for current demand.';

  const suggestions = [
    ...outOfStock.map((product) => `Restock "${product.name}" immediately because it is sold out.`),
    ...lowStock.map((product) => `Top up "${product.name}" soon because only ${product.stock} item(s) remain.`),
    ...wellStocked.slice(0, 1).map((product) => `"${product.name}" is well-stocked and could be featured in promotions.`),
  ];

  res.json({
    status,
    message,
    summary: {
      total: products.length,
      outOfStock: outOfStock.length,
      lowStock: lowStock.length,
      wellStocked: wellStocked.length,
    },
    suggestions,
  });
});

router.get('/health', (req, res) => {
  res.json({
    status: 'ready',
    message: 'Inventory route is active. CRUD is powered by Supabase and /report remains available for AI analysis.',
  });
});

export default router;

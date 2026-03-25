import express from 'express';
import { getSupabaseAdmin, getSupabaseAnon, hasSupabaseAdminConfig } from '../lib/supabaseAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

const getAvailabilityForStock = (stockQuantity, explicitAvailability) => {
  if (explicitAvailability === 'hidden') return 'hidden';
  return stockQuantity <= 0 ? 'out of stock' : (explicitAvailability || 'available');
};

const mapProduct = (row) => ({
  id: row.id,
  productName: row.product_name,
  description: row.description,
  price: Number(row.price) || 0,
  category: row.category,
  stockQuantity: Number(row.stock_quantity) || 0,
  availability: row.availability,
  imageUrl: row.image_url,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getProductsClient = () => (
  hasSupabaseAdminConfig()
    ? getSupabaseAdmin()
    : getSupabaseAnon()
);

router.get('/', async (req, res, next) => {
  try {
    const supabase = getProductsClient();
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json((data || []).map(mapProduct));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const supabase = getProductsClient();
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json(mapProduct(data));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const {
      product_name,
      productName,
      description,
      price,
      category,
      stock_quantity,
      stockQuantity,
      availability,
      image_url,
      imageUrl,
    } = req.body;

    const resolvedProductName = product_name || productName;
    const resolvedImageUrl = image_url || imageUrl;
    const resolvedStockQuantity = stock_quantity ?? stockQuantity ?? 0;

    if (!resolvedProductName || !category) {
      return res.status(400).json({ error: 'product_name and category are required.' });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('products')
      .insert({
        product_name: resolvedProductName,
        description: description || null,
        price: Number(price) || 0,
        category,
        stock_quantity: Math.max(0, Number(resolvedStockQuantity) || 0),
        availability: getAvailabilityForStock(Math.max(0, Number(resolvedStockQuantity) || 0), availability),
        image_url: resolvedImageUrl || null,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(mapProduct(data));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const updates = {};
    const fieldAliases = {
      productName: 'product_name',
      stockQuantity: 'stock_quantity',
      imageUrl: 'image_url',
    };
    const allowedFields = ['product_name', 'description', 'price', 'category', 'stock_quantity', 'availability', 'image_url'];

    Object.entries(req.body || {}).forEach(([rawField, value]) => {
      const field = fieldAliases[rawField] || rawField;
      if (allowedFields.includes(field)) {
        if (field === 'price' || field === 'stock_quantity') {
          updates[field] = Math.max(0, Number(value) || 0);
        } else {
          updates[field] = value;
        }
      }
    });

    if ('stock_quantity' in updates && !('availability' in updates)) {
      updates.availability = getAvailabilityForStock(updates.stock_quantity);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json(mapProduct(data));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('products')
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

export default router;

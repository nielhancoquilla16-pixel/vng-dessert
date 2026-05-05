import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import {
  mapInventoryItem,
  sanitizeInventoryPayload,
  sortInventoryItems,
} from '../lib/inventoryUtils.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

const normalizeText = (value = '') => String(value ?? '').trim();

const normalizeNameKey = (value = '') => normalizeText(value).toLowerCase();

const isIngredientBatchId = (value = '') => {
  const normalizedValue = normalizeText(value).toUpperCase();
  return normalizedValue.startsWith('ING-');
};

const getAvailabilityForStock = (stockQuantity, explicitAvailability) => {
  if (explicitAvailability === 'hidden') {
    return 'hidden';
  }

  return stockQuantity <= 0 ? 'out of stock' : (explicitAvailability || 'available');
};

const findLinkedProduct = async (supabase, { productId, productName, batchId } = {}) => {
  if (productId) {
    const { data, error } = await supabase
      .from('products')
      .select('id, product_name, availability, image_url, category')
      .eq('id', productId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  const normalizedName = normalizeNameKey(productName);
  if (!normalizedName || isIngredientBatchId(batchId)) {
    return null;
  }

  const { data, error } = await supabase
    .from('products')
    .select('id, product_name, availability, image_url, category')
    .ilike('product_name', normalizeText(productName));

  if (error) {
    throw error;
  }

  return (data || []).find((product) => normalizeNameKey(product.product_name) === normalizedName) || null;
};

const getInventoryTotalForProduct = async (supabase, product) => {
  const { data: linkedInventory, error: linkedInventoryError } = await supabase
    .from('inventory')
    .select('stock_quantity')
    .eq('product_id', product.id);

  if (linkedInventoryError) {
    throw linkedInventoryError;
  }

  const linkedTotal = (linkedInventory || [])
    .reduce((sum, item) => sum + Math.max(0, Number(item.stock_quantity) || 0), 0);

  const normalizedProductName = normalizeNameKey(product.product_name);
  if (!normalizedProductName) {
    return linkedTotal;
  }

  const { data: unlinkedInventory, error: unlinkedInventoryError } = await supabase
    .from('inventory')
    .select('stock_quantity, product_id, product_name')
    .ilike('product_name', product.product_name);

  if (unlinkedInventoryError) {
    throw unlinkedInventoryError;
  }

  const unlinkedTotal = (unlinkedInventory || [])
    .filter((item) => !item.product_id && normalizeNameKey(item.product_name) === normalizedProductName)
    .reduce((sum, item) => sum + Math.max(0, Number(item.stock_quantity) || 0), 0);

  return linkedTotal + unlinkedTotal;
};

const syncLinkedProductStock = async (supabase, productRef) => {
  const linkedProduct = productRef?.id && productRef?.product_name
    ? productRef
    : await findLinkedProduct(supabase, productRef);
  if (!linkedProduct?.id) {
    return null;
  }

  const nextStockQuantity = await getInventoryTotalForProduct(supabase, linkedProduct);
  const { data, error } = await supabase
    .from('products')
    .update({
      stock_quantity: nextStockQuantity,
      availability: getAvailabilityForStock(nextStockQuantity, linkedProduct.availability),
    })
    .eq('id', linkedProduct.id)
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const syncAffectedProducts = async (supabase, productRefs = []) => {
  const syncedProductIds = new Set();

  for (const productRef of productRefs) {
    const linkedProduct = await findLinkedProduct(supabase, productRef);
    if (!linkedProduct?.id || syncedProductIds.has(linkedProduct.id)) {
      continue;
    }

    syncedProductIds.add(linkedProduct.id);
    await syncLinkedProductStock(supabase, linkedProduct);
  }
};

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

    const mappedItems = (data || []).map((row) => mapInventoryItem(row));
    res.json(sortInventoryItems(mappedItems));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const payload = sanitizeInventoryPayload(req.body);

    if (!payload.productName || !payload.batchId) {
      return res.status(400).json({ error: 'product_name and batch_id are required.' });
    }

    const supabase = getSupabaseAdmin();
    const linkedProduct = await findLinkedProduct(supabase, {
      productId: payload.productId,
      productName: payload.productName,
      batchId: payload.batchId,
    });
    const resolvedProductName = linkedProduct?.product_name || payload.productName;
    const { data, error } = await supabase
      .from('inventory')
      .insert({
        ingredient_name: resolvedProductName,
        product_name: resolvedProductName,
        batch_id: payload.batchId,
        stock_quantity: payload.quantity,
        unit: payload.unit,
        date_created: payload.dateCreated || null,
        expiration_date: payload.expirationDate || null,
        product_id: linkedProduct?.id || payload.productId || null,
        status: payload.status,
        image_url: linkedProduct?.image_url || null,
        category: linkedProduct?.category || null,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    await syncAffectedProducts(supabase, [{
      productId: linkedProduct?.id || payload.productId || null,
      productName: resolvedProductName,
      batchId: payload.batchId,
    }]);

    res.status(201).json(mapInventoryItem(data));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: existingItem, error: existingError } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (!existingItem) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    const payload = sanitizeInventoryPayload(req.body, existingItem);

    if (!payload.productName || !payload.batchId) {
      return res.status(400).json({ error: 'product_name and batch_id are required.' });
    }

    const linkedProduct = await findLinkedProduct(supabase, {
      productId: payload.productId,
      productName: payload.productName,
      batchId: payload.batchId,
    });
    const resolvedProductName = linkedProduct?.product_name || payload.productName;
    const { data, error } = await supabase
      .from('inventory')
      .update({
        ingredient_name: resolvedProductName,
        product_name: resolvedProductName,
        batch_id: payload.batchId,
        stock_quantity: payload.quantity,
        unit: payload.unit,
        date_created: payload.dateCreated || null,
        expiration_date: payload.expirationDate || null,
        product_id: linkedProduct?.id || payload.productId || null,
        status: payload.status,
        image_url: linkedProduct?.image_url ?? existingItem.image_url ?? null,
        category: linkedProduct?.category ?? existingItem.category ?? null,
      })
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    await syncAffectedProducts(supabase, [
      {
        productId: existingItem.product_id,
        productName: existingItem.product_name,
        batchId: existingItem.batch_id,
      },
      {
        productId: linkedProduct?.id || payload.productId || null,
        productName: resolvedProductName,
        batchId: payload.batchId,
      },
    ]);

    res.json(mapInventoryItem(data));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: existingItem, error: existingError } = await supabase
      .from('inventory')
      .select('id, product_id, product_name, batch_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (!existingItem) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      throw error;
    }

    await syncAffectedProducts(supabase, [{
      productId: existingItem.product_id,
      productName: existingItem.product_name,
      batchId: existingItem.batch_id,
    }]);

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

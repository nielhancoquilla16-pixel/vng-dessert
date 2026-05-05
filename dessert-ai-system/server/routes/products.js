import express from 'express';
import { getSupabaseAdmin, getSupabaseAnon, hasSupabaseAdminConfig } from '../lib/supabaseAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { sanitizeInventoryPayload } from '../lib/inventoryUtils.js';

const router = express.Router();

const normalizeText = (value = '') => String(value ?? '').trim();

const normalizeNameKey = (value = '') => normalizeText(value).toLowerCase();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value = '') => UUID_PATTERN.test(normalizeText(value));

const isIngredientBatchId = (value = '') => {
  const normalizedValue = normalizeText(value).toUpperCase();
  return normalizedValue.startsWith('ING-');
};

const normalizeDateString = (value) => {
  if (!value) {
    return '';
  }

  const text = String(value).trim();
  const directMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) {
    return directMatch[1];
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
};

const getTodayDateKey = () => new Date().toISOString().slice(0, 10);

const getDefaultExpiryDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30); // 30 days from now
  return date.toISOString().slice(0, 10);
};

const isPastDate = (value) => {
  const normalizedDate = normalizeDateString(value);
  if (!normalizedDate) {
    return false;
  }

  return normalizedDate < getTodayDateKey();
};

const buildProductInventoryBatchId = (productId) => {
  const compactId = String(productId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return compactId ? `TRAY-${compactId}` : `TRAY-${Date.now()}`;
};

const syncProductInventoryBatch = async (supabase, {
  productId,
  productName,
  stockQuantity,
  dateCreated,
  expirationDate,
  imageUrl,
  category,
}) => {
  const canonicalBatchId = buildProductInventoryBatchId(productId);

  const { data: linkedInventoryRows, error: linkedInventoryError } = await supabase
    .from('inventory')
    .select('id, batch_id, product_id, product_name, date_created, expiration_date, unit')
    .eq('product_id', productId);

  if (linkedInventoryError) {
    throw linkedInventoryError;
  }

  const { data: namedInventoryRows, error: namedInventoryError } = await supabase
    .from('inventory')
    .select('id, batch_id, product_id, product_name, date_created, expiration_date, unit')
    .ilike('product_name', normalizeText(productName));

  if (namedInventoryError) {
    throw namedInventoryError;
  }

  const normalizedProductName = normalizeNameKey(productName);
  const candidateRows = [...(linkedInventoryRows || []), ...(namedInventoryRows || [])];
  const matchingRows = Array.from(
    new Map(candidateRows.map((row) => [row.id, row])).values(),
  ).filter((row) => (
    String(row.product_id || '') === String(productId)
      || (
        !isIngredientBatchId(row.batch_id)
        && normalizeNameKey(row.product_name) === normalizedProductName
      )
  ));

  const primaryInventoryRow = matchingRows.find((row) => row.batch_id === canonicalBatchId)
    || matchingRows[0]
    || null;

  const normalizedInventory = sanitizeInventoryPayload({
    product_name: productName,
    batch_id: canonicalBatchId,
    stock_quantity: stockQuantity,
    unit: primaryInventoryRow?.unit || 'pcs',
    date_created: normalizeDateString(dateCreated) || primaryInventoryRow?.date_created || null,
    expiration_date: normalizeDateString(expirationDate) || primaryInventoryRow?.expiration_date || null,
  });

  const inventoryRow = {
    product_id: productId,
    ingredient_name: normalizedInventory.productName,
    product_name: normalizedInventory.productName,
    batch_id: normalizedInventory.batchId,
    stock_quantity: normalizedInventory.quantity,
    unit: normalizedInventory.unit,
    date_created: normalizedInventory.dateCreated || null,
    expiration_date: normalizedInventory.expirationDate || null,
    status: normalizedInventory.status,
    image_url: imageUrl || null,
    category: category || null,
  };

  if (primaryInventoryRow?.id) {
    const { error: updateInventoryError } = await supabase
      .from('inventory')
      .update(inventoryRow)
      .eq('id', primaryInventoryRow.id);

    if (updateInventoryError) {
      throw updateInventoryError;
    }
  } else {
    const { error: insertInventoryError } = await supabase
      .from('inventory')
      .insert(inventoryRow);

    if (insertInventoryError) {
      throw insertInventoryError;
    }
  }

  const redundantInventoryIds = matchingRows
    .filter((row) => row.id !== primaryInventoryRow?.id)
    .map((row) => row.id);

  if (redundantInventoryIds.length > 0) {
    const { error: deleteInventoryError } = await supabase
      .from('inventory')
      .delete()
      .in('id', redundantInventoryIds);

    if (deleteInventoryError) {
      throw deleteInventoryError;
    }
  }
};

const deleteProductInventoryBatch = async (supabase, productId) => {
  const { error } = await supabase
    .from('inventory')
    .delete()
    .eq('product_id', productId);

  if (error) {
    throw error;
  }
};

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
  dateCreated: row.date_created,
  expirationDate: row.expiration_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapProductRecipeItem = (row) => ({
  id: row.id,
  ingredientName: row.ingredient_name,
  quantity: Number(row.quantity) || 0,
  unit: row.unit || 'pcs',
  sortOrder: Number(row.sort_order) || 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalizeRecipeProductKey = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const FALLBACK_PRODUCT_RECIPES = [
  {
    productKey: 'lecheflan',
    outputUnit: 'pcs',
    outputLabel: 'pcs (round mold)',
    accent: '#f59e0b',
    ingredients: [
      ['Egg', 6, 'pcs'],
      ['Condensed Milk (390g)', 0.3333, 'cans'],
      ['Evaporated Milk (370ml)', 0.3333, 'cans'],
      ['All-Purpose Cream (250ml)', 0.25, 'packs'],
      ['Sugar', 2, 'tbsp'],
      ['Vanilla Extract', 0.125, 'tsp'],
    ],
  },
  {
    productKey: 'ubehalayaflan',
    outputUnit: 'pcs',
    outputLabel: 'pcs (round mold)',
    accent: '#8b5cf6',
    ingredients: [
      ['Egg', 6, 'pcs'],
      ['Condensed Milk (390g)', 0.3333, 'cans'],
      ['Evaporated Milk (370ml)', 0.3333, 'cans'],
      ['All-Purpose Cream (250ml)', 0.25, 'packs'],
      ['Ube Halaya', 0.5, 'cups'],
      ['Sugar', 2, 'tbsp'],
      ['Vanilla Extract', 0.125, 'tsp'],
    ],
  },
  {
    productKey: 'crinkles',
    productAliases: ['cringkles'],
    outputUnit: 'pcs',
    outputLabel: 'pcs',
    accent: '#6b4f3b',
    ingredients: [
      ['All-Purpose Flour', 0.18, 'cups'],
      ['Cocoa Powder', 0.08, 'cups'],
      ['Sugar', 0.08, 'cups'],
      ['Butter', 0.04, 'cups'],
      ['Egg', 0.12, 'pcs'],
      ['Vanilla Extract', 0.03, 'tsp'],
    ],
  },
  {
    productKey: 'doublechocoinverse',
    outputUnit: 'pcs',
    outputLabel: 'pcs (8x3 pan)',
    accent: '#7c2d12',
    ingredients: [
      ['All-Purpose Flour', 0.22, 'cups'],
      ['Cocoa Powder', 0.09, 'cups'],
      ['Chocolate Chips', 0.08, 'cups'],
      ['Butter', 0.05, 'cups'],
      ['Milk', 0.05, 'cups'],
      ['Egg', 0.15, 'pcs'],
    ],
  },
  {
    productKey: 'cheesyensaymada',
    outputUnit: 'pcs',
    outputLabel: 'pcs',
    accent: '#facc15',
    ingredients: [
      ['All-Purpose Flour', 0.2, 'cups'],
      ['Milk', 0.08, 'cups'],
      ['Butter', 0.04, 'cups'],
      ['Sugar', 0.04, 'cups'],
      ['Condensed Milk (390g)', 0.05, 'cans'],
      ['Vanilla Extract', 0.02, 'tsp'],
    ],
  },
  {
    productKey: 'mangograhamfloat',
    outputUnit: 'pcs',
    outputLabel: 'pcs (small tub)',
    accent: '#fb923c',
    ingredients: [
      ['Crushed Graham', 0.18, 'cups'],
      ['All-Purpose Cream (250ml)', 0.18, 'packs'],
      ['Condensed Milk (390g)', 0.08, 'cans'],
      ['Milk', 0.04, 'cups'],
      ['Sugar', 0.01, 'cups'],
    ],
  },
  {
    productKey: 'cookiesandcreamiceboxcake',
    outputUnit: 'pcs',
    outputLabel: 'pcs (small tub)',
    accent: '#64748b',
    ingredients: [
      ['Crushed Graham', 0.16, 'cups'],
      ['All-Purpose Cream (250ml)', 0.2, 'packs'],
      ['Condensed Milk (390g)', 0.08, 'cans'],
      ['Chocolate Chips', 0.08, 'cups'],
      ['Milk', 0.05, 'cups'],
    ],
  },
];

const isMissingRecipeTableError = (error) => (
  /product_recipes|product_recipe_items/i.test(error?.message || '')
  && /does not exist|could not find|schema cache/i.test(error?.message || '')
);

const buildFallbackProductRecipes = async (supabase) => {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, product_name, image_url');

  if (error) {
    throw error;
  }

  const normalizedProducts = (products || []).map((product) => ({
    ...product,
    matchKey: normalizeRecipeProductKey(product.product_name),
  }));

  return FALLBACK_PRODUCT_RECIPES
    .map((recipe) => {
      const recipeKeys = [recipe.productKey, ...(recipe.productAliases || [])]
        .map(normalizeRecipeProductKey)
        .filter(Boolean);
      const product = normalizedProducts.find((candidate) => (
        recipeKeys.some((recipeKey) => (
          candidate.matchKey === recipeKey
          || candidate.matchKey.includes(recipeKey)
          || recipeKey.includes(candidate.matchKey)
        ))
      ));

      if (!product) {
        return null;
      }

      return {
        id: `fallback-${recipe.productKey}`,
        productId: product.id,
        productName: product.product_name || '',
        imageUrl: product.image_url || '',
        unit: recipe.outputUnit,
        outputLabel: recipe.outputLabel,
        accent: recipe.accent,
        createdAt: '',
        updatedAt: '',
        ingredients: recipe.ingredients.map(([ingredientName, quantity, unit], sortOrder) => ({
          id: `fallback-${recipe.productKey}-${sortOrder}`,
          ingredientName,
          quantity,
          unit,
          sortOrder,
          createdAt: '',
          updatedAt: '',
        })),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.productName.localeCompare(right.productName));
};

const mergeRecipesWithFallback = async (supabase, recipes = []) => {
  const fallbackRecipes = await buildFallbackProductRecipes(supabase);
  const completeRecipes = recipes.filter((recipe) => (
    recipe.productId
    && recipe.productName
    && Array.isArray(recipe.ingredients)
    && recipe.ingredients.length > 0
  ));
  const completeRecipeProductIds = new Set(completeRecipes.map((recipe) => String(recipe.productId)));
  const missingFallbackRecipes = fallbackRecipes.filter((recipe) => (
    !completeRecipeProductIds.has(String(recipe.productId))
  ));

  return [...completeRecipes, ...missingFallbackRecipes]
    .sort((left, right) => left.productName.localeCompare(right.productName));
};

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

router.get('/recipes', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: recipes, error: recipesError } = await supabase
      .from('product_recipes')
      .select(`
        id,
        product_id,
        output_unit,
        output_label,
        accent,
        created_at,
        updated_at,
        products (
          id,
          product_name,
          image_url
        )
      `);

    if (recipesError) {
      if (isMissingRecipeTableError(recipesError)) {
        return res.json(await buildFallbackProductRecipes(supabase));
      }

      throw recipesError;
    }

    const { data: recipeItems, error: recipeItemsError } = await supabase
      .from('product_recipe_items')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (recipeItemsError) {
      if (isMissingRecipeTableError(recipeItemsError)) {
        return res.json(await buildFallbackProductRecipes(supabase));
      }

      throw recipeItemsError;
    }

    const itemsByRecipeId = (recipeItems || []).reduce((map, item) => {
      const recipeId = String(item.recipe_id || '');
      if (!map.has(recipeId)) {
        map.set(recipeId, []);
      }

      map.get(recipeId).push(mapProductRecipeItem(item));
      return map;
    }, new Map());

    const mappedRecipes = (recipes || [])
      .map((recipe) => ({
        id: recipe.id,
        productId: recipe.product_id,
        productName: recipe.products?.product_name || '',
        imageUrl: recipe.products?.image_url || '',
        unit: recipe.output_unit || 'pcs',
        outputLabel: recipe.output_label || recipe.output_unit || 'pcs',
        accent: recipe.accent || '#f97316',
        createdAt: recipe.created_at,
        updatedAt: recipe.updated_at,
        ingredients: itemsByRecipeId.get(String(recipe.id)) || [],
      }))
      .filter((recipe) => recipe.productId && recipe.productName)
      .sort((left, right) => left.productName.localeCompare(right.productName));

    res.json(await mergeRecipesWithFallback(supabase, mappedRecipes));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: 'Product not found.' });
    }

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
      date_created,
      dateCreated,
      expiration_date,
      expirationDate,
    } = req.body;

    const resolvedProductName = product_name || productName;
    const resolvedImageUrl = image_url || imageUrl;
    const resolvedStockQuantity = stock_quantity ?? stockQuantity ?? 0;
    const resolvedDateCreated = normalizeDateString(date_created || dateCreated) || getTodayDateKey();
    const resolvedExpirationDate = normalizeDateString(expiration_date || expirationDate) || getDefaultExpiryDate();

    if (!resolvedProductName || !category) {
      return res.status(400).json({ error: 'product_name and category are required.' });
    }

    if (resolvedExpirationDate < resolvedDateCreated) {
      return res.status(400).json({ error: 'Expiration date must be on or after the product creation date.' });
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
        date_created: resolvedDateCreated,
        expiration_date: resolvedExpirationDate,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    try {
      await syncProductInventoryBatch(supabase, {
        productId: data.id,
        productName: resolvedProductName,
        stockQuantity: Math.max(0, Number(resolvedStockQuantity) || 0),
        dateCreated: resolvedDateCreated,
        expirationDate: resolvedExpirationDate,
        imageUrl: resolvedImageUrl,
        category: category,
      });
    } catch (inventoryError) {
      await supabase
        .from('products')
        .delete()
        .eq('id', data.id);
      throw inventoryError;
    }

    res.status(201).json(mapProduct(data));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }

    const updates = {};
    const fieldAliases = {
      productName: 'product_name',
      stockQuantity: 'stock_quantity',
      imageUrl: 'image_url',
      dateCreated: 'date_created',
      expirationDate: 'expiration_date',
    };
    const allowedFields = ['product_name', 'description', 'price', 'category', 'stock_quantity', 'availability', 'image_url', 'date_created', 'expiration_date'];

    Object.entries(req.body || {}).forEach(([rawField, value]) => {
      const field = fieldAliases[rawField] || rawField;
      if (allowedFields.includes(field)) {
        if (field === 'price' || field === 'stock_quantity') {
          updates[field] = Math.max(0, Number(value) || 0);
        } else if (field === 'date_created' || field === 'expiration_date') {
          updates[field] = normalizeDateString(value) || null;
        } else {
          updates[field] = value;
        }
      }
    });

    if ('stock_quantity' in updates && !('availability' in updates)) {
      updates.availability = getAvailabilityForStock(updates.stock_quantity);
    }

    const supabase = getSupabaseAdmin();
    const { data: existingProduct, error: existingProductError } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (existingProductError) {
      throw existingProductError;
    }

    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const hasDateCreatedInput = Object.prototype.hasOwnProperty.call(req.body || {}, 'date_created')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'dateCreated');
    const hasExpirationDateInput = Object.prototype.hasOwnProperty.call(req.body || {}, 'expiration_date')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'expirationDate');

    const resolvedDateCreated = hasDateCreatedInput
      ? normalizeDateString(req.body?.date_created ?? req.body?.dateCreated) || null
      : normalizeDateString(existingProduct.date_created || existingProduct.created_at) || getTodayDateKey();
    const resolvedExpirationDate = hasExpirationDateInput
      ? normalizeDateString(req.body?.expiration_date ?? req.body?.expirationDate) || null
      : normalizeDateString(existingProduct.expiration_date) || null;

    if (resolvedExpirationDate && resolvedDateCreated && resolvedExpirationDate < resolvedDateCreated) {
      return res.status(400).json({ error: 'Expiration date must be on or after the product creation date.' });
    }

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

    await syncProductInventoryBatch(supabase, {
      productId: data.id,
      productName: data.product_name,
      stockQuantity: data.stock_quantity,
      dateCreated: resolvedDateCreated,
      expirationDate: resolvedExpirationDate,
      imageUrl: data.image_url,
      category: data.category,
    });

    res.json(mapProduct(data));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: existingProduct, error: existingProductError } = await supabase
      .from('products')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (existingProductError) {
      throw existingProductError;
    }

    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await deleteProductInventoryBatch(supabase, req.params.id);

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

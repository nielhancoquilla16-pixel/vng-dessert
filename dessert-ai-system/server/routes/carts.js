import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

const selectCartQuery = `
  id,
  user_id,
  created_at,
  cart_items (
    id,
    product_id,
    quantity,
    products (
      id,
      product_name,
      description,
      price,
      category,
      availability,
      image_url
    )
  )
`;

const mapCart = (row) => ({
  id: row.id,
  userId: row.user_id,
  createdAt: row.created_at,
  items: (row.cart_items || []).map((item) => ({
    cartItemId: item.id,
    id: item.product_id,
    productId: item.product_id,
    quantity: item.quantity,
    product: item.products
      ? {
          id: item.products.id,
          productName: item.products.product_name,
          description: item.products.description,
          price: Number(item.products.price) || 0,
          category: item.products.category,
          availability: item.products.availability,
          imageUrl: item.products.image_url,
        }
      : null,
  })),
});

const getOrCreateCart = async (supabase, userId) => {
  const { data: existingCart, error: existingError } = await supabase
    .from('carts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingCart) {
    return existingCart;
  }

  const { data: createdCart, error: createError } = await supabase
    .from('carts')
    .insert({ user_id: userId })
    .select('*')
    .single();

  if (createError) {
    throw createError;
  }

  return createdCart;
};

const getOwnedCartItem = async (supabase, itemId, userId) => {
  const { data, error } = await supabase
    .from('cart_items')
    .select(`
      id,
      cart_id,
      product_id,
      quantity,
      carts!inner (
        id,
        user_id
      )
    `)
    .eq('id', itemId)
    .eq('carts.user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    await getOrCreateCart(supabase, req.authUser.id);

    const { data, error } = await supabase
      .from('carts')
      .select(selectCartQuery)
      .eq('user_id', req.authUser.id)
      .single();

    if (error) {
      throw error;
    }

    res.json(mapCart(data));
  } catch (error) {
    next(error);
  }
});

router.post('/mine/items', requireAuth, async (req, res, next) => {
  try {
    const { product_id, quantity } = req.body;
    if (!product_id || !quantity) {
      return res.status(400).json({ error: 'product_id and quantity are required.' });
    }

    const supabase = getSupabaseAdmin();
    const cart = await getOrCreateCart(supabase, req.authUser.id);

    const { data: existingItem, error: existingItemError } = await supabase
      .from('cart_items')
      .select('*')
      .eq('cart_id', cart.id)
      .eq('product_id', product_id)
      .maybeSingle();

    if (existingItemError) {
      throw existingItemError;
    }

    const nextQuantity = Math.max(1, Number(quantity) || 1) + (existingItem?.quantity || 0);

    const { data, error } = await supabase
      .from('cart_items')
      .upsert({
        cart_id: cart.id,
        product_id,
        quantity: nextQuantity,
      }, { onConflict: 'cart_id,product_id' })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

router.patch('/mine/items/:itemId', requireAuth, async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (!quantity) {
      return res.status(400).json({ error: 'quantity is required.' });
    }

    const supabase = getSupabaseAdmin();
    const ownedItem = await getOwnedCartItem(supabase, req.params.itemId, req.authUser.id);

    if (!ownedItem) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity: Math.max(1, Number(quantity) || 1) })
      .eq('id', req.params.itemId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/mine/items/:itemId', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const ownedItem = await getOwnedCartItem(supabase, req.params.itemId, req.authUser.id);

    if (!ownedItem) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', req.params.itemId);

    if (error) {
      throw error;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;

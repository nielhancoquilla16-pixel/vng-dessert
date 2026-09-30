/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';
import { useProducts } from './ProductContext';
import { resolveAssetUrl } from '../lib/publicUrl';

const CartContext = createContext();
const GUEST_CART_KEY = 'vng_guest_cart';
const GUEST_CART_MERGE_KEY_PREFIX = 'vng_guest_cart_merge:';

const normalizeCartItem = (item) => {
  const product = item.product || item;
  const stock = Math.max(0, Number(product.stock ?? product.stockQuantity) || 0);

  return {
    cartItemId: item.cartItemId || item.cart_item_id || '',
    id: product.id || item.productId || item.product_id,
    productId: product.id || item.productId || item.product_id,
    name: product.name || product.productName || '',
    description: product.description || '',
    price: Number(product.price) || 0,
    category: product.category || 'Uncategorized',
    stock,
    stockQuantity: stock,
    image: resolveAssetUrl(product.image || product.imageUrl, 'logo.png'),
    imageUrl: resolveAssetUrl(product.imageUrl || product.image, 'logo.png'),
    availability: product.availability || 'available',
    quantity: Math.max(1, Number(item.quantity) || 1),
  };
};

const readGuestCart = () => {
  try {
    const saved = localStorage.getItem(GUEST_CART_KEY);
    return saved
      ? JSON.parse(saved).map((item) => ({ ...normalizeCartItem(item), cartItemId: '' }))
      : [];
  } catch {
    return [];
  }
};

const getGuestCartMergeKey = (userId) => `${GUEST_CART_MERGE_KEY_PREFIX}${userId}`;

const readGuestCartMerge = (userId) => {
  try {
    const saved = localStorage.getItem(getGuestCartMergeKey(userId));
    const items = saved ? JSON.parse(saved).items : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
};

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const { session, loggedInCustomer, isAuthLoading } = useAuth();
  const { products } = useProducts();
  const [cartItems, setCartItems] = useState(() => readGuestCart());
  const cartItemsRef = useRef(cartItems);
  const mergeAttemptedForUserRef = useRef('');
  const mergeInFlightForUserRef = useRef('');
  const currentCartOwnerRef = useRef('');
  const remoteCartReadyRef = useRef(Promise.resolve());
  const remoteItemIdsRef = useRef(new Map());
  const remoteItemQuantitiesRef = useRef(new Map());
  const remoteSyncQueueRef = useRef(Promise.resolve());
  const localCartMutationVersionRef = useRef(0);
  const pendingRemoteSyncsRef = useRef(0);

  const isRemoteCart = Boolean(session?.access_token && loggedInCustomer);
  currentCartOwnerRef.current = isRemoteCart ? loggedInCustomer.id : '';

  const persistGuestCart = useCallback((nextItems) => {
    const guestItems = nextItems.map((item) => ({ ...item, cartItemId: '' }));
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(guestItems));
  }, []);

  const rememberRemoteItemIds = useCallback((items) => {
    items.forEach((item) => {
      if (item?.id) {
        const productId = String(item.id);
        if (item.cartItemId) {
          remoteItemIdsRef.current.set(productId, item.cartItemId);
        }
        remoteItemQuantitiesRef.current.set(productId, item.quantity);
      }
    });
  }, []);

  const replaceRemoteItemIds = useCallback((items) => {
    remoteItemIdsRef.current = new Map();
    remoteItemQuantitiesRef.current = new Map();
    items.forEach((item) => {
      if (!item?.id) return;
      const productId = String(item.id);
      if (item.cartItemId) {
        remoteItemIdsRef.current.set(productId, item.cartItemId);
      }
      remoteItemQuantitiesRef.current.set(productId, item.quantity);
    });
  }, []);

  const commitCartItems = useCallback((nextItems) => {
    cartItemsRef.current = nextItems;
    if (isRemoteCart) {
      rememberRemoteItemIds(nextItems);
    }
    setCartItems(nextItems);
    return nextItems;
  }, [isRemoteCart, rememberRemoteItemIds]);

  const commitLocalCartItems = useCallback((nextItems) => {
    localCartMutationVersionRef.current += 1;
    return commitCartItems(nextItems);
  }, [commitCartItems]);

  const updateCartItems = useCallback((updater) => {
    const nextItems = updater(cartItemsRef.current);
    if (!isRemoteCart) {
      persistGuestCart(nextItems);
    }
    return commitLocalCartItems(nextItems);
  }, [commitLocalCartItems, isRemoteCart, persistGuestCart]);

  const queueRemoteCartSync = useCallback((task) => {
    remoteSyncQueueRef.current = remoteSyncQueueRef.current
      .catch(() => {})
      .then(task);

    return remoteSyncQueueRef.current;
  }, []);

  const refreshRemoteCart = useCallback(async ({ force = false } = {}) => {
    if (!session?.access_token) {
      replaceRemoteItemIds([]);
      return [];
    }

    const mutationVersionAtStart = localCartMutationVersionRef.current;
    const response = await apiRequest('/api/carts/mine', {}, {
      auth: true,
      accessToken: session.access_token,
    });

    const mappedItems = (response?.items || []).map(normalizeCartItem);
    replaceRemoteItemIds(mappedItems);

    if (
      force
      || (
        mutationVersionAtStart === localCartMutationVersionRef.current
        && pendingRemoteSyncsRef.current === 0
      )
    ) {
      commitCartItems(mappedItems);
      return mappedItems;
    }

    return cartItemsRef.current;
  }, [commitCartItems, replaceRemoteItemIds, session]);

  useEffect(() => {
    cartItemsRef.current = cartItems;
    if (isRemoteCart) {
      rememberRemoteItemIds(cartItems);
    }
  }, [cartItems, isRemoteCart, rememberRemoteItemIds]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!isRemoteCart) {
      mergeAttemptedForUserRef.current = '';
      remoteCartReadyRef.current = Promise.resolve();
      replaceRemoteItemIds([]);
      commitCartItems(readGuestCart());
      return;
    }

    const userId = String(loggedInCustomer.id);
    const accessToken = session?.access_token;
    const guestItems = readGuestCart();
    const savedMergeItems = readGuestCartMerge(userId);
    const hasPendingMerge = guestItems.length > 0 || savedMergeItems.length > 0;
    const shouldMerge = hasPendingMerge && mergeAttemptedForUserRef.current !== userId;

    // React StrictMode may run this effect twice in development. Claim the
    // merge synchronously so the same guest cart is never added twice.
    if (shouldMerge && mergeInFlightForUserRef.current === userId) {
      return;
    }
    if (shouldMerge) {
      mergeInFlightForUserRef.current = userId;
    }

    const loadAndMergeCart = async () => {
      const mutationVersionAtStart = localCartMutationVersionRef.current;
      try {
        const response = await apiRequest('/api/carts/mine', {}, {
          auth: true,
          accessToken,
        });
        const remoteItems = (response?.items || []).map(normalizeCartItem);

        if (currentCartOwnerRef.current !== userId) {
          return;
        }
        replaceRemoteItemIds(remoteItems);

        if (!shouldMerge) {
          if (
            mutationVersionAtStart === localCartMutationVersionRef.current
            && pendingRemoteSyncsRef.current === 0
          ) {
            commitCartItems(remoteItems);
          }
          return;
        }

        const targetByProduct = new Map(
          savedMergeItems
            .filter((item) => item?.productId)
            .map((item) => [String(item.productId), item])
        );

        guestItems.forEach((guestItem) => {
          const productId = String(guestItem.productId);
          if (targetByProduct.has(productId)) {
            return;
          }

          const remoteItem = remoteItems.find((item) => String(item.id) === productId);
          const stock = Math.max(0, Number(guestItem.stock) || Number(remoteItem?.stock) || 0);
          const targetQuantity = (remoteItem?.quantity || 0) + guestItem.quantity;
          targetByProduct.set(productId, {
            productId: guestItem.productId,
            quantity: stock > 0 ? Math.min(targetQuantity, stock) : targetQuantity,
          });
        });

        const targets = [...targetByProduct.values()];
        localStorage.setItem(getGuestCartMergeKey(userId), JSON.stringify({ items: targets }));

        const optimisticItems = [...remoteItems];
        targets.forEach((target) => {
          const productId = String(target.productId);
          const remoteItemIndex = optimisticItems.findIndex((item) => String(item.id) === productId);
          if (remoteItemIndex >= 0) {
            optimisticItems[remoteItemIndex] = {
              ...optimisticItems[remoteItemIndex],
              quantity: target.quantity,
            };
            return;
          }

          const guestItem = guestItems.find((item) => String(item.productId) === productId);
          if (guestItem) {
            optimisticItems.push({ ...guestItem, quantity: target.quantity, cartItemId: '' });
          }
        });

        if (mutationVersionAtStart === localCartMutationVersionRef.current) {
          commitCartItems(optimisticItems);
        }

        // The saved targets make retries safe: if a request succeeded but its
        // response was lost, a retry finds that row and sets the same quantity.
        const mergedResults = await Promise.all(targets.map(async (target) => {
          const productId = String(target.productId);
          const remoteItem = remoteItems.find((item) => String(item.id) === productId);
          const result = remoteItem?.cartItemId
            ? await apiRequest(`/api/carts/mine/items/${remoteItem.cartItemId}`, {
                method: 'PATCH',
                body: JSON.stringify({ quantity: target.quantity }),
              }, { auth: true, accessToken })
            : await apiRequest('/api/carts/mine/items', {
                method: 'POST',
                body: JSON.stringify({ product_id: target.productId, quantity: target.quantity }),
              }, { auth: true, accessToken });

          return { productId, cartItemId: result?.id || remoteItem?.cartItemId || '' };
        }));

        mergedResults.forEach(({ productId, cartItemId }) => {
          if (cartItemId) {
            remoteItemIdsRef.current.set(productId, cartItemId);
          }
        });
        targets.forEach((target) => {
          remoteItemQuantitiesRef.current.set(String(target.productId), target.quantity);
        });

        if (currentCartOwnerRef.current !== userId) {
          return;
        }

        localStorage.removeItem(GUEST_CART_KEY);
        localStorage.removeItem(getGuestCartMergeKey(userId));
        mergeAttemptedForUserRef.current = userId;

        const mergedCartItems = optimisticItems.map((item) => ({
          ...item,
          cartItemId: remoteItemIdsRef.current.get(String(item.id)) || item.cartItemId,
        }));
        if (mutationVersionAtStart === localCartMutationVersionRef.current) {
          commitCartItems(mergedCartItems);
        }

        try {
          await refreshRemoteCart();
        } catch (error) {
          console.error('Failed to refresh merged cart:', error);
        }
      } catch (error) {
        console.error('Failed to load or merge cart:', error);
      } finally {
        if (shouldMerge && mergeInFlightForUserRef.current === userId) {
          mergeInFlightForUserRef.current = '';
        }
      }
    };

    remoteCartReadyRef.current = loadAndMergeCart();
  }, [
    commitCartItems,
    isAuthLoading,
    isRemoteCart,
    loggedInCustomer,
    refreshRemoteCart,
    replaceRemoteItemIds,
    session?.access_token,
  ]);

  useEffect(() => {
    if (isRemoteCart || isAuthLoading) {
      return;
    }

    persistGuestCart(cartItems);
  }, [cartItems, isAuthLoading, isRemoteCart, persistGuestCart]);

  const syncRemoteQuantity = useCallback((productId, nextQuantity, { incrementBy = 0, maxQuantity = Infinity } = {}) => {
    pendingRemoteSyncsRef.current += 1;

    return queueRemoteCartSync(async () => {
      try {
        await remoteCartReadyRef.current;
        const normalizedProductId = String(productId);
        const targetQuantity = incrementBy > 0
          ? Math.min((remoteItemQuantitiesRef.current.get(normalizedProductId) || 0) + incrementBy, maxQuantity)
          : nextQuantity;

        if (incrementBy > 0) {
          updateCartItems((prev) => prev.map((item) => (
            String(item.id) === normalizedProductId
              ? { ...item, quantity: targetQuantity }
              : item
          )));
        }

        const remoteItemId = remoteItemIdsRef.current.get(normalizedProductId);

        if (targetQuantity < 1) {
          if (!remoteItemId) {
            remoteItemQuantitiesRef.current.delete(normalizedProductId);
            return;
          }

          try {
            await apiRequest(`/api/carts/mine/items/${remoteItemId}`, {
              method: 'DELETE',
            }, {
              auth: true,
              accessToken: session?.access_token,
            });
          } catch (error) {
            // A successful checkout already removes these rows on the server.
            // Treat an already-absent item as removed; keep other errors visible.
            if (error.status !== 404) throw error;
          }
          remoteItemIdsRef.current.delete(normalizedProductId);
          remoteItemQuantitiesRef.current.delete(normalizedProductId);
          return;
        }

        if (!remoteItemId) {
          const createdItem = await apiRequest('/api/carts/mine/items', {
            method: 'POST',
            body: JSON.stringify({
              product_id: productId,
              quantity: targetQuantity,
            }),
          }, {
            auth: true,
            accessToken: session?.access_token,
          });

          if (createdItem?.id) {
            remoteItemIdsRef.current.set(normalizedProductId, createdItem.id);
            remoteItemQuantitiesRef.current.set(normalizedProductId, Number(createdItem.quantity) || targetQuantity);
            updateCartItems((prev) => prev.map((item) => (
              String(item.id) === normalizedProductId
                ? {
                    ...item,
                    cartItemId: item.cartItemId || createdItem.id,
                    quantity: Number(createdItem.quantity) || targetQuantity,
                  }
                : item
            )));
          }
          return;
        }

        await apiRequest(`/api/carts/mine/items/${remoteItemId}`, {
          method: 'PATCH',
          body: JSON.stringify({ quantity: targetQuantity }),
        }, {
          auth: true,
          accessToken: session?.access_token,
        });
        remoteItemQuantitiesRef.current.set(normalizedProductId, targetQuantity);
      } catch (error) {
        console.error('Failed to sync cart item:', error);

        try {
          await refreshRemoteCart({ force: true });
        } catch (refreshError) {
          console.error('Failed to refresh cart after sync error:', refreshError);
        }
        throw error;
      } finally {
        pendingRemoteSyncsRef.current = Math.max(0, pendingRemoteSyncsRef.current - 1);
      }
    });
  }, [queueRemoteCartSync, refreshRemoteCart, session, updateCartItems]);

  const addToCart = useCallback(async (product, quantity = 1) => {
    const requestedQuantity = Math.max(1, Number(quantity) || 1);
    const currentProduct = products.find((item) => String(item.id) === String(product.id)) || product;
    const normalizedProduct = normalizeCartItem({ ...currentProduct, quantity: requestedQuantity });
    const maxStock = Math.max(0, Number(normalizedProduct.stock) || 0);

    if (
      normalizedProduct.availability === 'expired'
      || normalizedProduct.availability === 'hidden'
      || currentProduct?.expiryStatus === 'expired'
      || currentProduct?.isExpired
    ) {
      throw new Error('This product is no longer available to order.');
    }

    if (maxStock === 0) {
      throw new Error('This product is out of stock.');
    }

    const existingItem = cartItemsRef.current.find((item) => item.id === normalizedProduct.id);
    const nextQuantity = Math.min((existingItem?.quantity || 0) + requestedQuantity, maxStock);

    if (isRemoteCart) {
      updateCartItems((prev) => {
        const liveItem = prev.find((item) => item.id === normalizedProduct.id);
        if (liveItem) {
          return prev.map((item) => (
            item.id === normalizedProduct.id
              ? { ...item, ...normalizedProduct, quantity: nextQuantity }
              : item
          ));
        }

        return [...prev, { ...normalizedProduct, quantity: Math.min(requestedQuantity, maxStock) }];
      });
      await syncRemoteQuantity(normalizedProduct.id, nextQuantity, {
        incrementBy: requestedQuantity,
        maxQuantity: maxStock,
      });
      return;
    }

    updateCartItems((prev) => {
      const liveItem = prev.find((item) => item.id === normalizedProduct.id);
      if (liveItem) {
        return prev.map((item) => (
          item.id === normalizedProduct.id
            ? { ...item, ...normalizedProduct, quantity: nextQuantity }
            : item
        ));
      }

      return [...prev, { ...normalizedProduct, quantity: Math.min(requestedQuantity, maxStock) }];
    });
  }, [isRemoteCart, products, syncRemoteQuantity, updateCartItems]);

  const removeFromCart = useCallback(async (id) => {
    if (isRemoteCart) {
      if (
        !cartItemsRef.current.some((item) => item.id === id)
        && !remoteItemIdsRef.current.get(id)
      ) {
        return;
      }

      updateCartItems((prev) => prev.filter((item) => item.id !== id));
      await syncRemoteQuantity(id, 0);
      return;
    }

    updateCartItems((prev) => prev.filter((item) => item.id !== id));
  }, [isRemoteCart, syncRemoteQuantity, updateCartItems]);

  const updateQuantity = useCallback(async (id, quantity) => {
    if (quantity < 1) {
      return;
    }

    const liveItem = cartItemsRef.current.find((item) => item.id === id);
    if (!liveItem) return;
    const currentProduct = products.find((item) => String(item.id) === String(id)) || liveItem;
    if (quantity > liveItem.quantity) {
      if (
        currentProduct.availability === 'expired'
        || currentProduct.availability === 'hidden'
        || currentProduct.expiryStatus === 'expired'
        || currentProduct.isExpired
      ) {
        throw new Error('This product is no longer available to order.');
      }
      if (Number(currentProduct.stock) <= liveItem.quantity) {
        throw new Error('There is no more stock available for this product.');
      }
    }
    const maxStock = Math.max(1, Number(currentProduct.stock) || liveItem.quantity);
    const nextQuantity = Math.min(quantity, maxStock);

    if (isRemoteCart) {
      updateCartItems((prev) => prev.map((item) => (
        item.id === id ? { ...item, quantity: nextQuantity } : item
      )));
      await syncRemoteQuantity(id, nextQuantity);
      return;
    }

    updateCartItems((prev) => prev.map((item) => (
      item.id === id ? { ...item, quantity: nextQuantity } : item
    )));
  }, [isRemoteCart, products, syncRemoteQuantity, updateCartItems]);

  const clearCart = useCallback(async () => {
    if (isRemoteCart) {
      const productIds = cartItemsRef.current.map((item) => item.id);
      commitLocalCartItems([]);
      await Promise.all(productIds.map((productId) => syncRemoteQuantity(productId, 0)));
      return;
    }

    commitLocalCartItems([]);
  }, [commitLocalCartItems, isRemoteCart, syncRemoteQuantity]);

  useEffect(() => {
    if (!products.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      commitCartItems(cartItemsRef.current
        .map((item) => {
          const liveProduct = products.find((product) => product.id === item.id);
          if (!liveProduct) {
            return item;
          }

          const liveStock = Math.max(0, Number(liveProduct.stock) || 0);
          if (liveStock === 0 || liveProduct.availability === 'expired' || liveProduct.availability === 'hidden') {
            return null;
          }

          return {
            ...item,
            ...normalizeCartItem(liveProduct),
            cartItemId: item.cartItemId,
            quantity: Math.min(item.quantity, liveStock),
          };
        })
        .filter(Boolean));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [commitCartItems, products]);

  const cartTotal = useMemo(() => (
    cartItems.reduce((total, item) => total + (item.price * item.quantity), 0)
  ), [cartItems]);

  const cartCount = useMemo(() => (
    cartItems.reduce((count, item) => count + item.quantity, 0)
  ), [cartItems]);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartTotal,
        cartCount,
        refreshRemoteCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

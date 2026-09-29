/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';
import { useProducts } from './ProductContext';
import { useShopSettings } from './ShopSettingsContext';
import { resolveAssetUrl } from '../lib/publicUrl';
import { isWithinOperatingHours } from '../utils/shopHours';

const CartContext = createContext();
const GUEST_CART_KEY = 'vng_guest_cart';

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

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const { session, loggedInCustomer, isAuthLoading } = useAuth();
  const { products } = useProducts();
  const { refreshShopSettings, isShopOpen, isShopSettingsLoading, shopSettingsError } = useShopSettings();
  const [cartItems, setCartItems] = useState(() => readGuestCart());
  const cartItemsRef = useRef(cartItems);
  const mergeAttemptedRef = useRef(false);
  const remoteItemIdsRef = useRef(new Map());
  const remoteSyncQueueRef = useRef(Promise.resolve());
  const localCartMutationVersionRef = useRef(0);
  const pendingRemoteSyncsRef = useRef(0);

  const isRemoteCart = Boolean(session?.access_token && loggedInCustomer);

  const persistGuestCart = useCallback((nextItems) => {
    const guestItems = nextItems.map((item) => ({ ...item, cartItemId: '' }));
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(guestItems));
  }, []);

  const rememberRemoteItemIds = useCallback((items) => {
    items.forEach((item) => {
      if (item?.id && item?.cartItemId) {
        remoteItemIdsRef.current.set(item.id, item.cartItemId);
      }
    });
  }, []);

  const replaceRemoteItemIds = useCallback((items) => {
    remoteItemIdsRef.current = new Map(
      items
        .filter((item) => item?.id && item?.cartItemId)
        .map((item) => [item.id, item.cartItemId])
    );
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

  const updateCartItems = useCallback((updater) => (
    commitLocalCartItems(updater(cartItemsRef.current))
  ), [commitLocalCartItems]);

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

    let isActive = true;

    const loadCart = async () => {
      if (!isRemoteCart) {
        mergeAttemptedRef.current = false;
        replaceRemoteItemIds([]);
        const guestItems = readGuestCart();
        if (isActive) {
          commitCartItems(guestItems);
        }
        return;
      }

      try {
        if (isActive) {
          await refreshRemoteCart();
        }
      } catch (error) {
        console.error('Failed to load cart:', error);
      }
    };

    loadCart();

    return () => {
      isActive = false;
    };
  }, [commitCartItems, isAuthLoading, isRemoteCart, refreshRemoteCart, replaceRemoteItemIds]);

  useEffect(() => {
    if (isRemoteCart || isAuthLoading) {
      return;
    }

    persistGuestCart(cartItems);
  }, [cartItems, isAuthLoading, isRemoteCart, persistGuestCart]);

  useEffect(() => {
    if (!isRemoteCart || mergeAttemptedRef.current || !isShopOpen || isShopSettingsLoading || shopSettingsError) {
      return;
    }

    const guestItems = readGuestCart();
    if (guestItems.length === 0) {
      mergeAttemptedRef.current = true;
      return;
    }

    let isActive = true;

    const mergeGuestCart = async () => {
      try {
        for (const item of guestItems) {
          await apiRequest('/api/carts/mine/items', {
            method: 'POST',
            body: JSON.stringify({
              product_id: item.productId,
              quantity: item.quantity,
            }),
          }, {
            auth: true,
            accessToken: session.access_token,
          });
        }

        localStorage.removeItem(GUEST_CART_KEY);
        mergeAttemptedRef.current = true;
        if (isActive) {
          await refreshRemoteCart();
        }
      } catch (error) {
        console.error('Failed to merge guest cart:', error);
      }
    };

    mergeGuestCart();

    return () => {
      isActive = false;
    };
  }, [isRemoteCart, isShopOpen, isShopSettingsLoading, shopSettingsError, refreshRemoteCart, session]);

  const syncRemoteQuantity = useCallback((productId, nextQuantity) => {
    pendingRemoteSyncsRef.current += 1;

    return queueRemoteCartSync(async () => {
      try {
        const remoteItemId = remoteItemIdsRef.current.get(productId);

        if (nextQuantity < 1) {
          if (!remoteItemId) {
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
          remoteItemIdsRef.current.delete(productId);
          return;
        }

        if (!remoteItemId) {
          const createdItem = await apiRequest('/api/carts/mine/items', {
            method: 'POST',
            body: JSON.stringify({
              product_id: productId,
              quantity: nextQuantity,
            }),
          }, {
            auth: true,
            accessToken: session?.access_token,
          });

          if (createdItem?.id) {
            remoteItemIdsRef.current.set(productId, createdItem.id);
            updateCartItems((prev) => prev.map((item) => (
              item.id === productId
                ? {
                    ...item,
                    cartItemId: item.cartItemId || createdItem.id,
                    quantity: Math.max(item.quantity, Number(createdItem.quantity) || item.quantity),
                  }
                : item
            )));
          }
          return;
        }

        await apiRequest(`/api/carts/mine/items/${remoteItemId}`, {
          method: 'PATCH',
          body: JSON.stringify({ quantity: nextQuantity }),
        }, {
          auth: true,
          accessToken: session?.access_token,
        });
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

  const assertShopIsOpen = useCallback(async () => {
    let latestSettings;
    try {
      latestSettings = await refreshShopSettings();
    } catch {
      throw new Error('Unable to confirm shop hours. Please try again shortly.');
    }
    const referenceTime = latestSettings.serverTime ? new Date(latestSettings.serverTime) : undefined;
    if (!isWithinOperatingHours(latestSettings, referenceTime)) {
      throw new Error('The shop is closed for orders. Your existing cart is saved for later.');
    }
  }, [refreshShopSettings]);

  const addToCart = useCallback(async (product, quantity = 1) => {
    await assertShopIsOpen();
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
      await syncRemoteQuantity(normalizedProduct.id, nextQuantity);
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
  }, [assertShopIsOpen, isRemoteCart, products, syncRemoteQuantity, updateCartItems]);

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
    const isIncreasing = quantity > liveItem.quantity;
    if (isIncreasing) {
      await assertShopIsOpen();
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
  }, [assertShopIsOpen, isRemoteCart, products, syncRemoteQuantity, updateCartItems]);

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

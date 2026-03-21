import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';
import { useProducts } from './ProductContext';

const CartContext = createContext();
const GUEST_CART_KEY = 'vng_guest_cart';

const normalizeCartItem = (item) => {
  const product = item.product || item;
  const stock = Math.max(0, Number(product.stock ?? product.stockQuantity) || 0);

  return {
    cartItemId: item.cartItemId || item.id || '',
    id: product.id || item.productId || item.product_id,
    productId: product.id || item.productId || item.product_id,
    name: product.name || product.productName || '',
    description: product.description || '',
    price: Number(product.price) || 0,
    category: product.category || 'Uncategorized',
    stock,
    stockQuantity: stock,
    image: product.image || product.imageUrl || '/logo.png',
    imageUrl: product.imageUrl || product.image || '/logo.png',
    availability: product.availability || 'available',
    quantity: Math.max(1, Number(item.quantity) || 1),
  };
};

const readGuestCart = () => {
  try {
    const saved = localStorage.getItem(GUEST_CART_KEY);
    return saved ? JSON.parse(saved).map(normalizeCartItem) : [];
  } catch {
    return [];
  }
};

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const { session, loggedInCustomer, isAuthLoading } = useAuth();
  const { products } = useProducts();
  const [cartItems, setCartItems] = useState(() => readGuestCart());
  const mergeAttemptedRef = useRef(false);

  const isRemoteCart = Boolean(session?.access_token && loggedInCustomer);

  const persistGuestCart = useCallback((nextItems) => {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(nextItems));
  }, []);

  const refreshRemoteCart = useCallback(async () => {
    if (!session?.access_token) {
      return [];
    }

    const response = await apiRequest('/api/carts/mine', {}, {
      auth: true,
      accessToken: session.access_token,
    });

    const mappedItems = (response?.items || []).map(normalizeCartItem);
    setCartItems(mappedItems);
    return mappedItems;
  }, [session]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    let isActive = true;

    const loadCart = async () => {
      if (!isRemoteCart) {
        mergeAttemptedRef.current = false;
        const guestItems = readGuestCart();
        if (isActive) {
          setCartItems(guestItems);
        }
        return;
      }

      try {
        const remoteItems = await refreshRemoteCart();
        if (isActive) {
          setCartItems(remoteItems);
        }
      } catch (error) {
        console.error('Failed to load cart:', error);
      }
    };

    loadCart();

    return () => {
      isActive = false;
    };
  }, [isAuthLoading, isRemoteCart, refreshRemoteCart]);

  useEffect(() => {
    if (isRemoteCart || isAuthLoading) {
      return;
    }

    persistGuestCart(cartItems);
  }, [cartItems, isAuthLoading, isRemoteCart, persistGuestCart]);

  useEffect(() => {
    if (!isRemoteCart || mergeAttemptedRef.current) {
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
        const mergedItems = await refreshRemoteCart();
        if (isActive) {
          setCartItems(mergedItems);
        }
      } catch (error) {
        console.error('Failed to merge guest cart:', error);
      }
    };

    mergeGuestCart();

    return () => {
      isActive = false;
    };
  }, [isRemoteCart, refreshRemoteCart, session]);

  const syncRemoteQuantity = useCallback(async (productId, nextQuantity) => {
    const existingItem = cartItems.find((item) => item.id === productId);

    if (!existingItem) {
      await apiRequest('/api/carts/mine/items', {
        method: 'POST',
        body: JSON.stringify({
          product_id: productId,
          quantity: nextQuantity,
        }),
      }, {
        auth: true,
        accessToken: session?.access_token,
      });
      return refreshRemoteCart();
    }

    await apiRequest(`/api/carts/mine/items/${existingItem.cartItemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: nextQuantity }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    return refreshRemoteCart();
  }, [cartItems, refreshRemoteCart, session]);

  const addToCart = useCallback(async (product, quantity = 1) => {
    const normalizedProduct = normalizeCartItem({ ...product, quantity });
    const maxStock = Math.max(0, Number(normalizedProduct.stock) || 0);

    if (maxStock === 0) {
      return;
    }

    if (isRemoteCart) {
      const existingItem = cartItems.find((item) => item.id === normalizedProduct.id);
      const nextQuantity = Math.min((existingItem?.quantity || 0) + quantity, maxStock);
      await syncRemoteQuantity(normalizedProduct.id, nextQuantity);
      return;
    }

    setCartItems((prev) => {
      const existingItem = prev.find((item) => item.id === normalizedProduct.id);
      if (existingItem) {
        const nextQuantity = Math.min(existingItem.quantity + quantity, maxStock);
        return prev.map((item) => (
          item.id === normalizedProduct.id
            ? { ...item, ...normalizedProduct, quantity: nextQuantity }
            : item
        ));
      }

      return [...prev, { ...normalizedProduct, quantity: Math.min(quantity, maxStock) }];
    });
  }, [cartItems, isRemoteCart, syncRemoteQuantity]);

  const removeFromCart = useCallback(async (id) => {
    if (isRemoteCart) {
      const existingItem = cartItems.find((item) => item.id === id);
      if (!existingItem?.cartItemId) {
        return;
      }

      await apiRequest(`/api/carts/mine/items/${existingItem.cartItemId}`, {
        method: 'DELETE',
      }, {
        auth: true,
        accessToken: session?.access_token,
      });
      await refreshRemoteCart();
      return;
    }

    setCartItems((prev) => prev.filter((item) => item.id !== id));
  }, [cartItems, isRemoteCart, refreshRemoteCart, session]);

  const updateQuantity = useCallback(async (id, quantity) => {
    if (quantity < 1) {
      return;
    }

    const liveItem = cartItems.find((item) => item.id === id);
    const maxStock = Math.max(1, Number(liveItem?.stock) || quantity);
    const nextQuantity = Math.min(quantity, maxStock);

    if (isRemoteCart) {
      await syncRemoteQuantity(id, nextQuantity);
      return;
    }

    setCartItems((prev) => prev.map((item) => (
      item.id === id ? { ...item, quantity: nextQuantity } : item
    )));
  }, [cartItems, isRemoteCart, syncRemoteQuantity]);

  const clearCart = useCallback(async () => {
    if (isRemoteCart) {
      await Promise.all(cartItems
        .filter((item) => item.cartItemId)
        .map((item) => apiRequest(`/api/carts/mine/items/${item.cartItemId}`, {
          method: 'DELETE',
        }, {
          auth: true,
          accessToken: session?.access_token,
        })));

      await refreshRemoteCart();
      return;
    }

    setCartItems([]);
  }, [cartItems, isRemoteCart, refreshRemoteCart, session]);

  useEffect(() => {
    if (!products.length) {
      return;
    }

    setCartItems((prev) => prev
      .map((item) => {
        const liveProduct = products.find((product) => product.id === item.id);
        if (!liveProduct) {
          return item;
        }

        const liveStock = Math.max(0, Number(liveProduct.stock) || 0);
        if (liveStock === 0) {
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
  }, [products]);

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

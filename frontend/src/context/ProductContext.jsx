/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, isBackendIssueError } from '../lib/api';
import { subscribeToDatabaseChanges } from '../lib/realtime';
import { useAuth } from './AuthContext';
import { resolveAssetUrl } from '../lib/publicUrl';
import { DEFAULT_EXPIRY_WARNING_DAYS, getInventoryBatchStatus, normalizeInventoryDate } from '../utils/inventoryBatches';

const ProductContext = createContext();
const DEFAULT_IMAGE = resolveAssetUrl('logo.png');

const normalizeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getProductStatus = (stock) => {
  if (stock <= 0) return 'out';
  if (stock <= 10) return 'low';
  return 'active';
};

const mapProduct = (product) => {
  const stock = Math.max(0, normalizeNumber(product.stockQuantity ?? product.stock_quantity));

  return {
    id: product.id,
    name: product.productName || product.product_name || '',
    productName: product.productName || product.product_name || '',
    description: product.description || '',
    price: normalizeNumber(product.price),
    category: product.category || 'Uncategorized',
    stock,
    stockQuantity: stock,
    availability: product.availability || 'available',
    status: getProductStatus(stock),
    imageUrl: resolveAssetUrl(product.imageUrl || product.image_url || product.image, 'logo.png'),
    image: resolveAssetUrl(product.imageUrl || product.image_url || product.image, 'logo.png'),
    soldCount: normalizeNumber(product.soldCount),
    type: 'product',
    createdAt: product.createdAt || product.created_at || '',
    updatedAt: product.updatedAt || product.updated_at || '',
    dateCreated: normalizeInventoryDate(product.dateCreated || product.date_created),
    expirationDate: normalizeInventoryDate(product.expirationDate || product.expiration_date),
  };
};

const mapInventoryItem = (item) => {
  const quantity = Math.max(0, normalizeNumber(item.quantity ?? item.stockQuantity ?? item.stock_quantity));
  const productName = item.productName || item.product_name || item.ingredientName || item.ingredient_name || '';
  const dateCreated = normalizeInventoryDate(item.dateCreated || item.date_created || item.createdAt || item.created_at);
  const expirationDate = normalizeInventoryDate(item.expirationDate || item.expiration_date);

  return {
    id: item.id,
    name: productName,
    productName,
    ingredientName: productName,
    batchId: item.batchId || item.batch_id || `LEGACY-${String(item.id || '').replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    quantity,
    stock: quantity,
    stockQuantity: quantity,
    unit: item.unit || '',
    dateCreated,
    expirationDate,
    status: item.status || getInventoryBatchStatus({
      dateCreated,
      expirationDate,
    }, DEFAULT_EXPIRY_WARNING_DAYS),
    image: resolveAssetUrl(item.imageUrl || item.image_url || '', DEFAULT_IMAGE),
    imageUrl: resolveAssetUrl(item.imageUrl || item.image_url || '', DEFAULT_IMAGE),
    category: item.category || '',
    productId: item.productId || item.product_id || null,
    type: 'inventory-batch',
    createdAt: item.createdAt || item.created_at || '',
    updatedAt: item.updatedAt || item.updated_at || '',
  };
};

export const useProducts = () => {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  return context;
};

export const ProductProvider = ({ children }) => {
  const { session, userRole, isAuthLoading } = useAuth();
  const [products, setProducts] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [isProductsLoading, setIsProductsLoading] = useState(true);

  const refreshProducts = useCallback(async () => {
    const response = await apiRequest('/api/products');
    const mappedProducts = (response || []).map(mapProduct);
    setProducts(mappedProducts);
    return mappedProducts;
  }, []);

  const refreshInventory = useCallback(async () => {
    if (!session?.access_token || !['admin', 'staff'].includes(userRole)) {
      setInventoryItems([]);
      return [];
    }

    const response = await apiRequest('/api/inventory', {}, {
      auth: true,
      accessToken: session.access_token,
    });

    const mappedInventory = (response || []).map(mapInventoryItem);
    setInventoryItems(mappedInventory);
    return mappedInventory;
  }, [session, userRole]);

  const upsertProductInState = useCallback((productPayload) => {
    const mappedProduct = mapProduct(productPayload);

    setProducts((prev) => {
      const hasExistingProduct = prev.some((product) => (
        String(product.id) === String(mappedProduct.id)
      ));

      if (!hasExistingProduct) {
        return [mappedProduct, ...prev];
      }

      return prev.map((product) => (
        String(product.id) === String(mappedProduct.id) ? mappedProduct : product
      ));
    });

    return mappedProduct;
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadProducts = async () => {
      try {
        setIsProductsLoading(true);
        const nextProducts = await refreshProducts();
        if (!isActive) {
          return;
        }

        setProducts(nextProducts);
      } catch (error) {
        if (isBackendIssueError(error)) {
          console.warn('Products are temporarily unavailable:', error.message);
        } else {
          console.error('Failed to load products:', error);
        }
        if (isActive) {
          setProducts([]);
        }
      } finally {
        if (isActive) {
          setIsProductsLoading(false);
        }
      }
    };

    loadProducts();

    return () => {
      isActive = false;
    };
  }, [refreshProducts]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    let isActive = true;

    const loadInventory = async () => {
      try {
        const nextInventory = await refreshInventory();
        if (isActive) {
          setInventoryItems(nextInventory);
        }
      } catch (error) {
        if (isBackendIssueError(error)) {
          console.warn('Inventory is temporarily unavailable:', error.message);
        } else {
          console.error('Failed to load inventory:', error);
        }
        if (isActive) {
          setInventoryItems([]);
        }
      }
    };

    loadInventory();

    return () => {
      isActive = false;
    };
  }, [isAuthLoading, refreshInventory]);

  useEffect(() => {
    if (isAuthLoading) {
      return undefined;
    }

    return subscribeToDatabaseChanges({
      channelName: 'products-sync',
      tables: ['products'],
      onChange: refreshProducts,
    });
  }, [isAuthLoading, refreshProducts]);

  useEffect(() => {
    if (
      isAuthLoading
      || !session?.access_token
      || !['admin', 'staff'].includes(userRole)
    ) {
      return undefined;
    }

    return subscribeToDatabaseChanges({
      channelName: `inventory-sync-${userRole}`,
      tables: ['inventory'],
      onChange: refreshInventory,
    });
  }, [isAuthLoading, refreshInventory, session?.access_token, userRole]);

  const addProduct = useCallback(async (product) => {
    const createdProduct = await apiRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        product_name: product.name || product.productName,
        description: product.description || '',
        price: normalizeNumber(product.price),
        category: product.category || 'Uncategorized',
        stock_quantity: Math.max(0, normalizeNumber(product.stock)),
        availability: product.availability,
        image_url: product.image || product.imageUrl || '',
        date_created: product.dateCreated || new Date().toISOString().split('T')[0],
        expiration_date: product.expirationDate,
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const mappedProduct = upsertProductInState(createdProduct);

    // Refresh inventory to get the newly synced product batch
    await refreshInventory();

    return mappedProduct;
  }, [refreshInventory, session, upsertProductInState]);

  const editProduct = useCallback(async (updatedProduct) => {
    const savedProduct = await apiRequest(`/api/products/${updatedProduct.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        product_name: updatedProduct.name || updatedProduct.productName,
        description: updatedProduct.description || '',
        price: normalizeNumber(updatedProduct.price),
        category: updatedProduct.category || 'Uncategorized',
        stock_quantity: Math.max(0, normalizeNumber(updatedProduct.stock)),
        availability: updatedProduct.availability,
        image_url: updatedProduct.image || updatedProduct.imageUrl || '',
        date_created: updatedProduct.dateCreated,
        expiration_date: updatedProduct.expirationDate,
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const mappedProduct = upsertProductInState(savedProduct);

    // Refresh inventory to get updated dates synced from backend
    await refreshInventory();

    return mappedProduct;
  }, [refreshInventory, session, upsertProductInState]);

  const updateFinishedProductInventory = useCallback(async (productId, updates = {}) => {
    const existingProduct = products.find((product) => (
      String(product.id) === String(productId)
    ));

    if (!existingProduct) {
      throw new Error('Product not found.');
    }

    const nextStock = Math.max(0, normalizeNumber(updates.stock ?? existingProduct.stock));
    const nextDateCreated = 'dateCreated' in updates
      ? updates.dateCreated
      : existingProduct.dateCreated;
    const nextExpirationDate = 'expirationDate' in updates
      ? updates.expirationDate
      : existingProduct.expirationDate;

    const optimisticProduct = {
      ...existingProduct,
      stock: nextStock,
      stockQuantity: nextStock,
      dateCreated: nextDateCreated || existingProduct.dateCreated || '',
      expirationDate: nextExpirationDate || existingProduct.expirationDate || '',
      status: getProductStatus(nextStock),
    };

    setProducts((prev) => prev.map((product) => (
      String(product.id) === String(productId) ? optimisticProduct : product
    )));

    try {
      const requestBody = {
        stock_quantity: nextStock,
      };

      if (nextDateCreated) {
        requestBody.date_created = nextDateCreated;
      }

      if (nextExpirationDate) {
        requestBody.expiration_date = nextExpirationDate;
      }

      const savedProduct = await apiRequest(`/api/products/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      }, {
        auth: true,
        accessToken: session?.access_token,
      });

      const mappedProduct = upsertProductInState(savedProduct);
      await refreshInventory();
      return mappedProduct;
    } catch (error) {
      await Promise.all([
        refreshProducts(),
        refreshInventory(),
      ]);
      throw error;
    }
  }, [products, refreshInventory, refreshProducts, session, upsertProductInState]);

  const updateProductStock = useCallback(async (productId, amount, options = {}) => {
    const existingProduct = products.find((product) => (
      String(product.id) === String(productId)
    ));

    if (!existingProduct) {
      throw new Error('Product not found.');
    }

    const nextStock = Math.max(0, normalizeNumber(existingProduct.stock) + normalizeNumber(amount));

    return updateFinishedProductInventory(productId, {
      stock: nextStock,
      dateCreated: options.dateCreated ?? existingProduct.dateCreated,
      expirationDate: options.expirationDate ?? existingProduct.expirationDate,
    });
  }, [products, updateFinishedProductInventory]);

  const deleteProduct = useCallback(async (id) => {
    await apiRequest(`/api/products/${id}`, {
      method: 'DELETE',
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    setProducts((prev) => prev.filter((product) => product.id !== id));
    setInventoryItems((prev) => prev.filter((item) => String(item.productId) !== String(id)));
  }, [session]);

  const addInventoryItem = useCallback(async (item) => {
    const newQuantity = Math.max(0, normalizeNumber(item.quantity ?? item.stock));
    
    try {
      const createdItem = await apiRequest('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({
          product_name: item.productName || item.name || item.ingredientName,
          batch_id: item.batchId,
          stock_quantity: newQuantity,
          unit: item.unit || 'pcs',
          date_created: item.dateCreated || null,
          expiration_date: item.expirationDate || null,
          product_id: item.productId,
        }),
      }, {
        auth: true,
        accessToken: session?.access_token,
      });

      const mappedItem = mapInventoryItem(createdItem);
      setInventoryItems((prev) => [mappedItem, ...prev]);

      await Promise.all([
        refreshInventory(),
        refreshProducts(),
      ]);

      return mappedItem;
    } catch (error) {
      console.error('Error creating inventory:', error);
      throw error;
    }
  }, [session, refreshInventory, refreshProducts]);

  const editInventoryItem = useCallback(async (updatedItem) => {
    const newQuantity = Math.max(0, normalizeNumber(updatedItem.quantity ?? updatedItem.stock));
    
    try {
      const savedItem = await apiRequest(`/api/inventory/${updatedItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          product_name: updatedItem.productName || updatedItem.name || updatedItem.ingredientName,
          batch_id: updatedItem.batchId,
          stock_quantity: newQuantity,
          unit: updatedItem.unit || 'pcs',
          date_created: updatedItem.dateCreated || null,
          expiration_date: updatedItem.expirationDate || null,
          product_id: updatedItem.productId,
        }),
      }, {
        auth: true,
        accessToken: session?.access_token,
      });

      const mappedItem = mapInventoryItem(savedItem);
      setInventoryItems((prev) => prev.map((item) => (
        item.id === mappedItem.id ? mappedItem : item
      )));

      await Promise.all([
        refreshInventory(),
        refreshProducts(),
      ]);

      return mappedItem;
    } catch (error) {
      console.error('Error updating inventory:', error);
      throw error;
    }
  }, [session, refreshInventory, refreshProducts]);

  const deleteInventoryItem = useCallback(async (id) => {
    await apiRequest(`/api/inventory/${id}`, {
      method: 'DELETE',
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    setInventoryItems((prev) => prev.filter((item) => item.id !== id));

    await Promise.all([
      refreshInventory(),
      refreshProducts(),
    ]);
  }, [session, refreshInventory, refreshProducts]);

  const validateStockAvailability = useCallback((lineItems = []) => {
    const shortages = [];

    lineItems.forEach((item) => {
      const quantity = Math.max(0, normalizeNumber(item.quantity));
      const matchingProduct = products.find((product) => (
        String(product.id) === String(item.productId || item.product_id)
          || product.name.toLowerCase() === String(item.name || '').trim().toLowerCase()
      ));

      const availableStock = Math.max(0, normalizeNumber(matchingProduct?.stock));
      if (!matchingProduct || availableStock < quantity) {
        shortages.push({
          id: matchingProduct?.id || item.productId || item.product_id || item.name,
          name: matchingProduct?.name || item.name || 'Unknown product',
          requested: quantity,
          available: availableStock,
        });
      }
    });

    return {
      isAvailable: shortages.length === 0,
      shortages,
    };
  }, [products]);

  const reduceProductStock = useCallback((lineItems = []) => {
    setProducts((prev) => prev.map((product) => {
      const matchingItem = lineItems.find((item) => (
        String(product.id) === String(item.productId || item.product_id)
          || product.name.toLowerCase() === String(item.name || '').trim().toLowerCase()
      ));

      if (!matchingItem) {
        return product;
      }

      const deductedQuantity = Math.max(0, normalizeNumber(matchingItem.quantity));
      const nextStock = Math.max(0, normalizeNumber(product.stock) - deductedQuantity);

      return {
        ...product,
        stock: nextStock,
        stockQuantity: nextStock,
        status: getProductStatus(nextStock),
      };
    }));
  }, []);

  return (
    <ProductContext.Provider
      value={{
        products,
        inventoryItems,
        isProductsLoading,
        addProduct,
        editProduct,
        deleteProduct,
        updateProductStock,
        updateFinishedProductInventory,
        addInventoryItem,
        editInventoryItem,
        deleteInventoryItem,
        refreshProducts,
        refreshInventory,
        validateStockAvailability,
        reduceProductStock,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
};

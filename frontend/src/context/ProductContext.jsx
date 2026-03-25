/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, isBackendIssueError } from '../lib/api';
import { useAuth } from './AuthContext';

const ProductContext = createContext();
const DEFAULT_IMAGE = '/logo.png';

const normalizeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getProductStatus = (stock) => {
  if (stock <= 0) return 'out';
  if (stock <= 10) return 'low';
  return 'active';
};

const getInventoryStatus = (stock) => {
  if (stock <= 0) return 'out of stock';
  if (stock <= 10) return 'low stock';
  return 'in stock';
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
    imageUrl: product.imageUrl || product.image_url || DEFAULT_IMAGE,
    image: product.imageUrl || product.image_url || DEFAULT_IMAGE,
    soldCount: normalizeNumber(product.soldCount),
    type: 'product',
    createdAt: product.createdAt || product.created_at || '',
    updatedAt: product.updatedAt || product.updated_at || '',
  };
};

const mapInventoryItem = (item) => {
  const stock = Math.max(0, normalizeNumber(item.stockQuantity ?? item.stock_quantity));

  return {
    id: item.id,
    name: item.ingredientName || item.ingredient_name || '',
    ingredientName: item.ingredientName || item.ingredient_name || '',
    stock,
    stockQuantity: stock,
    unit: item.unit || '',
    status: item.status || getInventoryStatus(stock),
    image: DEFAULT_IMAGE,
    type: 'ingredient',
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
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const mappedProduct = mapProduct(createdProduct);
    setProducts((prev) => [mappedProduct, ...prev]);
    return mappedProduct;
  }, [session]);

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
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const mappedProduct = mapProduct(savedProduct);
    setProducts((prev) => prev.map((product) => (
      product.id === mappedProduct.id ? mappedProduct : product
    )));
    return mappedProduct;
  }, [session]);

  const deleteProduct = useCallback(async (id) => {
    await apiRequest(`/api/products/${id}`, {
      method: 'DELETE',
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    setProducts((prev) => prev.filter((product) => product.id !== id));
  }, [session]);

  const addInventoryItem = useCallback(async (item) => {
    const createdItem = await apiRequest('/api/inventory', {
      method: 'POST',
      body: JSON.stringify({
        ingredient_name: item.name || item.ingredientName,
        stock_quantity: Math.max(0, normalizeNumber(item.stock)),
        unit: item.unit || 'pcs',
        status: item.status,
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const mappedItem = mapInventoryItem(createdItem);
    setInventoryItems((prev) => [mappedItem, ...prev]);
    return mappedItem;
  }, [session]);

  const editInventoryItem = useCallback(async (updatedItem) => {
    const savedItem = await apiRequest(`/api/inventory/${updatedItem.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ingredient_name: updatedItem.name || updatedItem.ingredientName,
        stock_quantity: Math.max(0, normalizeNumber(updatedItem.stock)),
        unit: updatedItem.unit || 'pcs',
        status: updatedItem.status,
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const mappedItem = mapInventoryItem(savedItem);
    setInventoryItems((prev) => prev.map((item) => (
      item.id === mappedItem.id ? mappedItem : item
    )));
    return mappedItem;
  }, [session]);

  const deleteInventoryItem = useCallback(async (id) => {
    await apiRequest(`/api/inventory/${id}`, {
      method: 'DELETE',
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    setInventoryItems((prev) => prev.filter((item) => item.id !== id));
  }, [session]);

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

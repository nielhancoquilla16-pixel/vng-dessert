import React, { createContext, useContext, useState, useEffect } from 'react';

const ProductContext = createContext();

export const useProducts = () => {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  return context;
};

export const ProductProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [isProductsLoading, setIsProductsLoading] = useState(true);

  // Initialize products from localStorage asynchronously to simulate DB fetch
  useEffect(() => {
    const fetchProducts = async () => {
      // Simulate network delay for skeleton loaders
      await new Promise(resolve => setTimeout(resolve, 800));
      const saved = localStorage.getItem('vng_products');
      if (saved) {
        setProducts(JSON.parse(saved));
      }
      setIsProductsLoading(false);
    };
    fetchProducts();
  }, []);
  // Save products to localStorage whenever they change (skip during initial load)
  useEffect(() => {
    if (!isProductsLoading) {
      localStorage.setItem('vng_products', JSON.stringify(products));
    }
  }, [products, isProductsLoading]);


  const addProduct = (product) => {
    setProducts([...products, { 
      ...product, 
      id: Date.now(),
      price: typeof product.price === 'string' ? parseInt(product.price) : product.price,
      stock: typeof product.stock === 'string' ? parseInt(product.stock) : product.stock
    }]);
  };

  const editProduct = (updatedProduct) => {
    setProducts(products.map(p => p.id === updatedProduct.id ? {
      ...updatedProduct,
      price: typeof updatedProduct.price === 'string' ? parseInt(updatedProduct.price) : updatedProduct.price,
      stock: typeof updatedProduct.stock === 'string' ? parseInt(updatedProduct.stock) : updatedProduct.stock
    } : p));
  };

  const deleteProduct = (id) => {
    setProducts(products.filter(p => p.id !== id));
  };

  return (
    <ProductContext.Provider value={{ products, isProductsLoading, addProduct, editProduct, deleteProduct }}>
      {children}
    </ProductContext.Provider>
  );
};

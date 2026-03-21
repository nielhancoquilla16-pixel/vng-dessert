import React, { useState } from 'react';
import { Search, Plus, Edit, Trash2, X } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import './AdminProducts.css';

const AdminProducts = () => {
  const { products, addProduct, editProduct, deleteProduct } = useProducts();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);

  const productCategories = Array.from(new Set(
    products
      .filter(p => p.type === 'product' || !p.type)
      .map(p => p.category)
      .filter(Boolean)
      .map(cat => cat.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '))
  )).sort();
  
  const categories = ['All', ...productCategories];

  const filteredProducts = products.filter(p => {
    const isProduct = p.type === 'product' || !p.type;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || (p.category && p.category.toLowerCase() === selectedCategory.toLowerCase());
    return isProduct && matchesSearch && matchesCategory;
  });

  const handleOpenModal = (product = null) => {
    setCurrentProduct(product || { name: '', price: '', stock: '', category: 'Puddings', description: '', image: '', status: 'active', type: 'product' });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const stock = parseInt(currentProduct.stock) || 0;
    const liveStatus = stock === 0 ? 'out' : stock <= 10 ? 'low' : 'active';
    const productToSave = { ...currentProduct, stock, status: liveStatus };
    if (currentProduct.id) {
      await editProduct(productToSave);
    } else {
      await addProduct(productToSave);
    }
    setIsModalOpen(false);
  };

  return (
    <div>
      <div className="admin-products-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Product Management</h1>
          <p style={{ color: '#64748b' }}>Manage your dessert products</p>
        </div>
        
        <div className="search-and-add">
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input 
              type="text" 
              placeholder="Search products..." 
              className="admin-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="btn-add-item" onClick={() => handleOpenModal()}>
            <Plus size={20} /> Add Items
          </button>
        </div>
      </div>

      {/* Category Filters */}
      <div className="admin-filters">
        {categories.map(cat => (
          <button 
            key={cat} 
            className={`filter-pill ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="admin-product-grid">
        {filteredProducts.map(product => (
          <div key={product.id} className="admin-product-card">
            <div className="card-top">
              <span className="card-category-tag">{product.category}</span>
              <span className={`card-status-tag status-${product.stock === 0 ? 'out' : product.stock <= 10 ? 'low' : 'active'}`}>
                {product.stock === 0 ? 'out' : product.stock <= 10 ? 'low' : 'active'}
              </span>
              <img src={product.image} alt={product.name} className="card-product-img" />
            </div>
            
            <div className="card-bottom">
              <h3 className="card-title">{product.name}</h3>
              <p className="card-desc">{product.description}</p>
              
              <div className="card-meta">
                <div className="card-price">₱{product.price}.00</div>
                <div className="card-stock">{product.stock} in stock</div>
              </div>

              <div className="card-actions">
                <button className="btn-card-edit" onClick={() => handleOpenModal(product)}>
                  <Edit size={16} /> Edit
                </button>
                <button className="btn-card-delete" onClick={() => deleteProduct(product.id)}>
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="admin-products-header" style={{ marginBottom: '1.5rem' }}>
              <h2>{currentProduct.id ? 'Edit Product' : 'Add New Product'}</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-form-group">
                <label>Product Name</label>
                <input 
                  className="modal-input" 
                  value={currentProduct.name}
                  onChange={(e) => setCurrentProduct({...currentProduct, name: e.target.value})}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="modal-form-group">
                  <label>Price (₱)</label>
                  <input 
                    type="text" 
                    className="modal-input" 
                    value={currentProduct.price}
                    onChange={(e) => setCurrentProduct({...currentProduct, price: e.target.value})}
                    required
                  />
                </div>
                <div className="modal-form-group">
                  <label>Stock</label>
                  <input 
                    type="text" 
                    className="modal-input" 
                    value={currentProduct.stock}
                    onChange={(e) => setCurrentProduct({...currentProduct, stock: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="modal-form-group">
                <label>Category</label>
                <input 
                  list="category-options"
                  className="modal-input"
                  value={currentProduct.category}
                  onChange={(e) => setCurrentProduct({...currentProduct, category: e.target.value})}
                  placeholder="Select or type a category"
                />
                <datalist id="category-options">
                  {categories.filter(c => c !== 'All').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </datalist>
              </div>

              <div className="modal-form-group">
                <label>Image URL</label>
                <input 
                  className="modal-input" 
                  value={currentProduct.image}
                  onChange={(e) => setCurrentProduct({...currentProduct, image: e.target.value})}
                  placeholder="https://..."
                />
              </div>

              <div className="modal-form-group">
                <label>Description</label>
                <textarea 
                  className="modal-input" 
                  style={{ height: '100px', resize: 'none' }}
                  value={currentProduct.description}
                  onChange={(e) => setCurrentProduct({...currentProduct, description: e.target.value})}
                ></textarea>
              </div>

              <button type="submit" className="btn-add-item" style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                {currentProduct.id ? 'Save Changes' : 'Add Product'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProducts;

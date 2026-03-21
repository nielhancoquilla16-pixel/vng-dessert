import React, { useState } from 'react';
import { CheckSquare, AlertTriangle, XCircle, Plus, Search, X } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import './AdminInventory.css';

const AdminInventory = () => {
  const { products, editProduct, addProduct } = useProducts();
  const [viewMode, setViewMode] = useState('products'); // 'products' or 'ingredients'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newIngredient, setNewIngredient] = useState({ name: '', stock: '', category: 'Dairy', description: '', type: 'ingredient', image: 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&q=80&w=800' });

  const handleAdjustStock = (product, delta) => {
    const newStock = Math.max(0, product.stock + delta);
    const newStatus = newStock === 0 ? 'out' : (newStock < 10 ? 'low' : 'active');
    editProduct({ ...product, stock: newStock, status: newStatus });
  };

  const handleAddIngredient = (e) => {
    e.preventDefault();
    addProduct({ ...newIngredient, stock: parseInt(newIngredient.stock) || 0, price: 0, status: 'active' });
    setIsModalOpen(false);
    setNewIngredient({ name: '', stock: '', category: 'Dairy', description: '', type: 'ingredient', image: 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&q=80&w=800' });
  };

  const filteredItems = products.filter(p => p.type === (viewMode === 'products' ? 'product' : 'ingredient'));

  const inStockCount = filteredItems.filter(p => p.stock > 10).length;
  const lowStockCount = filteredItems.filter(p => p.stock > 0 && p.stock <= 10).length;
  const outOfStockCount = filteredItems.filter(p => p.stock === 0).length;

  return (
    <div>
      <div className="admin-products-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Inventory</h1>
          <p style={{ color: '#64748b' }}>Track and manage {viewMode} stock levels</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
           <div className="admin-filters" style={{ margin: 0, background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
            <button 
              className={`filter-pill ${viewMode === 'products' ? 'active' : ''}`}
              onClick={() => setViewMode('products')}
              style={{ padding: '0.5rem 1.25rem' }}
            >
              Finished Products
            </button>
            <button 
              className={`filter-pill ${viewMode === 'ingredients' ? 'active' : ''}`}
              onClick={() => setViewMode('ingredients')}
              style={{ padding: '0.5rem 1.25rem' }}
            >
              Ingredients
            </button>
          </div>
          {viewMode === 'ingredients' && (
            <button className="btn-add-item" onClick={() => setIsModalOpen(true)}>
              <Plus size={20} /> Add Ingredient
            </button>
          )}
        </div>
      </div>

      <div className="inventory-summary">
        <div className="inventory-card">
          <div className="inv-icon-box inv-green"><CheckSquare size={24} /></div>
          <div>
            <div className="inv-value">{inStockCount}</div>
            <div className="inv-label">In Stock</div>
          </div>
        </div>
        <div className="inventory-card">
          <div className="inv-icon-box inv-orange"><AlertTriangle size={24} /></div>
          <div>
            <div className="inv-value">{lowStockCount}</div>
            <div className="inv-label">Low Stock</div>
          </div>
        </div>
        <div className="inventory-card">
          <div className="inv-icon-box inv-red"><XCircle size={24} /></div>
          <div>
            <div className="inv-value">{outOfStockCount}</div>
            <div className="inv-label">Out of Stock</div>
          </div>
        </div>
      </div>

      <div className="recent-orders-card" style={{ padding: '0' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '2rem' }}>{viewMode === 'products' ? 'PRODUCT' : 'INGREDIENT'}</th>
              <th>CATEGORY</th>
              <th>STOCK LEVEL</th>
              <th>COUNT</th>
              <th>STATUS</th>
              <th style={{ paddingRight: '2rem' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const stockPercent = Math.min(100, (item.stock / 100) * 100);
              const liveStatus = item.stock === 0 ? 'out' : item.stock <= 10 ? 'low' : 'active';
              const barColor = item.stock === 0 ? 'bar-red' : (item.stock <= 10 ? 'bar-orange' : 'bar-green');
              
              return (
                <tr key={item.id}>
                  <td style={{ paddingLeft: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <img src={item.image} alt="" style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }} />
                      <span style={{ fontWeight: 700 }}>{item.name}</span>
                    </div>
                  </td>
                  <td style={{ color: '#64748b' }}>{item.category}</td>
                  <td>
                    <div className="stock-level-container">
                      <div className={`stock-level-bar ${barColor}`} style={{ width: `${stockPercent}%` }}></div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 700 }}>{item.stock}</td>
                  <td>
                    <span className={`status-badge status-${liveStatus}`}>
                      {liveStatus}
                    </span>
                  </td>
                  <td style={{ paddingRight: '2rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-adj btn-neg" onClick={() => handleAdjustStock(item, -5)}>-5</button>
                      <button className="btn-adj btn-pos-10" onClick={() => handleAdjustStock(item, 10)}>+10</button>
                      <button className="btn-adj btn-pos-25" onClick={() => handleAdjustStock(item, 25)}>+25</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="admin-products-header" style={{ marginBottom: '1.5rem' }}>
              <h2>Add New Ingredient</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddIngredient}>
              <div className="modal-form-group">
                <label>Ingredient Name</label>
                <input 
                  className="modal-input" 
                  value={newIngredient.name}
                  onChange={(e) => setNewIngredient({...newIngredient, name: e.target.value})}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Initial Stock Count</label>
                <input 
                  type="text" 
                  className="modal-input" 
                  value={newIngredient.stock}
                  onChange={(e) => setNewIngredient({...newIngredient, stock: e.target.value})}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Category</label>
                <input 
                  list="inventory-category-options"
                  className="modal-input"
                  value={newIngredient.category}
                  onChange={(e) => setNewIngredient({...newIngredient, category: e.target.value})}
                  placeholder="Select or type a category"
                />
                <datalist id="inventory-category-options">
                  <option value="Dairy">Dairy</option>
                  <option value="Canned Goods">Canned Goods</option>
                  <option value="Flavorings">Flavorings</option>
                  <option value="Packaging">Packaging</option>
                  <option value="Other">Other</option>
                </datalist>
              </div>

              <button type="submit" className="btn-add-item" style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                Add to Inventory
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminInventory;
